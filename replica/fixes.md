# 기업가 분석 — AI 생성물 진위 판별 서비스 (가칭, 이름 미정)

작성일: 2026-10-18 · 근거: `replica/reviews.csv` (중복 제거 후 **445건**, 3개 출처)

## 표본과 한계 (먼저 읽기)

| 출처 | 건수 | 대상 |
| --- | --- | --- |
| Google Play | 233 | AI Image & Video Detector(Zyur), AI Detector Pro, AI Image Detector – Fake Check, AI Detector: Text Image Video, AI image Detector Pro, Lens AI & Reverse Image Search |
| App Store (공식 RSS) | 117 | AI or Real, AI Detector – Detect AI Image, AI Detector., Slop Or Not, Verifi – Fact checker, The Fact Check, PROOF, AI Fact Checker App, Reverse Image Search & AI Lens(1~3점·진위 관련만) |
| Hacker News (Algolia API) | 153 | AI 이미지 탐지·딥페이크·SynthID·C2PA·팩트체크 관련 댓글 |

- **원본 앱이 하나가 아닙니다.** 이 분야 경쟁 앱 여러 개를 하나의 "원본"처럼 묶어서 분석했습니다.
- **Trustpilot은 봇 차단(403), Reddit은 로그인 요구** 때문에 수집하지 못했습니다. 차단은 우회하지 않았습니다.
- Google Play는 리뷰별 고유 링크가 없어서, 링크가 **앱 상세 페이지**(See all reviews에서 읽은 곳)로 되어 있습니다.
- 대부분 영어권 리뷰입니다. **한국어 사용자 리뷰는 표본에 없습니다.** 국내 출시 전에 따로 확인해야 합니다.
- HN은 별점이 없고 사용자 리뷰가 아니라 업계 토론입니다. HN 한 곳에서만 나온 주제는 "근거 약함"으로 표시했습니다.

---

## 1. 사람들이 싫어하는 것

| # | 문제 | 리뷰 수 | 출처 수 | 평균 별점 |
| --- | --- | --- | --- | --- |
| 1 | 써보기도 전에 결제를 요구한다 (무료 체험 없음) | 40 | 3 | 1.1 |
| 2 | 다크패턴: 써보기도 전에 별 5점 요구, 닫을 수 없는 결제 창, 해지 불가 | 39 | 3 | 1.2 |
| 3 | 판정이 부정확하고 일관성이 없다 (같은 이미지인데 결과가 다름) | 32 | 3 | 1.5 |
| 4 | **진짜를 AI/가짜로 판정한다 (오탐)** → 억울한 누명 | 24 | 3 | 1.6 |
| 5 | 영상, 링크, SNS 게시물을 분석하지 못한다 | 20 | 3 | 2.0 |
| 6 | 뻔한 AI 이미지를 "진짜"라고 한다 (미탐) | 10 | 3 | 1.0 |
| 7 | 안 돌아간다: 무한 로딩, 오류, 강제 종료 | 10 | 3 | 1.1 |
| 8 | **근거 없이 퍼센트(%)만 보여준다** | 4 | 2 | 1.8 (근거 약함) |
| 9 | 실패한 분석에도 크레딧이 차감된다 | 3 | 1 | 1.0 (근거 약함) |

대표 인용 (원문 그대로):

- **#4 오탐** — "it would seem this “detector” is a dud and will lead to wrongful accusations." (App Store, 1★) https://apps.apple.com/us/app/id6744578596?see-all=reviews#review-13706834924
- **#4 오탐** — "This is actually quite dangerous because people could accuse you of using AI when you have not even used it!" (Google Play, 1★) https://play.google.com/store/apps/details?id=com.yella.picmatcher&hl=en&gl=US
- **#3 일관성** — "i put the same image twice and it said it was real then fake" (App Store, 1★) https://apps.apple.com/us/app/id6503948280?see-all=reviews#review-13069604201
- **#6 미탐** — "There’s an image I know for sure is AI and wanted to prove to my dad he’s talking to a scammer but this app said it was 97% real." (App Store, 1★) https://apps.apple.com/us/app/id6503948280?see-all=reviews#review-12933189238
- **#8 설명 없음** — "Simply giving a % without any explanation or elaboration isn't useful, especially as you're charging for this." (Google Play, 2★) https://play.google.com/store/apps/details?id=io.zyur.forgespy&hl=en&gl=US
- **#8 설명 없음** — "People will falsely assume a 75% confidence score falls within the 95% accuracy threshold." (App Store, 2★) https://apps.apple.com/us/app/id6744578596?see-all=reviews#review-14002348716
- **#5 링크** — "pasted a Facebook link into it, failed to extract" (Google Play, 1★) https://play.google.com/store/apps/details?id=io.zyur.forgespy&hl=en&gl=US
- **#1 결제** — "you suck how can we determine if we like the app if we can't use it!" (Google Play, 1★) https://play.google.com/store/apps/details?id=co.appnation.reverseimagesearch&hl=en&gl=US
- **#9 크레딧** — "Every obvious AI video I tried to analyze it gave an error but took the credits anyway." (Google Play, 1★) https://play.google.com/store/apps/details?id=io.zyur.forgespy&hl=en&gl=US

