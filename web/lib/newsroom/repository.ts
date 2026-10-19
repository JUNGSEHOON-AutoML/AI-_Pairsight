import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { CaseError, type CaseRecord, type CaseInput, type CaseEvent, type NewEvent } from "./model";

/** Local pilot persistence. SQLite transactions serialize writers from Next and the worker process. */
export class CaseRepository {
  readonly db: DatabaseSync;
  constructor(path = process.env.PAIRSIGHT_CASE_DB ?? join(process.cwd(), ".newsroom", "cases.sqlite")) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, record TEXT NOT NULL); CREATE TABLE IF NOT EXISTS case_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT NOT NULL);");
    if (path !== ":memory:") chmodSync(path, 0o600);
  }
  close() { this.db.close(); }
  get(id: string): CaseRecord | null {
    const row = this.db.prepare("SELECT record FROM cases WHERE id=?").get(id) as { record: string } | undefined;
    return row ? JSON.parse(row.record) : null;
  }
  list(includeFixtures = false): CaseRecord[] {
    const rows = this.db.prepare("SELECT record FROM cases ORDER BY rowid DESC").all() as { record: string }[];
    return rows.map(r => JSON.parse(r.record) as CaseRecord).filter(c => includeFixtures || c.input.origin !== "fixture");
  }
  create(input: CaseInput): CaseRecord {
    const now = new Date().toISOString();
    const c: CaseRecord = { id: randomUUID(), revision: 0, createdAt: now, updatedAt: now, stage: "intake", status: "ready", input,
      sections: {}, approvals: [], publicCase: null, evaluation: null, run: null };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO cases(id,record) VALUES(?,?)").run(c.id, JSON.stringify(c));
      this.append({ caseId: c.id, department: "intake", state: "ready", at: now, summary: "사건 접수", cite: [] });
      this.db.exec("COMMIT"); return c;
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  mutate(id: string, fn: (c: CaseRecord, emit: (e: Omit<NewEvent, "caseId" | "at">) => void) => void): CaseRecord {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const c = this.get(id);
      if (!c) throw new CaseError("not_found", "사건을 찾지 못했어요.");
      const now = new Date().toISOString();
      fn(c, e => this.append({ ...e, caseId: id, at: now }));
      c.revision++; c.updatedAt = now;
      this.db.prepare("UPDATE cases SET record=? WHERE id=?").run(JSON.stringify(c), id);
      this.db.exec("COMMIT"); return c;
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  private append(event: NewEvent) { this.db.prepare("INSERT INTO case_events(record) VALUES(?)").run(JSON.stringify(event)); }
  events(after = 0, limit = 500): CaseEvent[] {
    const rows = this.db.prepare("SELECT seq,record FROM case_events WHERE seq>? ORDER BY seq LIMIT ?").all(after, Math.min(limit, 1000)) as { seq: number; record: string }[];
    return rows.map(r => ({ ...JSON.parse(r.record), seq: r.seq }));
  }
  allEvents(): CaseEvent[] {
    const rows = this.db.prepare("SELECT seq,record FROM case_events ORDER BY seq").all() as { seq: number; record: string }[];
    return rows.map(r => ({ ...JSON.parse(r.record), seq: r.seq }));
  }
}
const globalStore = globalThis as unknown as { newsroomRepository?: CaseRepository };
export const caseRepository = () => globalStore.newsroomRepository ??= new CaseRepository();
