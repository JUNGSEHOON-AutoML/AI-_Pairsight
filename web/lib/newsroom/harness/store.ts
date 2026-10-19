import { mkdirSync, writeFileSync, readFileSync, renameSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DESKS, type Desk } from "../desks";
import { CaseError } from "../model";
import { newsroomRoot, digest } from "./guard";
import { validateReport } from "./validator";

export class ReportStore {
  constructor(readonly root = newsroomRoot()) {}
  private directory(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new CaseError("report_path", "사건 경로가 올바르지 않아요.");
    for (const dir of [this.root, join(this.root, "cases"), join(this.root, "cases", id)]) {
      if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new CaseError("report_path", "보고서 링크 경로는 사용할 수 없어요.");
      mkdirSync(dir, {recursive: true, mode: 0o700});
    }
    return join(this.root, "cases", id);
  }
  read(id: string, desk: Desk): string | null {
    const path = join(this.directory(id), DESKS.find(d => d.id === desk)!.file);
    if (!existsSync(path)) return null;
    if (lstatSync(path).isSymbolicLink()) throw new CaseError("report_path", "보고서 링크 경로는 사용할 수 없어요.");
    return readFileSync(path, "utf8");
  }
  write(id: string, desk: Desk, text: string, evidenceIds: string[]) {
    const meta = validateReport(text, {caseId: id, desk, evidenceIds});
    const dir = this.directory(id), temp = join(dir, `.${randomUUID()}.tmp`);
    writeFileSync(temp, text, {mode: 0o600, flag: "wx"});
    renameSync(temp, join(dir, DESKS.find(d => d.id === desk)!.file));
    return { ...meta, hash: digest(text) };
  }
}
