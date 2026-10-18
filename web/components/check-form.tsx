"use client";
// S01: upload an image, or paste a page address and pick one of its images. Optional claimed date.
import { ImageIcon, Link as LinkIcon, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ACCEPTED_MIME, COPY, ERROR_COPY, type ErrorCode, MAX_IMAGE_BYTES } from "@/lib/domain";
import type { PageImage } from "@/lib/providers/types";
import { UsageMeter, useMe } from "./me";
import { QuotaExhausted } from "./status-panels";
import { Button, cx } from "./ui";

type Picked = { kind: "file"; file: File } | null;

export function CheckForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = { file: useId(), url: useId(), date: useId(), err: useId() };
  const [picked, setPicked] = useState<Picked>(null);
  const [dragging, setDragging] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const [images, setImages] = useState<PageImage[] | null>(null);
  const [claimedDate, setClaimedDate] = useState("");
  const [busy, setBusy] = useState<null | "file" | "url" | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState(false);
  const me = useMe(quota ? 1 : 0);

  function choose(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!ACCEPTED_MIME.includes(file.type)) return setError(ERROR_COPY.unsupported_type);
    if (file.size > MAX_IMAGE_BYTES) return setError(ERROR_COPY.too_large);
    setPicked({ kind: "file", file });
  }

  async function submit(body: FormData, tag: string) {
    setBusy(tag);
    setError(null);
    if (claimedDate) body.set("claimedDate", claimedDate);
    const res = await fetch("/api/checks", { method: "POST", body }).catch(() => null);
    setBusy(null);
    if (!res) return setError(ERROR_COPY.internal);
    if (res.status === 429) return setQuota(true);
    const data = await res.json().catch(() => ({}));
    if (data.error === "bad_date") return setError("사건 날짜를 다시 확인해 주세요. 오늘 이후 날짜는 넣을 수 없어요.");
    if (!res.ok) return setError(ERROR_COPY[(data.errorCode as ErrorCode) ?? "internal"] ?? ERROR_COPY.internal);
    router.push(`/check/${data.id}`);
  }

  async function findImages(e: React.FormEvent) {
    e.preventDefault();
    setBusy("url");
    setError(null);
    setImages(null);
    const res = await fetch("/api/url-images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageUrl }),
    }).catch(() => null);
    setBusy(null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setError(ERROR_COPY[(data?.errorCode as ErrorCode) ?? "url_blocked"] ?? ERROR_COPY.url_blocked);
    setImages(data.images);
  }

  return (
    <div className="grid gap-6">
      <UsageMeter me={me} />
      {quota && <QuotaExhausted />}

      <section aria-labelledby={`${ids.file}-h`} className="grid gap-3">
        <h2 id={`${ids.file}-h`} className="text-lg">
          이미지 올리기
        </h2>
        <input
          ref={fileInput}
          id={ids.file}
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          className="peer sr-only"
          aria-describedby={error ? ids.err : undefined}
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <label
          htmlFor={ids.file}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files[0]);
          }}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
            dragging ? "border-accent bg-surface" : "border-border-input bg-bg",
          )}
        >
          <Upload aria-hidden="true" className="size-6 text-accent" />
          <span className="font-semibold">{picked ? picked.file.name : "이미지를 끌어다 놓거나 눌러서 고르세요"}</span>
          <span className="text-sm text-text-muted">JPG, PNG, WebP, HEIC · 10MB까지</span>
        </label>
        <Button
          size="lg"
          disabled={!picked}
          loading={busy === "file"}
          onClick={() => {
            if (!picked) return;
            const fd = new FormData();
            fd.set("file", picked.file);
            submit(fd, "file");
          }}
          className="w-full md:w-fit"
        >
          근거 찾기
        </Button>
      </section>

      <section aria-labelledby={`${ids.url}-h`} className="grid gap-3">
        <h2 id={`${ids.url}-h`} className="text-lg">
          또는 페이지 주소로 찾기
        </h2>
        <form onSubmit={findImages} className="flex flex-col gap-2 md:flex-row">
          <label htmlFor={ids.url} className="sr-only">
            이미지가 있는 페이지 주소
          </label>
          <input
            id={ids.url}
            type="url"
            inputMode="url"
            required
            placeholder="https://..."
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
            className="h-10 w-full rounded-md border border-border-input bg-bg px-3 md:flex-1"
          />
          <Button type="submit" variant="secondary" loading={busy === "url"}>
            <LinkIcon aria-hidden="true" className="size-4" />
            이미지 찾기
          </Button>
        </form>
        <p className="text-sm text-text-muted">{COPY.urlScope}</p>
        {images && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">검사할 이미지를 고르세요 ({images.length}장)</legend>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {images.map((img) => (
                <li key={img.url}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    aria-busy={busy === img.url || undefined}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("imageUrl", img.url);
                      fd.set("pageUrl", pageUrl);
                      submit(fd, img.url);
                    }}
                    className="flex w-full flex-col gap-1 rounded-md border border-border bg-bg p-2 text-left text-sm hover:border-accent disabled:opacity-55"
                  >
                    <span className="grid aspect-[4/3] place-items-center rounded-sm bg-surface text-text-muted">
                      <ImageIcon aria-hidden="true" className="size-6" />
                    </span>
                    <span className="line-clamp-2 break-all">{img.alt || img.url.split("/").pop()}</span>
                    <span className="font-semibold text-accent">{busy === img.url ? "시작하는 중…" : "이 이미지 검사"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </section>

      <details className="rounded-md border border-border p-4">
        <summary className="cursor-pointer font-semibold">사건 날짜를 알고 있다면 (선택)</summary>
        <div className="mt-3 grid gap-1">
          <label htmlFor={ids.date} className="text-sm">
            이 사진이 언제 찍혔다고 들었나요?
          </label>
          <input
            id={ids.date}
            type="date"
            value={claimedDate}
            onChange={(e) => setClaimedDate(e.target.value)}
            className="h-10 w-fit rounded-md border border-border-input bg-bg px-3"
          />
          <p className="text-sm text-text-muted">같은 사진이 이 날짜보다 먼저 있었다면 &lsquo;맥락 조작&rsquo;으로 알려드려요.</p>
        </div>
      </details>

      {error && (
        <p id={ids.err} role="alert" className="rounded-md bg-verdict-ai-bg p-3 text-sm text-text">
          {error}
        </p>
      )}
    </div>
  );
}
