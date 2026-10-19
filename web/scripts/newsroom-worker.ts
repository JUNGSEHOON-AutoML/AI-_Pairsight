import { setTimeout as sleep } from "node:timers/promises";
import { caseRepository } from "../lib/newsroom/repository";
import { createNewsroomWorkers } from "../lib/newsroom/workers";
import { runDesks } from "../lib/newsroom/desk-flow";
import { writeBriefing } from "../lib/newsroom/briefing";
import { migrateLegacyReports } from "../lib/newsroom/legacy-reports";
async function main() {
const repo = caseRepository(), workers = createNewsroomWorkers(repo);
migrateLegacyReports(repo);
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopped = true; });
console.log("편집국 워커 시작: 실제 사건만 처리. 승인 대기·실패 시 중단.");
while (!stopped) {
  const c = repo.list().find(c => c.status === "ready" || c.run && c.run.expiresAt <= Date.now());
  if (c) {
    try { const result = await runDesks(repo, c.id, workers); console.log(JSON.stringify({ caseId: c.id, stage: result.stage, status: result.status })); }
    catch { console.log("사건 작업을 시작하지 못했습니다. 오류 원문은 숨겼습니다."); }
  }
  for (const item of repo.list().filter(x => ["failed", "awaiting_approval", "complete", "rejected", "withdrawn"].includes(x.status))) {
    if (stopped) break;
    try { await writeBriefing(repo, "case", item.id); } catch { console.log("브리핑 저장을 완료하지 못했습니다."); }
  }
  if (!stopped) { try { await writeBriefing(repo, "daily"); } catch { console.log("일일 브리핑 저장을 완료하지 못했습니다."); } }
  if (!stopped) await sleep(1000);
}
repo.close();

}
main().catch(() => { console.error("워커가 중단됐습니다. 사건 기록과 서버 설정을 확인하세요."); process.exitCode = 1; });
