import { DEPARTMENTS, type CaseRecord, type CaseEvent } from "./model";
import type { FactcheckData } from "./workers";

/** No ground-truth labels means accuracy is unknown, never 100%. */
export function reliability(cases: CaseRecord[], events: CaseEvent[]) {
  const rows = cases.filter(c => c.input.origin !== "fixture");
  const realIds = new Set(rows.map(c => c.id));
  events = events.filter(e => realIds.has(e.caseId));
  const labeled = rows.filter(c => c.evaluation && c.sections.factcheck?.state === "done");
  const wrong = labeled.filter(c => (c.sections.factcheck!.data as unknown as FactcheckData).court.finalVerdict !== c.evaluation!.expected);
  const suspected = rows.filter(c => c.sections.security?.data.requiresHumanReview || (c.sections.factcheck?.data as FactcheckData | undefined)?.court?.downgraded);
  return {
    cases: rows.length, failed: rows.filter(c => c.status === "failed").length,
    awaitingApproval: rows.filter(c => c.status === "awaiting_approval").length,
    evaluated: labeled.length, wrong: wrong.length, accuracy: labeled.length ? (labeled.length - wrong.length) / labeled.length : null,
    suspectedCaseIds: [...new Set([...suspected, ...wrong].map(c => c.id))],
    departments: DEPARTMENTS.map(d => {
      const starts = events.filter(e => e.department === d.id && e.state === "running").length;
      const failures = events.filter(e => e.department === d.id && e.state === "failed").length;
      const times = rows.flatMap(c => c.sections[d.id]?.durationMs != null ? [c.sections[d.id]!.durationMs!] : []);
      return { id: d.id, label: d.label, attempts: starts, failures, failureRate: starts ? failures / starts : null,
        meanMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
        slow: times.filter(t => t > 30_000).length };
    }),
  };
}
