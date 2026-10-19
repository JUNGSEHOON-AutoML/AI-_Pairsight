import { randomUUID } from "node:crypto";
import { CaseError, DEPARTMENTS, type CaseRecord, type Department } from "./model";
import type { CaseRepository } from "./repository";

export interface WorkerOutput { data: Record<string, unknown>; waitForApproval?: boolean }
export interface DepartmentWorker {
  department: Department;
  run(input: Readonly<CaseRecord>, signal: AbortSignal): Promise<WorkerOutput>;
}
export type Workers = Record<Department, DepartmentWorker>;

/** Only this orchestrator advances a case. Workers return their own section, never a replacement case. */
export async function runCase(repo: CaseRepository, id: string, workers: Workers, opts: { allowFixture?: boolean; timeoutMs?: number } = {}) {
  const token = randomUUID(), timeout = opts.timeoutMs ?? 480_000;
  let c = repo.get(id);
  if (!c) throw new CaseError("not_found", "사건을 찾지 못했어요.");
  if (c.input.origin === "fixture" && !opts.allowFixture) throw new CaseError("fixture_forbidden", "시연 사건은 실제 편집국에서 실행하지 않아요.");
  if (["awaiting_approval", "rejected", "withdrawn", "complete"].includes(c.status)) return c;
  // An expired process must be explicitly retried: never silently skip its unfinished department.
  if (c.run && c.run.expiresAt <= Date.now()) {
    return repo.mutate(id, (x, emit) => {
      const s = x.stage === "intake" || x.stage === "complete" ? null : x.sections[x.stage];
      if (s) { s.state = "failed"; s.finishedAt = new Date().toISOString(); s.durationMs = Date.now() - Date.parse(s.startedAt);
        s.error = { code: "worker_interrupted", message: "작업 프로세스가 중단됐어요. 이 단계에서 다시 실행해 주세요." }; }
      x.status = "failed"; x.run = null;
      emit({ department: x.stage, state: "failed", summary: "작업 중단 감지. 자동 건너뛰기 없음", cite: [] });
    });
  }
  c = repo.mutate(id, x => {
    if (x.run) throw new CaseError("busy", "이 사건은 이미 처리 중이에요.");
    x.run = { token, expiresAt: Date.now() + timeout * DEPARTMENTS.length + 30_000 };
  });
  for (const dept of DEPARTMENTS) {
    if (c.sections[dept.id]?.state === "done") continue;
    const start = Date.now(), controller = new AbortController();
    c = repo.mutate(id, (x, emit) => {
      if (x.run?.token !== token) throw new CaseError("stale_run", "작업 소유권이 바뀌었어요.");
      x.stage = dept.id; x.status = "running";
      x.sections[dept.id] = { department: dept.id, state: "running", attempt: (x.sections[dept.id]?.attempt ?? 0) + 1,
        startedAt: new Date(start).toISOString(), finishedAt: null, durationMs: null, data: {}, error: null };
      emit({ department: dept.id, state: "running", summary: dept.label + " 처리 시작", cite: [] });
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        workers[dept.id].run(structuredClone(c), controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new CaseError("worker_timeout", "부서 처리 시간이 초과됐어요. 이 단계에서 멈췄어요."));
        }, timeout); }),
      ]);
      controller.signal.throwIfAborted();
      c = repo.mutate(id, (x, emit) => {
        if (x.run?.token !== token) throw new CaseError("stale_run", "작업 소유권이 바뀌었어요.");
        if (result.waitForApproval && dept.id !== "trust_safety") throw new CaseError("worker_contract", "승인 대기는 T&S 부서에서만 가능해요.");
        const s = x.sections[dept.id]!;
        s.state = result.waitForApproval ? "waiting" : "done";
        s.data = result.data; s.finishedAt = new Date().toISOString(); s.durationMs = Date.now() - start;
        x.status = result.waitForApproval ? "awaiting_approval" : "ready";
        emit({ department: dept.id, state: result.waitForApproval ? "awaiting_approval" : "done", summary: dept.label + (result.waitForApproval ? " 사람 승인 대기" : " 처리 완료"), cite: [] });
        if (s.durationMs > 30_000) emit({ department: "reliability", state: "warning", summary: dept.label + " 처리 30초 초과", cite: [] });
        if (result.waitForApproval) x.run = null;
      });
      if (result.waitForApproval) return c;
    } catch (e) {
      return repo.mutate(id, (x, emit) => {
        if (x.run?.token !== token) throw new CaseError("stale_run", "작업 소유권이 바뀌었어요.");
        const safe = e instanceof CaseError ? { code: e.code, message: e.message } : { code: "worker_failed", message: "부서 처리에 실패했어요. 원문 오류와 비밀 정보는 저장하지 않아요." };
        Object.assign(x.sections[dept.id]!, { state: "failed", error: safe, finishedAt: new Date().toISOString(), durationMs: Date.now() - start });
        x.status = "failed"; x.run = null;
        emit({ department: dept.id, state: "failed", summary: safe.message, cite: [] });
        emit({ department: "reliability", state: "warning", summary: dept.label + " 실패 기록", cite: [] });
      });
    } finally { if (timer) clearTimeout(timer); }
  }
  return repo.mutate(id, (x, emit) => {
    if (x.run?.token !== token || !x.approvals.length) throw new CaseError("approval_required", "사람 승인 기록이 필요해요.");
    x.stage = "complete"; x.status = "complete"; x.run = null;
    emit({ department: "complete", state: "complete", summary: "모든 부서 처리 완료", cite: [] });
  });
}
