import Link from "next/link";
import { ButtonLink } from "@/components/ui";

export const metadata = { title: "판정·게재 기준 · Pairsight" };

export default function HowItWorksPage() {
  return (
    <article className="mx-auto grid max-w-reading gap-8">
      <header className="grid gap-2">
        <h1 className="text-xl">판정·게재 기준</h1>
        <p className="text-text-muted">이미지의 출처와 맥락을 근거로 확인하고, 사람이 검토한 결과만 공개해요.</p>
      </header>
      <section aria-labelledby="evidence-policy" className="grid gap-3">
        <h2 id="evidence-policy" className="text-lg">근거가 부족하면 판단을 보류해요</h2>
        <p>AI 탐지 점수나 이미지 유사도, AI의 해석 하나만으로 결론을 내리지 않아요. 출처 기록, 이미지 비교, 같은 주장에 대한 팩트체크를 함께 확인해요.</p>
        <p>먼저 발견한 사진이 촬영 원본이라는 뜻은 아니에요. 같은 장소를 다른 날 찍은 사진일 가능성이 남으면 편집 조작으로 단정하지 않아요.</p>
        <p>공개 사례의 공방 기록에는 검사·변호인·배심원의 주장과 인용 근거를 함께 보여줘요. 근거 있는 의심이 남으면 판단 불가로 낮출 수 있어요.</p>
      </section>
      <section aria-labelledby="publication-policy" className="grid gap-3">
        <h2 id="publication-policy" className="text-lg">모든 주제에 사람 승인이 필요해요</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>제목에는 확인한 사실을 써요. 누가 조작했는지 추측하거나 거짓 주장을 반복하지 않아요.</li>
          <li>조작·미확인 이미지는 흐림 처리하고 판정을 함께 표시해요.</li>
          <li>인스타그램·유튜브·커뮤니티·메신저·기사 태그는 제보자가 알려준 경로예요. 플랫폼에서 게시물이나 계정을 수집하지 않아요.</li>
          <li>개인에 관한 사례와 사생활 루머는 다루지 않아요.</li>
        </ul>
      </section>
      <section aria-labelledby="politics-policy" className="grid gap-3">
        <h2 id="politics-policy" className="text-lg">정치·선거: 같은 선정 기준, 두 사람의 검토</h2>
        <p>아래 세 조건을 모두 만족하는 이미지를 검토해요.</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>서로 다른 제보가 3건 이상이거나 언론 보도에 등장했어요.</li>
          <li>출처 페이지나 기록 등 확인 가능한 근거가 하나 이상 있어요.</li>
          <li>선거·정책·공적 행사에 관한 이미지예요.</li>
        </ol>
        <p>진영별 건수를 억지로 맞추지 않고 같은 기준을 적용해요. 서로 다른 검토자 두 명이 확인하며, 정당이나 인물에 대한 평가는 쓰지 않아요. 의견·명시된 풍자·사생활·공약의 타당성은 대상이 아니에요.</p>
        <p>선거일 전 90일부터 선거일까지 정치 사례는 이미지 없이 글로만 게재하는 정책을 적용해요. 선거일 전 6일부터 투표 마감까지 여론조사 그래프·표 사례의 게재도 보류해요. 이는 재노출을 줄이기 위한 Pairsight의 운영 기준이에요.</p>
        <p className="text-sm text-text-muted">관련 법령: <a href="https://www.law.go.kr/법령/공직선거법/제82조의8">공직선거법 제82조의8</a>, <a href="https://www.law.go.kr/법령/공직선거법/제108조">제108조</a>. 개별 사건에 대한 법률 판단을 제공하는 서비스는 아니에요.</p>
      </section>
      <section aria-labelledby="topic-policy" className="grid gap-3">
        <h2 id="topic-policy" className="text-lg">주제별로 추가 확인해요</h2>
        <dl className="grid gap-4">
          <div><dt className="font-semibold">연예·엔터</dt><dd className="mt-1">공인의 공개 활동에 관한 합성·조작물만 다뤄요. 성적 딥페이크는 흐림 이미지·썸네일·내용 묘사·원문 링크를 포함해 어떤 형태로도 표시하지 않아요. 미성년자 관련 이미지와 사생활 루머도 게재하지 않아요.</dd></div>
          <div><dt className="font-semibold">사회·재난</dt><dd className="mt-1">피해자 신원 노출과 참혹한 장면, 지역·집단에 대한 혐오 표현을 검토해요. 피해자 보호가 필요한 사례는 이미지 없이 게재해요. 판단 불가를 진짜라는 뜻으로 표현하지 않아요.</dd></div>
          <div><dt className="font-semibold">경제</dt><dd className="mt-1">이미지의 진위만 확인해요. 기업·종목·상품의 매수나 매도 권유로 읽힐 표현과 명예에 관한 문제를 검토해요.</dd></div>
          <div><dt className="font-semibold">기타</dt><dd className="mt-1">다른 주제에 해당하는지 먼저 확인한 뒤 같은 승인·피해자 보호 기준을 적용해요.</dd></div>
        </dl>
      </section>
      <section aria-labelledby="report-help" className="grid gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 id="report-help" className="text-lg">성적 합성물은 업로드 대신 지원 기관으로</h2>
        <p>이곳에 파일이나 링크를 올리지 마세요. 상담·삭제 지원과 신고 절차는 <a href="https://d4u.stop.or.kr/ko/intro">중앙디지털성범죄피해자지원센터</a>에서 안내받을 수 있어요.</p>
        <p>대표 상담번호 <a href="tel:1366">1366</a> · 지원센터 <a href="tel:027358994">02-735-8994</a></p>
        <p className="text-sm text-text-muted"><a href="https://www.mogef.go.kr/sp/hrp/sp_hrp_f014.do">성평등가족부의 공식 지원 안내</a></p>
      </section>
      <div className="flex flex-wrap items-center gap-4">
        <ButtonLink href="/cases">공개 사례 보기</ButtonLink>
        <Link href="/check">이미지 검사하기</Link>
      </div>
    </article>
  );
}
