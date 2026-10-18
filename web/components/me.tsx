"use client";
// Who is browsing + today's free checks. Shared by the header, S01 and S09.
import { useEffect, useState } from "react";
import { cx } from "./ui";

export interface Me {
  signedIn: boolean;
  email: string | null;
  usage: { used: number; limit: number };
}

export function useMe(refreshKey = 0) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((m: Me) => live && setMe(m))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return me;
}

export function UsageMeter({ me }: { me: Me | null }) {
  if (!me) return <p className="h-5" aria-hidden="true" />;
  const left = Math.max(me.usage.limit - me.usage.used, 0);
  return (
    <p className={cx("text-sm", left <= 1 ? "font-semibold text-warning" : "text-text-muted")} aria-live="polite">
      오늘 남은 무료 검사 {left}회 / {me.usage.limit}회
      {!me.signedIn && left <= 1 && " · 가입하면 하루 횟수가 늘어나요"}
    </p>
  );
}

export function HeaderAccountLink() {
  const me = useMe();
  return (
    <a href={me?.signedIn ? "/account" : "/login"} className="rounded-md px-3 py-2 text-text no-underline hover:bg-surface">
      {me?.signedIn ? "내 계정" : "로그인"}
    </a>
  );
}
