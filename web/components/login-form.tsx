"use client";
import { Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { Button, Panel } from "./ui";

export function LoginForm() {
  const params = useSearchParams();
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "expired" ? "링크가 만료됐거나 이미 사용됐어요. 다시 받아 주세요." : null,
  );
  const [devLink, setDevLink] = useState<string | null>(null);

  return (
    <Panel className="p-4 md:p-5">
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          }).catch(() => null);
          setBusy(false);
          const data = await res?.json().catch(() => ({}));
          if (res?.status === 400) return setError("이메일 주소를 다시 확인해 주세요.");
          if (res?.status === 501) return setError("지금은 로그인 메일을 보낼 수 없어요. 잠시 뒤에 다시 시도해 주세요.");
          if (!res?.ok) return setError("로그인을 시작하지 못했어요.");
          setDevLink(data.devLink ?? null);
        }}
      >
        <label htmlFor={id} className="font-semibold">
          이메일
        </label>
        <input
          id={id}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 rounded-md border border-border-input bg-bg px-3"
        />
        <Button type="submit" loading={busy} className="w-full md:w-fit">
          <Mail aria-hidden="true" className="size-4" />
          로그인 링크 받기
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
      {devLink && (
        <div role="status" className="mt-4 rounded-md bg-verdict-edited-bg p-3 text-sm">
          <p>
            <strong className="text-verdict-edited">DEV</strong> · 메일 발송이 아직 연결되지 않아서, 메일 대신 링크를 여기에
            보여드려요. 실제 서비스에서는 이메일로 보내요.
          </p>
          <a href={devLink} className="mt-1 inline-block break-all font-semibold">
            로그인 링크 열기
          </a>
        </div>
      )}
    </Panel>
  );
}
