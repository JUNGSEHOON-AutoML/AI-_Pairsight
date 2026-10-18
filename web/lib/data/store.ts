// Data layer. Same operations and rules as replica/schema.sql (shared analyses by input key,
// atomic daily quota with refund on failure, cascade on account delete), backed by memory for now.
// Swapping in Supabase means a second implementation of DataStore; screens and routes do not change.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Analysis, type Check, STEP_ORDER, type StepState } from "../domain";

export interface User {
  id: string;
  email: string | null; // null = anonymous
  dailyLimit: number;
  createdAt: string;
}

export interface QuotaResult {
  ok: boolean;
  used: number;
  limit: number;
  day: string;
}

export interface DataStore {
  createAnonymousUser(): Promise<User>;
  getUser(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  linkEmail(userId: string, email: string): Promise<User>;
  deleteUser(userId: string): Promise<void>;

  usage(userId: string): Promise<QuotaResult>;
  takeQuota(userId: string): Promise<QuotaResult>;
  refundQuota(userId: string, day: string): Promise<void>;

  findReusableAnalysis(inputKey: string, pipelineVersion: number): Promise<Analysis | null>;
  createAnalysis(inputKey: string, pipelineVersion: number): Promise<Analysis>;
  getAnalysis(id: string): Promise<Analysis | null>;
  updateAnalysis(id: string, patch: Partial<Analysis>): Promise<Analysis>;

  createCheck(c: Omit<Check, "id" | "createdAt">): Promise<Check>;
  getCheck(id: string): Promise<Check | null>;
  listChecks(userId: string): Promise<Check[]>;
  listChecksForAnalysis(analysisId: string): Promise<Check[]>;
  updateCheck(id: string, patch: Partial<Check>): Promise<Check>;

  saveUpload(checkId: string, bytes: Uint8Array, mime: string): Promise<void>;
  readUpload(checkId: string): Promise<{ bytes: Uint8Array; mime: string } | null>;

  createLoginToken(userId: string, email: string): Promise<string>;
  consumeLoginToken(token: string): Promise<{ userId: string; email: string } | null>;
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const LIMIT_ANON = Number(process.env.PAIRSIGHT_LIMIT_ANON ?? 3);
const LIMIT_SIGNED_IN = Number(process.env.PAIRSIGHT_LIMIT_SIGNED_IN ?? 10);
const UPLOAD_DIR = join(process.cwd(), ".data", "uploads");

class MemoryStore implements DataStore {
  users = new Map<string, User>();
  usageDays = new Map<string, number>(); // `${userId}|${day}` -> used
  analyses = new Map<string, Analysis>();
  checks = new Map<string, Check>();
  uploadsMime = new Map<string, string>();
  tokens = new Map<string, { userId: string; email: string; expires: number }>();

  async createAnonymousUser() {
    const u: User = { id: randomUUID(), email: null, dailyLimit: LIMIT_ANON, createdAt: new Date().toISOString() };
    this.users.set(u.id, u);
    return u;
  }
  async getUser(id: string) {
    return this.users.get(id) ?? null;
  }
  async findUserByEmail(email: string) {
    for (const u of this.users.values()) if (u.email === email) return u;
    return null;
  }
  async linkEmail(userId: string, email: string) {
    // Same id before and after sign-in, like Supabase anonymous → permanent linking: history is kept.
    const u = this.users.get(userId);
    if (!u) throw new Error("no such user");
    const next = { ...u, email, dailyLimit: Math.max(u.dailyLimit, LIMIT_SIGNED_IN) };
    this.users.set(userId, next);
    return next;
  }
  async deleteUser(userId: string) {
    for (const [id, c] of this.checks) {
      if (c.userId !== userId) continue;
      this.checks.delete(id);
      await rm(join(UPLOAD_DIR, id), { force: true });
      this.uploadsMime.delete(id);
    }
    for (const key of this.usageDays.keys()) if (key.startsWith(`${userId}|`)) this.usageDays.delete(key);
    this.users.delete(userId);
    // analyses stay: they are shared and hold no uploaded file (schema.sql: on delete restrict from checks only).
  }

  async usage(userId: string): Promise<QuotaResult> {
    const day = utcDay();
    const limit = this.users.get(userId)?.dailyLimit ?? 0;
    const used = this.usageDays.get(`${userId}|${day}`) ?? 0;
    return { ok: used < limit, used, limit, day };
  }
  async takeQuota(userId: string): Promise<QuotaResult> {
    // Single synchronous section: the JS event loop makes this atomic, like take_quota()'s single upsert.
    const day = utcDay();
    const limit = this.users.get(userId)?.dailyLimit ?? 0;
    const key = `${userId}|${day}`;
    const used = this.usageDays.get(key) ?? 0;
    if (limit <= 0 || used >= limit) return { ok: false, used, limit, day };
    this.usageDays.set(key, used + 1);
    return { ok: true, used: used + 1, limit, day };
  }
  async refundQuota(userId: string, day: string) {
    const key = `${userId}|${day}`;
    this.usageDays.set(key, Math.max((this.usageDays.get(key) ?? 0) - 1, 0));
  }

  async findReusableAnalysis(inputKey: string, pipelineVersion: number) {
    let best: Analysis | null = null;
    for (const a of this.analyses.values()) {
      if (a.inputKey !== inputKey || a.pipelineVersion !== pipelineVersion || a.status === "failed") continue;
      if (!best || a.startedAt > best.startedAt) best = a;
    }
    return best;
  }
  async createAnalysis(inputKey: string, pipelineVersion: number) {
    const a: Analysis = {
      id: randomUUID(),
      inputKey,
      pipelineVersion,
      status: "pending",
      steps: Object.fromEntries(STEP_ORDER.map((s) => [s, "waiting" as StepState])) as Analysis["steps"],
      verdict: null,
      verdictReason: null,
      errorCode: null,
      evidence: [],
      matches: [],
      searchedProviders: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.analyses.set(a.id, a);
    return a;
  }
  async getAnalysis(id: string) {
    return this.analyses.get(id) ?? null;
  }
  async updateAnalysis(id: string, patch: Partial<Analysis>) {
    const a = this.analyses.get(id);
    if (!a) throw new Error("no such analysis");
    const next = { ...a, ...patch, steps: { ...a.steps, ...(patch.steps ?? {}) } };
    this.analyses.set(id, next);
    return next;
  }

  async createCheck(c: Omit<Check, "id" | "createdAt">) {
    const check: Check = { ...c, id: randomUUID(), createdAt: new Date().toISOString() };
    this.checks.set(check.id, check);
    return check;
  }
  async getCheck(id: string) {
    return this.checks.get(id) ?? null;
  }
  async listChecks(userId: string) {
    return [...this.checks.values()].filter((c) => c.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async listChecksForAnalysis(analysisId: string) {
    return [...this.checks.values()].filter((c) => c.analysisId === analysisId);
  }
  async updateCheck(id: string, patch: Partial<Check>) {
    const c = this.checks.get(id);
    if (!c) throw new Error("no such check");
    const next = { ...c, ...patch };
    this.checks.set(id, next);
    return next;
  }

  async saveUpload(checkId: string, bytes: Uint8Array, mime: string) {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, checkId), bytes);
    this.uploadsMime.set(checkId, mime);
  }
  async readUpload(checkId: string) {
    const mime = this.uploadsMime.get(checkId);
    if (!mime) return null;
    try {
      return { bytes: new Uint8Array(await readFile(join(UPLOAD_DIR, checkId))), mime };
    } catch {
      return null;
    }
  }

  async createLoginToken(userId: string, email: string) {
    const token = randomBytes(24).toString("base64url");
    this.tokens.set(token, { userId, email, expires: Date.now() + 15 * 60_000 });
    return token;
  }
  async consumeLoginToken(token: string) {
    const t = this.tokens.get(token);
    this.tokens.delete(token); // single use
    if (!t || t.expires < Date.now()) return null;
    return { userId: t.userId, email: t.email };
  }
}

// One instance per server process, surviving dev hot reloads.
const g = globalThis as unknown as { __pairsightStore?: DataStore };
export function getStore(): DataStore {
  g.__pairsightStore ??= new MemoryStore();
  return g.__pairsightStore;
}