> #8은 리뷰 수는 적지만, #3·#4·#6의 불만이 결국 "왜 그렇게 판정했는지 모르겠다"로 모입니다. **당신의 아이디어("실제는 이것이고, 그래서 이것은 가짜다")가 바로 이 빈자리를 겨냥합니다.**

## 2. 빠져 있는 것 (사용자가 직접 요청한 기능)

| # | 요청 | 리뷰 수 | 출처 수 |
| --- | --- | --- | --- |
| 1 | 결제 전에 먼저 써보고 싶다 (영상 포함) | 40건 중 다수 | 3 |
| 2 | 영상과 링크를 분석하는 기능 | 20 | 3 |
| 3 | 판정 근거와 설명 | 4 | 2 (근거 약함) |

- "My suggestion is to provide more ability to test vdeo and links before deciding to purchase!" (Google Play, 3★) https://play.google.com/store/apps/details?id=io.zyur.forgespy&hl=en&gl=US
- "i need a FREE fact checker app." (App Store, 1★) https://apps.apple.com/us/app/id6741088235?see-all=reviews#review-13065461742

## 3. 아무도 해결하지 못한 것 (포지셔닝 기회)

| # | 비어 있는 영역 | 리뷰 수 | 출처 수 |
| --- | --- | --- | --- |
| 1 | 워터마크/C2PA는 스크린샷 한 번이면 사라지고, SynthID는 자사 모델 결과만 잡는다 → **출처를 추적하는 방식**이 필요하다 | 57 | 1 (HN만, 근거 약함) |
| 2 | 사기꾼·캣피싱·가족을 속이는 이미지를 확인하려는 일반인 | 6 | 2 (근거 약함) |
| 3 | 유명인·정치가 아닌 지역·일상 뉴스 팩트체크 | 6 | 2 (근거 약함) |

- "C2PA/Content Credentials embed metadata in the file. Screenshot the image and the provenance is gone. AI detectors are probabilistic and unreliable." (HN) https://news.ycombinator.com/item?id=46997087
- "It seems like the Google method here is identifying their synthid markings on content. Which won't cause false positives but only catches content from tools that actively adds this m…" (HN) https://news.ycombinator.com/item?id=48306891
- "I downloaded verifi fact check so that I can verify everyday news about everyday people not just famous people" (App Store, 1★) https://apps.apple.com/us/app/id6741088235?see-all=reviews#review-13732952769

---

## 4. 수정 계획 (근거 × 고치기 쉬운 정도 순)

