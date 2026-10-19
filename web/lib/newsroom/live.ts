import { latestBriefing, operatorTasks } from "./briefing";
import { deskFor, visibleStatus } from "./desks";
import type { CaseRepository } from "./repository";
import { newsroomSnapshot } from "./controlroom";
import { publicProjection } from "./review";
import { publishProblems, type Topic } from "../public/types";
import type { FactcheckData } from "./workers";

/** Operator-only card projection. Never send originals, raw page text, run tokens or identities. */
export function liveSnapshot(repo: CaseRepository) {
  const room = newsroomSnapshot(repo);
  return { room, briefing:latestBriefing(repo), tasks:operatorTasks(repo.list()), cases: repo.list().map(c => {
    const candidate = publicProjection(c);
    const published = candidate && !candidate.example && !publishProblems(candidate).length ? candidate : null;
    const factcheck = c.sections.factcheck?.data as FactcheckData | undefined;
    return { id:c.id, desk:deskFor(c.stage), displayStatus:visibleStatus(c), stage:c.stage, status:c.status, updatedAt:c.updatedAt,
      topic:(c.sections.monitoring?.data.topic as Topic | undefined) ?? c.input.topic ?? "other",
      claim:c.input.claim, channels:c.input.channels, verdict:published?.verdict ?? factcheck?.court?.finalVerdict ?? null,
      approvalCount:c.approvals.length,
      error:Object.values(c.desks??{}).find(d=>d.error)?.error ?? Object.values(c.sections).find(s => s.state === "failed")?.error?.message ?? null,
      published:published ? {truthTitle:published.truthTitle, imagePath:published.imagePath,
        verdict:published.verdict, slug:published.slug} : null };
  }) };
}
export type LiveSnapshot = ReturnType<typeof liveSnapshot>;

/** Changes are pushed without replaying old events as current work. Revoked sessions stop immediately. */
export function newsroomStream(repo: CaseRepository, authorized: () => boolean, signal: AbortSignal, interval = 500) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false, version = "", heartbeat = 0;
      let timer: ReturnType<typeof setInterval> | undefined;
      const stop = () => {
        if (closed) return;
        closed = true; clearInterval(timer); signal.removeEventListener("abort", stop);
        try { controller.close(); } catch { /* A reader cancellation has already closed the controller. */ }
      };
      cleanup = stop;
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const tick = () => {
        if (closed) return;
        try {
          if (!authorized()) { send("expired", {}); stop(); return; }
          const next = repo.version();
          if (next !== version) { send("snapshot", liveSnapshot(repo)); version = next; }
          if (Date.now() - heartbeat > 10000) { send("heartbeat", {}); heartbeat = Date.now(); }
        } catch { send("unavailable", {}); stop(); }
      };
      signal.addEventListener("abort", stop, {once:true});
      if (signal.aborted) { stop(); return; }
      tick(); if (!closed) timer = setInterval(tick, interval);
    },
    cancel() { cleanup(); },
  });
}
