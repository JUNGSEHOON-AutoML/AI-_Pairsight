import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import type { CaseRepository } from "./repository";
import { CaseError } from "./model";

export interface Operator { id: string; salt: string; digest: string }
const fingerprint = (v: string) => createHash("sha256").update(v).digest("hex");
export class OperatorAuth {
  constructor(private repo: CaseRepository, private users = () => {
    try { return JSON.parse(readFileSync(process.env.PAIRSIGHT_OPERATOR_FILE ?? join(process.cwd(), ".newsroom", "operators.json"), "utf8")) as Operator[]; }
    catch { return []; }
  }) {
    repo.db.exec("CREATE TABLE IF NOT EXISTS operator_sessions(hash TEXT PRIMARY KEY,operator TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS login_limits(name TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS feed_cache(query TEXT PRIMARY KEY,record TEXT NOT NULL,created INTEGER NOT NULL);");
  }
  configured() { return this.users().length > 0; }
  login(id: string, password: string): string {
    if (id.length > 80 || password.length > 256) throw new CaseError("login_failed", "로그인 정보를 확인해 주세요.");
    const now = Date.now(), key = fingerprint(id), db = this.repo.db;
    const limit = db.prepare("SELECT count,until FROM login_limits WHERE name=?").get(key) as { count: number; until: number } | undefined;
    if (limit && limit.until > now && limit.count >= 5) throw new CaseError("login_limited", "로그인 시도가 많아요. 15분 뒤 다시 시도해 주세요.");
    db.prepare("INSERT OR REPLACE INTO login_limits(name,count,until) VALUES(?,?,?)").run(key, limit && limit.until > now ? limit.count + 1 : 1, limit && limit.until > now ? limit.until : now + 900_000);
    const user = this.users().find(u => u.id === id);
    const got = scryptSync(password, user?.salt ?? "missing-operator", 64);
    const want = user ? Buffer.from(user.digest, "hex") : Buffer.alloc(64);
    if (!user || got.length !== want.length || !timingSafeEqual(got, want)) throw new CaseError("login_failed", "로그인 정보를 확인해 주세요.");
    db.prepare("DELETE FROM login_limits WHERE name=?").run(key);
    db.prepare("DELETE FROM operator_sessions WHERE expires<?").run(now);
    const token = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO operator_sessions(hash,operator,expires) VALUES(?,?,?)").run(fingerprint(token), user.id, now + 8 * 3600_000);
    return token;
  }
  verify(token: string | undefined): string | null {
    if (!token || token.length > 100) return null;
    const row = this.repo.db.prepare("SELECT operator FROM operator_sessions WHERE hash=? AND expires>?").get(fingerprint(token), Date.now()) as { operator: string } | undefined;
    return row && this.users().some(u => u.id === row.operator) ? row.operator : null;
  }
  logout(token: string) { this.repo.db.prepare("DELETE FROM operator_sessions WHERE hash=?").run(fingerprint(token)); }
}
