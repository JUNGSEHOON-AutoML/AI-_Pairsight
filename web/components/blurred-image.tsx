"use client";
// A fake or unconfirmed picture stays blurred until the reader asks to see it, and can be blurred again.
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { cx } from "./ui";

export function BlurredImage({ src, alt, blurred }: { src: string; alt: string; blurred: boolean }) {
  const [shown, setShown] = useState(!blurred);
  return (
    <figure className="grid gap-2">
      <div className="overflow-hidden rounded-md bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static fixture thumbnails */}
        <img src={src} alt={shown ? alt : `흐림 처리된 이미지: ${alt}`} className={cx("aspect-[4/3] w-full object-cover", !shown && "scale-110 blur-lg")} />
      </div>
      {blurred && (
        <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-border-input px-3 text-sm">
          {shown ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
          {shown ? "다시 흐리게" : "조작·미확인 이미지 보기"}
        </button>
      )}
      {blurred && <figcaption className="text-xs text-text-muted">가짜이거나 확인되지 않은 이미지라 흐리게 보여줘요. 퍼뜨리지 말아 주세요.</figcaption>}
    </figure>
  );
}
