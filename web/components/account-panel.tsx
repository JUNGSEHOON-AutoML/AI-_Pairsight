"use client";
// S09: who you are, today's free checks, sign out, delete everything (two steps, typed confirmation).
import { LogOut, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { ACCOUNT_DELETE_PHRASE } from "@/lib/domain";
import { UsageMeter, useMe } from "./me";
import { Block, Button, ButtonLink, Panel } from "./ui";

export function AccountPanel() {
  const [refresh, setRefresh] = useState(0);
  const me = useMe(refresh);
  const confirmId = useId();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<null | "logout" | "delete">(null);
  const [done, setDone] = useState<null | "logout" | "delete">(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <Panel role="status" className="p-4 md:p-5">
        <p>{done === "delete" ? "계정과 검사 기록, 올린 이미지를 모두 삭제했어요." : "로그아웃했어요."}</p>
        <ButtonLink href="/" variant="secondary" className="mt-3 w-fit">
          검사하러 가기
        </ButtonLink>
      </Panel>
    );
  }

  return (
    <Panel>
      <Block title="로그인 정보">
        {me?.signedIn ? (
          <p>{me.email}</p>
        ) : (
          <p className="text-sm text-text-muted">
            아직 가입하지 않았어요. 검사 기록은 이 브라우저에만 남아요. <a href="/login">가입하기</a>
          </p>
        )}
      </Block>
      <Block title="오늘 무료 검사">
        <UsageMeter me={me} />
        <p className="mt-1 text-sm text-text-muted">비영리 시범 운영이라 결제와 유료 요금제는 없어요.</p>
      </Block>
      {me?.signedIn && (
        <Block>
          <Button
            variant="secondary"
            loading={busy === "logout"}
            onClick={async () => {
              setBusy("logout");
              await fetch("/api/auth/logout", { method: "POST" });
              setBusy(null);
              setDone("logout");
              setRefresh((n) => n + 1);
            }}
          >
            <LogOut aria-hidden="true" className="size-4" />
            로그아웃
          </Button>
        </Block>
      )}
      <Block title="데이터 삭제">
        <p className="text-sm">
          계정, 모든 검사 기록, 올린 이미지를 지워요. 되돌릴 수 없어요. 여러 사람이 같은 이미지를 검사해 만든 공유 분석 결과(근거
          목록)는 남지만, 내가 올린 파일과 내 기록은 남지 않아요.
        </p>
        <label htmlFor={confirmId} className="mt-3 block text-sm">
          확인을 위해 <strong>{ACCOUNT_DELETE_PHRASE}</strong>라고 입력해 주세요
        </label>
        <input
          id={confirmId}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-border-input bg-bg px-3 md:w-64"
        />
        <Button
          variant="danger"
          className="mt-3"
          disabled={confirm !== ACCOUNT_DELETE_PHRASE}
          loading={busy === "delete"}
          onClick={async () => {
            setBusy("delete");
            setError(null);
            const res = await fetch("/api/account", {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ confirm }),
            }).catch(() => null);
            setBusy(null);
            if (res?.ok) setDone("delete");
            else if (res?.status === 401) setError("지울 데이터가 없어요. 이 브라우저에서 한 검사가 없어요.");
            else setError("삭제하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
          }}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          모두 삭제
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </Block>
    </Panel>
  );
}