| # | 무엇을 만들거나 바꾸나 | 크기 | 담당 스킬 | 근거 |
| --- | --- | --- | --- | --- |
| F1 | **근거 카드형 판정 결과**: 퍼센트 하나 대신 "확인한 것 / 찾은 원본 / 차이점 / 결론"을 보여줌. 판정은 `진짜 근거 있음 · 조작 근거 있음 · 판단 불가` 세 단계 | M | replica-build | 싫어하는 것 #8, #3, #4 |
| F2 | **원본 추적**: 역이미지 검색으로 가장 이른 게시본을 찾고, 원본과 첨부 이미지를 나란히 비교해 "실제는 이것, 바뀐 곳은 여기"를 표시 | L | replica-backend | #4, #6, 해결 안 된 것 #1 |
| F3 | **출처 신호 묶음 검사**: C2PA/Content Credentials 서명, EXIF, 알려진 워터마크(SynthID 등 공개된 검출 수단), 픽셀 기반 AI 탐지기를 각각 별도 근거로 표시. 한 신호만으로 결론 내지 않음 | M | replica-backend | #3, #4, 해결 안 된 것 #1 |
| F4 | **URL·기사 입력**: 링크를 넣으면 본문 주장과 이미지를 추출하고, 공개된 팩트체크 기록(예: Google Fact Check Tools API, 연동 전 약관 확인)과 신뢰 매체 보도를 출처 링크와 함께 대조 | L | replica-backend | #5, 해결 안 된 것 #3 |
| F5 | **"판단 불가"를 정직하게 표시**하고 오탐 가능성을 결과 화면에 항상 고지. "이 결과로 사람을 비난하지 마세요" 안내 포함 | S | replica-build | #4 ("wrongful accusations") |
| F6 | 같은 입력에는 같은 결과: 파일 해시 기준으로 캐시하고 재현성을 보장 | S | replica-backend | #3 ("same image twice") |
| F7 | 가입·결제 없이 하루 몇 건 무료, 실패한 분석은 차감하지 않음, 첫 실행 때 별점 요청 금지, 한 번에 해지 | S | replica-launch | #1, #2, #9 |
| F8 | 영상: 키프레임을 추출해 F2·F3 파이프라인에 태움 (2단계 출시) | L | replica-backend | #5 |

`features.csv`에 F1~F8을 `original=no` 행으로 추가했습니다. 가격·과금 관련(F7)은 `/replica-launch`에서 다룹니다.

## 5. 포지셔닝 (3안)

**A. 근거를 보여주는 판정 (추천)**
> 퍼센트 하나만 보고 "이거 진짜야?"를 판단해야 했던 사람들을 위해, [앱 이름]은 원본을 찾아 나란히 보여주고 "실제는 이것이고, 그래서 이것은 조작이다"를 출처 링크와 함께 설명합니다.
> 근거: 오탐 24건, 부정확·불일치 32건, 미탐 10건, 설명 없음 4건 (각 3개 출처, 설명 없음만 2개 출처)

**B. 억울한 누명을 막는 탐지기**
> 내가 직접 만든 그림이나 사진이 "AI"로 찍혀 곤란했던 창작자를 위해, [앱 이름]은 확실하지 않으면 "판단 불가"라고 말하고 그 이유를 보여줍니다.
> 근거: 오탐 24건, 3개 출처

**C. 우리 가족을 지키는 사기 확인 도구**
> 부모님이 대화하는 상대의 사진이 진짜인지 확인하고 싶은 사람을 위해, [앱 이름]은 그 사진이 원래 어디에 올라왔던 것인지 찾아 보여줍니다.
> 근거: 사기·캣피싱 6건, 2개 출처 (근거 약함, 추가 조사 필요)

**추천: A.** 당신의 아이디어와 그대로 맞고, 가장 큰 불만 묶음(#3·#4·#6·#8)을 한 번에 해결하며, B와 C는 A의 결과 화면에서 자연스럽게 따라옵니다. B는 창작자 커뮤니티, C는 40~60대 가족 사용자를 겨냥한 마케팅 메시지로 활용하세요.

## 6. 만들 가치가 있나?

**있습니다.** 이유는 세 가지입니다.

- 불만이 뚜렷하고, 여러 앱과 여러 출처에서 되풀이됩니다.
- 기존 앱은 대부분 "분류기 하나 + 퍼센트 + 강한 결제 유도" 구조라서, 근거 중심 설계만으로도 차별화됩니다.
- HN 토론에서 확인되듯, 픽셀 탐지만으로는 정확도에 한계가 있다는 것이 업계의 공감대입니다. 따라서 **"원본 추적 + 출처 신호 + 팩트체크 대조"를 조합한 설계**가 기술적으로도 더 방어력이 있습니다.

주의할 점: AI 탐지는 원리상 100% 정확할 수 없습니다. "진짜/가짜"를 단정하지 말고 **근거와 확신 수준**을 보여주는 것이 신뢰와 법적 리스크 양쪽에서 중요합니다. 그리고 이 리뷰들은 리서치 자료일 뿐이니, 랜딩페이지 후기로 쓰면 안 됩니다.

다음 단계: `/replica-brand` (이름·디자인 정하기)
