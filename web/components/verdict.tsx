// VerdictBanner, StrengthBadge, EvidenceCard, CheckedAt (replica/design/components.md §3).
// Verdicts and outcomes are always icon + words, never colour alone.
import {
  BadgeCheck,
  Bot,
  CalendarX,
  CircleHelp,
  Clock,
  ExternalLink,
  FileBadge,
  Fingerprint,
  Image as ImageIcon,
  Info,
  type LucideIcon,
  Monitor,
  ScanEye,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { HeadlineFinding } from "@/lib/verdict";
import {
  EVIDENCE_LABEL,
  type Evidence,
  type EvidenceKind,
  OUTCOME_LABEL,
  type Outcome,
  STRENGTH_LABEL,
  STRENGTH_RANK,
  type Strength,
  VERDICT_LABEL,
  type Verdict,
} from "@/lib/domain";
import { cx } from "./ui";

export const VERDICT_STYLE: Record<Verdict, { icon: LucideIcon; text: string; bg: string; border: string }> = {
  authentic: { icon: BadgeCheck, text: "text-verdict-real", bg: "bg-verdict-real-bg", border: "border-verdict-real" },
  ai_generated: { icon: Bot, text: "text-verdict-ai", bg: "bg-verdict-ai-bg", border: "border-verdict-ai" },
  edited: { icon: Scissors, text: "text-verdict-edited", bg: "bg-verdict-edited-bg", border: "border-verdict-edited" },
  miscontextualized: {
    icon: CalendarX,
    text: "text-verdict-context",
    bg: "bg-verdict-context-bg",
    border: "border-verdict-context",
  },
  inconclusive: { icon: CircleHelp, text: "text-verdict-unsure", bg: "bg-verdict-unsure-bg", border: "border-verdict-unsure" },
};

export function VerdictLabel({ verdict, className }: { verdict: Verdict; className?: string }) {
  const s = VERDICT_STYLE[verdict];
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 font-semibold", s.text, className)}>
      <Icon aria-hidden="true" className="size-4" />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/** 핵심 발견: one observation with its source and date. Never phrased as a verdict. */
export function HeadlineLine({ finding, lead }: { finding: HeadlineFinding; lead: "inconclusive" | "other" }) {
  return (
    <p className={cx("text-text", lead === "inconclusive" ? "mt-1 text-base font-semibold" : "mt-2 text-sm")}>
      <span className={lead === "inconclusive" ? "" : "font-semibold"}>{lead === "inconclusive" ? "단, " : "핵심 발견: "}</span>
      {finding.text}
      {finding.trusted && (
        <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-border-input px-2 align-middle text-xs font-semibold text-text-muted">
          <ShieldCheck aria-hidden="true" className="size-3" />
          신뢰 출처
        </span>
      )}
      {finding.sourceUrl && (
        <a href={finding.sourceUrl} rel="noopener noreferrer nofollow" target="_blank" className="ml-1.5 inline-flex items-center gap-0.5 text-sm font-normal">
          <ExternalLink aria-hidden="true" className="size-3.5" />
          출처 보기<span className="sr-only"> (새 창)</span>
        </a>
      )}
    </p>
  );
}

export function VerdictBanner({
  verdict,
  reason,
  headline,
  strength,
  children,
}: {
  verdict: Verdict;
  reason: string;
  headline?: HeadlineFinding | null;
  strength?: Strength | null;
  children?: ReactNode;
}) {
  const s = VERDICT_STYLE[verdict];
  const Icon = s.icon;
  const inconclusive = verdict === "inconclusive";
  return (
    <section aria-labelledby="verdict-title" className={cx("rounded-lg border-l-4 px-4 py-4 md:px-5", s.bg, s.border)}>
      <div className={cx("flex flex-wrap items-center gap-x-2 gap-y-1", s.text)}>
        <Icon aria-hidden="true" className="size-6 shrink-0" />
        <h2 id="verdict-title" className="text-lg">
          <span className="sr-only">판정: </span>
          {VERDICT_LABEL[verdict]}
        </h2>
        {strength && (
          <span className="text-text">
            <StrengthBadge strength={strength} />
          </span>
        )}
      </div>
      {/* 판단 불가: the strongest observation comes first, so the finding is not buried under "no conclusion". */}
      {inconclusive && headline && <HeadlineLine finding={headline} lead="inconclusive" />}
      <p className={cx("text-text", inconclusive && headline ? "mt-1 text-sm" : "mt-1 text-base")}>{reason}</p>
      {inconclusive && <p className="mt-0.5 text-sm text-text-muted">진짜라는 뜻도, 가짜라는 뜻도 아니에요.</p>}
      {!inconclusive && headline && <HeadlineLine finding={headline} lead="other" />}
      {children}
    </section>
  );
}

export function StrengthBadge({ strength }: { strength: Strength }) {
  const on = STRENGTH_RANK[strength];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" aria-label={`근거 강도: ${STRENGTH_LABEL[strength]}`}>
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx("h-1 w-2 rounded-sm", i <= on ? "bg-strength-on" : "bg-strength-off")} />
        ))}
      </span>
      <span aria-hidden="true">{STRENGTH_LABEL[strength]}</span>
    </span>
  );
}

