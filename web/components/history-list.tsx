"use client";
// S06: this browser's checks, newest first. Verdict shown as icon + words.
import { LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Verdict } from "@/lib/domain";
import { useMe } from "./me";
import { ButtonLink } from "./ui";
import { formatLocal, VerdictLabel } from "./verdict";

interface Item {
  id: string;
  createdAt: string;
  status: "pending" | "running" | "done" | "failed";
  verdict: Verdict | null;
  fileName: string | null;
  pageUrl: string | null;
  imageUrl: string;
}

export function HistoryList() {
  const params = useSearchParams();
  const me = useMe();
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    fetch("/api/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="grid gap-4">
      {params.get("welcome") && me?.signedIn && (
        <p role="status" className="rounded-md bg-verdict-real-bg p-3 text-sm">
          {me.email}(으)로 로그인했어요. 이 브라우저에서 한 검사가 기록에 남아 있어요.
        </p>
      )}
      {me && !me.signedIn && (items?.length ?? 0) > 0 && (
        <p className="rounded-md bg-surface p-3 text-sm">
          지금은 이 브라우저에만 기록이 남아요.{" "}
          <Link href="/login">가입하면</Link> 다른 기기에서도 볼 수 있어요.
        </p>
      )}
      {!items && <div aria-hidden="true" className="h-40 animate-pulse rounded-lg bg-surface" />}
      {items?.length === 0 && (
        <div className="grid gap-3 rounded-lg border border-border p-6 text-center">
          <p>아직 검사한 이미지가 없어요. 처음 하나를 넣어 보세요.</p>
          <ButtonLink href="/" className="mx-auto w-fit">
            검사하러 가기
          </ButtonLink>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={`/check/${it.id}`}
                className="grid grid-cols-[64px_1fr] items-center gap-3 rounded-md border border-border bg-bg p-2 text-text no-underline hover:border-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt="" className="aspect-[4/3] w-16 rounded-sm object-cover" />
                <span className="grid min-w-0 gap-0.5">
                  {it.status === "done" && it.verdict ? (
                    <VerdictLabel verdict={it.verdict} />
                  ) : it.status === "failed" ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
                      <TriangleAlert aria-hidden="true" className="size-4" />
                      분석 실패
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
                      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                      분석 중
                    </span>
                  )}
                  <span className="truncate text-sm text-text-muted">
                    {it.fileName ?? it.pageUrl ?? "이미지"} · {formatLocal(new Date(it.createdAt))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
