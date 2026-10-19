"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MOCK_FIXTURE_INPUT, type Scenario } from "@/lib/providers/mock/fixtures";
import { Button } from "./ui";

export function FixtureList({ scenarios }: { scenarios: { id: string; note: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {scenarios.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/fixtures/inputs/${s.id}.png`} alt="" className="h-16 w-20 rounded-sm object-cover" />
            <div className="grid flex-1 gap-1">
              <span className="text-sm">{s.note}</span>
              <Button
                size="sm"
                variant="secondary"
                className="w-fit"
                data-scenario={s.id}
                loading={busy === s.id}
                onClick={async () => {
                  setBusy(s.id);
                  setError(null);
                  const blob = await (await fetch(`/fixtures/inputs/${s.id}.png`)).blob();
                  const fd = new FormData();
                  fd.set("file", new File([blob], `${s.id}.png`, { type: "image/png" }));
                  const extra = MOCK_FIXTURE_INPUT[s.id as Scenario];
                  if (extra?.claimText) fd.set("claimText", extra.claimText);
                  if (extra?.claimedDate) fd.set("claimedDate", extra.claimedDate);
                  const res = await fetch("/api/checks", { method: "POST", body: fd });
                  setBusy(null);
                  if (res.ok) router.push(`/check/${(await res.json()).id}`);
                  else setError(res.status === 429 ? "오늘 무료 검사를 다 썼어요." : "검사를 시작하지 못했어요.");
                }}
              >
                이 샘플로 검사
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
