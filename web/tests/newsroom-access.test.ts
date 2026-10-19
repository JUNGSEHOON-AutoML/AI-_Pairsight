import { afterEach, describe, expect, it } from "vitest";
import { scryptSync } from "node:crypto";
import { CaseRepository } from "../lib/newsroom/repository";
import { OperatorAuth } from "../lib/newsroom/operator-auth";
import { GoogleFactCheckFeed } from "../lib/newsroom/factcheck-feed";
const repos: CaseRepository[] = [];
afterEach(() => { repos.splice(0).forEach(r => r.close()); delete process.env.GOOGLE_FACTCHECK_API_KEY; });
describe("operator access and real feed boundary", () => {
  it("requires a provisioned password, rejects anonymous/public session IDs, and revokes logout", () => {
    const r = new CaseRepository(":memory:"); repos.push(r);
    const salt = "test-only-salt", auth = new OperatorAuth(r, () => [{ id: "editor", salt, digest: scryptSync("long-test-only-password", salt, 64).toString("hex") }]);
    expect(auth.verify("public-session-user-id")).toBeNull();
    expect(() => auth.login("editor", "wrong")).toThrow();
    const token = auth.login("editor", "long-test-only-password");
    expect(auth.verify(token)).toBe("editor");
    const stored = JSON.stringify(r.db.prepare("SELECT * FROM operator_sessions").all());
    expect(stored).not.toContain(token);
    auth.logout(token); expect(auth.verify(token)).toBeNull();
  });
  it("throttles repeated password attempts", () => {
    const r = new CaseRepository(":memory:"); repos.push(r); const auth = new OperatorAuth(r, () => []);
    for (let i = 0; i < 5; i++) expect(() => auth.login("unknown", "wrong")).toThrow();
    expect(() => auth.login("unknown", "wrong")).toThrow("15분");
  });
  it("queries Korean fact checks, bounds retained text, and never turns a publisher rating into our verdict", async () => {
    process.env.GOOGLE_FACTCHECK_API_KEY = "fake-test-only-value";
    let calls = 0;
    const feed = new GoogleFactCheckFeed(async req => {
      calls++; const u = new URL(String(req));
      expect(u.origin).toBe("https://factchecktools.googleapis.com");
      expect(u.searchParams.get("languageCode")).toBe("ko");
      return Response.json({ claims: [{ text: "주장".repeat(300), claimReview: [{ url: "https://review.example/article", publisher: { name: "출처".repeat(100) }, textualRating: "False", reviewDate: "2026-01-01" }] }] });
    });
    const [item] = await feed.search("사진", AbortSignal.timeout(1000));
    expect(calls).toBe(1); expect([...item.claim + item.publisher + item.rating].length).toBeLessThanOrEqual(200);
    expect(item).not.toHaveProperty("verdict");
  });
  it("does not retry a 429 and hides credentials even in an upstream error body", async () => {
    process.env.GOOGLE_FACTCHECK_API_KEY = "fake-test-only-secret";
    let calls = 0;
    const feed = new GoogleFactCheckFeed(async () => { calls++; return new Response("fake-test-only-secret raw error", { status: 429 }); });
    await expect(feed.search("사진", AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "factcheck_rate_limit" });
    expect(calls).toBe(1);
  });
});
