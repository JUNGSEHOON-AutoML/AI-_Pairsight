"use client";
// S02 → S03: polls the check until the analysis is done or failed, then shows the result.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CheckView } from "@/lib/view";
import { ResultView } from "./result-view";
import { AnalysisFailed, AnalyzingPanel, QuotaExhausted } from "./status-panels";
import { ButtonLink } from "./ui";

const SLOW_AFTER_MS = 60_000;

export function CheckScreen() {
  const { id } = useParams<{ id: string }>();
  // key: a new check id remounts the poller, so its state starts fresh without resetting inside an effect.
  return <CheckPoller key={id} id={id} />;
}

function CheckPoller({ id }: { id: string }) {
  const router = useRouter();
  const [view, setView] = useState<CheckView | null>(null);
  const [missing, setMissing] = useState(false);
  const [slow, setSlow] = useState(false);
  const [quotaHit, setQuotaHit] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    let stop = false;
    let delay = 400;
    started.current = Date.now();
    async function tick() {
      if (stop) return;
      const res = await fetch(`/api/checks/${id}`, { cache: "no-store" }).catch(() => null);
      if (stop) return;
      if (res?.status === 404) return setMissing(true);
      if (res?.ok) {
        const v = (await res.json()) as CheckView;
        setView(v);
        if (v.status === "done" || v.status === "failed") return;
      }
      setSlow(Date.now() - started.current > SLOW_AFTER_MS);
      delay = Math.min(delay * 1.5, 2000);
      setTimeout(tick, delay);
    }
    tick();
    return () => {
      stop = true;
    };
  }, [id]);

  if (missing) {
    return (
      <div className="grid max-w-reading gap-3">
        <h1 className="text-xl">검사를 찾을 수 없어요</h1>
        <p className="text-text-muted">다른 브라우저에서 만든 검사이거나, 삭제된 검사일 수 있어요.</p>
        <ButtonLink href="/" className="w-fit">
          새로 검사하기
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-reading gap-4">
      <h1 className="sr-only">검사 결과</h1>
      {!view && <div aria-hidden="true" className="h-40 animate-pulse rounded-lg bg-surface" />}
      {quotaHit && <QuotaExhausted />}
      {view && (view.status === "pending" || view.status === "running") && (
        <AnalyzingPanel steps={view.steps} slow={slow} onCancel={() => router.push("/")} />
      )}
      {view?.status === "failed" && (
        <AnalysisFailed
          code={view.errorCode}
          charged={view.charged}
          onRetry={async () => {
            const res = await fetch(`/api/checks/${view.id}/recheck`, { method: "POST" });
            if (res.status === 429) setQuotaHit(true);
            else if (res.ok) router.push(`/check/${(await res.json()).id}`);
          }}
        />
      )}
      {view?.status === "done" && <ResultView view={view} />}
    </div>
  );
}
