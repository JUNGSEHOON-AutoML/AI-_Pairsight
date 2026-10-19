import { notFound } from "next/navigation";
import { FixtureList } from "@/components/fixture-list";
import { usesMockTransport } from "@/lib/providers";
import { SCENARIO_NOTE, SCENARIOS } from "@/lib/providers/mock/fixtures";

// Dev-only: one click per mock scenario, so every result screen can be reached and screenshotted.
export default function FixturesPage() {
  if (!usesMockTransport) notFound();
  return (
    <div className="grid gap-4">
      <h1 className="text-xl">모의 데이터 샘플</h1>
      <p className="text-text-muted">
        개발용 페이지예요. 샘플을 고르면 그 이미지를 업로드한 것과 똑같이 검사가 시작돼요. 실제 서비스에서는 보이지 않아요.
      </p>
      <FixtureList scenarios={SCENARIOS.map((s) => ({ id: s, note: SCENARIO_NOTE[s] }))} />
      <h2 className="mt-4 text-lg">페이지 주소 샘플 (URL 흐름)</h2>
      <ul className="list-disc pl-5 text-sm">
        {SCENARIOS.map((s) => (
          <li key={s}>
            <code>https://demo.pairsight.test/news/{s}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
