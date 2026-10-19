"use client";
// [신규] screens with no competitor reference: 분석 중, 분석 실패, 무료 횟수 소진 (components.md §4).
import { Check, Circle, CircleDot, LoaderCircle, TimerOff, TriangleAlert, X } from "lucide-react";
import { COPY, ERROR_COPY, type ErrorCode, STEP_LABEL, STEP_ORDER, type StepId, type StepState } from "@/lib/domain";
import { Button, ButtonLink, Panel, cx } from "./ui";

const STEP_UI: Record<StepState, { icon: typeof Check; text: string; label: string }> = {
  done: { icon: Check, text: "text-verdict-real", label: "완료" },
  running: { icon: CircleDot, text: "text-accent", label: "진행 중" },
  waiting: { icon: Circle, text: "text-text-muted", label: "대기" },
  failed: { icon: X, text: "text-danger", label: "실패" },
};

export function AnalyzingPanel({
  steps,
  slow,
  onCancel,
}: {
  steps: Record<StepId, StepState>;
  slow: boolean;
  onCancel: () => void;
}) {
  const running = STEP_ORDER.find((s) => steps[s] === "running");
  return (
    <Panel aria-labelledby="analyzing-title" className="p-4 md:p-5">
      <h2 id="analyzing-title" className="flex items-center gap-2 text-lg">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-accent" />
        {COPY.analyzing}
      </h2>
      {/* Real pipeline steps only: a step is ticked when the server says it is done. */}
      <ol className="mt-3 grid gap-2 text-sm">
        {STEP_ORDER.map((id) => {
          const ui = STEP_UI[steps[id]];
          const Icon = ui.icon;
          return (
            <li key={id} className={cx("grid grid-cols-[20px_1fr_auto] items-center gap-2", ui.text)}>
              <Icon aria-hidden="true" className="size-4" />
              <span>{STEP_LABEL[id]}</span>
              <span>{ui.label}</span>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {running ? `${STEP_LABEL[running]} 진행 중` : ""}
      </p>
      <p className={cx("mt-3 text-sm", slow ? "font-semibold text-warning" : "text-text-muted")}>
        {slow ? "평소보다 오래 걸리고 있어요. 기다리거나 취소할 수 있어요." : "보통 10~30초 걸려요. 가입했다면 이 창을 닫아도 기록에 남아요."}
      </p>
      <Button variant={slow ? "primary" : "secondary"} size="sm" className="mt-3" onClick={onCancel}>
        <X aria-hidden="true" className="size-4" />
        취소
      </Button>
    </Panel>
  );
}

export function AnalysisFailed({ code, charged, onRetry }: { code: ErrorCode | null; charged: boolean; onRetry?: () => void }) {
  return (
    <Panel aria-labelledby="failed-title" className="p-4 md:p-5">
      <h2 id="failed-title" className="flex items-center gap-2 text-lg">
        <TriangleAlert aria-hidden="true" className="size-5 text-danger" />
        {COPY.failed}
      </h2>
      {!charged && <p className="mt-1">{COPY.notCharged}</p>}
      <p className="mt-1 text-sm text-text-muted">이유: {ERROR_COPY[code ?? "internal"]}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && <Button onClick={onRetry}>다시 시도</Button>}
        <ButtonLink href="/" variant="secondary">
          다른 이미지 검사
        </ButtonLink>
      </div>
    </Panel>
  );
}

// Quota resets at UTC midnight; show that moment in the viewer's own time zone (e.g. 오전 9:00 in Korea).
function resetTimeLocal() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

export function QuotaExhausted() {
  return (
    <Panel role="alert" aria-labelledby="quota-title" className="p-4 md:p-5">
      <h2 id="quota-title" className="flex items-center gap-2 text-lg">
        <TimerOff aria-hidden="true" className="size-5 text-warning" />
        {COPY.quotaTitle}
      </h2>
      <p className="mt-1">무료 횟수는 매일 {resetTimeLocal()}(내 시간대 기준, UTC 0시)에 다시 채워져요.</p>
      <p className="mt-1 text-sm text-text-muted">지금까지 검사한 결과는 그대로 볼 수 있어요.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href="/login">가입하고 기록 저장하기</ButtonLink>
        <ButtonLink href="/pricing" variant="secondary">
          운영 안내 보기
        </ButtonLink>
      </div>
      <p className="mt-2 text-sm text-text-muted">결제 정보 없이 가입할 수 있어요.</p>
    </Panel>
  );
}