const KIND_ICON: Record<EvidenceKind, LucideIcon> = {
  source_match: ImageIcon,
  image_comparison: ImageIcon,
  context: Info,
  c2pa: ShieldCheck,
  watermark: Fingerprint,
  fact_check: FileBadge,
  exif: Info,
  pixel_model: ScanEye,
  screen_recapture: Monitor,
};

const OUTCOME_STYLE: Record<Outcome, string> = {
  supports_real: "border-verdict-real text-verdict-real",
  supports_manipulated: "border-verdict-ai text-verdict-ai",
  neutral: "border-border-input text-text-muted",
  unavailable: "border-border-input text-text-muted",
};

export function OutcomeTag({ outcome }: { outcome: Outcome }) {
  return (
    <span className={cx("rounded-full border px-2 text-xs font-semibold", OUTCOME_STYLE[outcome])}>
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
};

export function EvidenceCard({ e }: { e: Evidence }) {
  const Icon = KIND_ICON[e.kind];
  const publisher = typeof e.details.publisher === "string" ? e.details.publisher : null;
  return (
    <article
      className={cx(
        "rounded-md border border-border p-4 shadow-card",
        e.outcome === "unavailable" ? "bg-surface" : "bg-bg",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="inline-flex items-center gap-1.5 font-semibold">
          <Icon aria-hidden="true" className="size-5" />
          {EVIDENCE_LABEL[e.kind]}
        </h4>
        <StrengthBadge strength={e.strength} />
        <OutcomeTag outcome={e.outcome} />
      </div>
      {/* The AI-detector score is never shown here; it lives under 상세 점수. */}
      <p className="mt-2 text-sm">{e.summary}</p>
      {typeof e.details.quote === "string" && <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-text-muted">{e.details.quote}</blockquote>}
      {(e.sourceUrl || publisher) && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-muted">
          {publisher && <span>{publisher}</span>}
          {e.sourceUrl && (
            <a href={e.sourceUrl} rel="noopener noreferrer nofollow" target="_blank" className="inline-flex items-center gap-1">
              <ExternalLink aria-hidden="true" className="size-4" />
              {hostOf(e.sourceUrl)}
              <span className="sr-only"> (새 창)</span>
            </a>
          )}
        </div>
      )}
    </article>
  );
}

export function CheckedAt({ at, children }: { at: string | null; children?: ReactNode }) {
  const d = at ? new Date(at) : null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-muted">
      {d && (
        <span className="inline-flex items-center gap-1" title={`UTC ${d.toISOString().replace("T", " ").slice(0, 16)}`}>
          <Clock aria-hidden="true" className="size-4" />
          확인 시각 <time dateTime={d.toISOString()}>{formatLocal(d)}</time>
        </span>
      )}
      {children}
    </div>
  );
}

export function formatLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
