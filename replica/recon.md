# Recon map: TruthScan + Hive Detect (web) → Pairsight

Scope: 핵심 흐름 하나. **이미지(또는 URL)를 넣으면 → 판정 결과를 보여준다.** 텍스트·PDF·오디오 탐지, 기업용 대시보드·팀 관리·일괄(ZIP) 업로드, 크롬 확장은 제외했습니다.
For: Pairsight. 일반 사용자가 대상이고, 포지셔닝은 A "근거를 보여주는 판정"입니다([fixes.md](fixes.md), [brand.md](brand.md)).
Date: 2026-10-18

> **표기 규칙:** 이 문서의 F01, F02…는 **사용자 흐름**입니다. fixes.md의 수정 항목은 **fix-F1 ~ fix-F8**로 구분해서 씁니다.

## 출처

공개 페이지만 사람이 읽는 속도로 읽었습니다. 로그인, 업로드, JS 번들 분석, 네트워크 기록은 하지 않았습니다.

| # | 출처 | URL | 메모 |
| --- | --- | --- | --- |
| 1 | TruthScan 마케팅 사이트 | https://truthscan.com | B2B 사기 방지가 주력. 결과에 "verdict, confidence score, and visual proof"를 준다고 소개 |
| 2 | TruthScan 이미지 탐지 도구 페이지 | https://truthscan.com/ai-image-detector | 입력 방식 탭(Basic / Paste URL / Bulk), 히트맵 비교 슬라이더 |
| 3 | TruthScan 가격 | https://truthscan.com/pricing | 무료 월 25건(카드 불필요), Starter $24/월 1,000건, 오탐률 "<1%" 주장 |
| 4 | TruthScan 이미지 API 문서 (공개) | https://truthscan.com/truthscan-ai-image-detection-api-documentation | 결과 JSON 구조 → 데이터 모델 근거 |
| 5 | Hive AI 탐지 소개 | https://hivemoderation.com/ai-generated-content-detection | B2B 콘텐츠 검수가 주력. 무료 도구: Hive Detect, X 봇, 크롬 확장 |
| 6 | Hive Detect (일반 사용자용) | https://hivedetect.ai/ | 시작 화면은 파일 업로드 또는 미디어 URL 입력 |
| 7 | Hive 모델 Playground | https://thehive.ai/models/hive/ai-generated-and-deepfake-content-detection | 미리 넣어 둔 예시 결과로 결과 화면을 확인. 가격 $6/1,000 이미지 |

참고 화면(배포에는 쓰지 않음): `screens/S-ts-detector.png`, `screens/S-hive-detector.png`, `screens/S-hivedetect-home.png`, `screens/S-hive-playground-result.png`

**확인하지 못한 것:** 두 서비스 모두 실제 업로드 뒤의 화면(분석 중, 오류, 무료 횟수 소진, 회원가입 유도)은 직접 보지 않았습니다. 업로드에는 각 서비스 이용약관이 적용되기 때문입니다. 이 상태들은 아래 표에서 **추정**으로 표시했습니다. 필요하면 사용자 본인이 무료 계정으로 한 번 돌려 보고 화면을 확인하세요(약관에 경쟁 제품 개발 금지 조항이 있는지 먼저 확인).

## 핵심 흐름

의심 가는 이미지를 넣으면 **"AI일 확률"과 근거 신호**를 받는다.

**경쟁사도 이미 근거를 일부 보여준다는 점이 중요합니다.**

- TruthScan은 히트맵, 쉬운 말로 된 설명, 메타데이터·OCR·워터마크·화면 재촬영 신호를 제공합니다.
- Hive는 생성 모델 추정과 Content Credentials(C2PA) 확인을 제공합니다.
- 그러나 **둘 다 "원본을 찾아 나란히 보여주는 기능"은 없습니다.** 결론도 여전히 "AI일 확률 %"입니다.

→ Pairsight의 차별점은 근거가 *있다*는 것 자체가 아니라, **원본 추적(fix-F2)과 "판단 불가"를 정직하게 말하는 3단계 판정(fix-F1, fix-F5)**에 두어야 합니다.

## 화면

경쟁사에서 본 화면에는 [본 화면]으로 출처를 붙였고, Pairsight에만 있는 화면은 **[신규]**로 표시했습니다.

| ID | 화면 | 경로 / 진입 | 목적 | 핵심 구성요소 | 상태 |
| --- | --- | --- | --- | --- | --- |
| S01 | 홈 / 검사 입력 | `/` | 이미지나 URL을 넣는다 | 드롭존, 파일 선택 버튼, URL 입력창, 지원 형식 안내, 약관 링크 | 빈 상태(본 화면: Hive Detect, TruthScan) · 드래그 중, 형식 오류, 용량 초과(추정) |
| S02 | 분석 중 | 제출 직후 | 진행 상황을 보여준다 | 단계 표시(원본 검색 → 출처 신호 → 판정), 취소 | 추정 (경쟁사는 비동기 처리: API의 `status: pending → done`) |
| S03 | 결과: 근거 카드 | `/check/:id` | 판정과 근거를 보여준다 | 판정 배너(3단계), 근거 카드 목록, 출처 링크, 고지문, 공유·다운로드 | 본 화면: Hive Playground(배너 + % 막대 + 생성 출처 + C2PA), TruthScan(히트맵 슬라이더) · Pairsight 3단계 판정은 **[신규]** |
| S04 | 원본 비교 (나란히 보기) | S03 → "원본과 비교" | 찾은 원본과 첨부 이미지를 나란히 놓고 차이를 표시한다 | 좌우 비교 / 슬라이더, 차이 영역 하이라이트, 원본 게시 날짜·링크 | **[신규]** (TruthScan의 "Original ↔ AI Heatmap" 슬라이더가 가장 비슷한 패턴) |
| S05 | 기사 / URL 결과 | `/check/:id` (입력이 URL일 때) | 기사 속 주장과 이미지를 각각 확인한다 | 추출된 주장 목록, 주장별 팩트체크 매칭, 이미지별 S03 카드 | **[신규]** · Hive Detect는 URL 입력을 받지만 결과는 미디어 판정뿐 |
| S06 | 검사 기록 | `/history` | 이전 결과를 다시 본다 | 목록(썸네일, 판정, 날짜), 빈 상태 | TruthScan은 "Detection history in dashboard"를 제공(가격 페이지). 빈 상태는 추정 |
| S07 | 가입 / 로그인 | `/login` | 기록 저장, 무료 횟수 늘리기 | 이메일 매직 링크, Google | 추정 (TruthScan·Hive 모두 로그인 링크는 있지만 화면은 보지 않음) |
| S08 | 요금제 | `/pricing` | 무료 한도와 유료 요금제 | 요금제 카드, FAQ | 본 화면: TruthScan 가격 페이지 |
| S09 | 계정 / 설정 | `/account` | 플랜, 사용량, 데이터 삭제 | 사용량 막대, 해지 버튼, 계정 삭제 | 추정 |
| S10 | 공유된 결과 (공개 링크) | `/r/:slug` | 결과를 가족이나 지인에게 보낸다 | 읽기 전용 S03, "나도 검사하기" 버튼 | **[신규]** (포지셔닝 C: 가족 사기 확인) |
| S11 | 법적 고지 / 판정 방법 설명 | `/how-it-works`, `/terms`, `/privacy` | 오탐 가능성, 판정 기준, 데이터 보관 정책 | 정적 문서 | 경쟁사에도 있음(이용약관, 개인정보처리방침) |

## 흐름

```
F01 의심 이미지를 확인한다 (핵심 흐름)
    S01 -> S02 -> S03
    정상 경로 클릭 수: 2 (파일 선택 1 + 결과 자동 표시; 드래그면 1)
    경쟁사 기준: Hive Detect 2 (Browse → 파일 선택). TruthScan은 "Start Free Analysis" 후 도구 화면으로 이동해서 2~3
    예외: 지원하지 않는 형식, 10MB 초과, 원본을 못 찾음, 신호가 서로 엇갈림 → "판단 불가", 분석 실패 → 횟수 차감 없음

F02 찾은 원본과 비교한다
    S03 -> S04
    클릭 수: 1
    예외: 원본 후보가 여러 개, 원본이 삭제됨(캐시만 남음), 원본이 더 나중 날짜(첨부한 것이 원본일 가능성)

F03 기사 링크를 확인한다
    S01 (URL 붙여넣기) -> S02 -> S05 -> (이미지별) S03
    클릭 수: 2
    예외: 유료 기사·로그인 필요 페이지(본문 추출 안 함, 안내만), robots로 막힌 페이지, SNS 게시물 링크(fix-F4 범위 확인 필요)

F04 결과를 가족에게 공유한다
    S03 -> 공유 -> S10
    클릭 수: 2
    예외: 비공개로 되돌리기, 원본 이미지에 개인정보가 들어 있음

F05 무료 횟수를 다 쓰고 가입한다
    S01 -> (한도 안내) -> S07 -> S01
    예외: 매직 링크 만료, 이미 가입한 이메일

F06 해지하거나 데이터를 삭제한다
    S09 -> 확인 -> 완료
    클릭 수: 2 (리뷰 불만 #2 "해지 불가"에 대한 답)
```

## 구성요소

| 구성요소 | 변형 | 상태 | 사용 화면 |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | 전부 |
| Dropzone | 큰 것(S01), 작은 것(S03 "다른 것 검사") | 빈, 드래그 중, 업로드 중, 오류 | S01, S03 |
| URL input | — | 빈, 입력됨, 잘못된 URL | S01 |
| VerdictBanner | real, fake, unsure → **5종으로 변경됨** ([design/glossary.md](design/glossary.md)) | — (색 + 아이콘 + 라벨 항상 함께) | S03, S05, S10 |
| EvidenceCard | source-match, provenance(C2PA), metadata, watermark, pixel-model, fact-check | 근거 있음, 근거 없음, 확인 불가 | S03, S05 |
| CompareView | side-by-side, slider, diff-highlight | 로딩, 원본 없음 | S04 |
| SourceLink | 외부 링크 + 날짜 + 도메인 | — | S03, S04, S05 |
| ProgressSteps | 3단계 | 진행, 완료, 실패 | S02 |
| HistoryRow | — | 빈 목록 | S06 |
| Disclaimer | 결과 하단 고지 | — | S03, S05, S10 |
| PlanCard, UsageMeter | — | 현재 플랜, 한도 근접 | S08, S09 |
| Toast | success, error | — | 전부 |

## 추정 데이터 모델

```
User        id, email, plan, created_at
            근거: 경쟁사 로그인·가격 페이지 / 신뢰도: high

Check       id, user_id(null 허용: 비회원), input_type (image | url), input_url, file_hash,
            status (pending | done | failed), verdict (real | manipulated | inconclusive → 5종으로 변경됨, glossary.md),
            created_at, share_slug
            근거: TruthScan API /detect → /query (id, status pending/done), fix-F6(같은 해시 = 같은 결과)
            신뢰도: high (status 흐름), Pairsight 고유 판정 값은 설계 결정

Evidence    id, check_id, kind (source_match | c2pa | exif | watermark | pixel_model | ocr | screen_recapture | fact_check),
            outcome (supports_real | supports_manipulated | neutral | unavailable),
            score(null 허용), summary, details(json), source_url
            근거: TruthScan result_details(metadata, ocr, ml_model, warnings[watermark, screen_recapture]),
                  Hive 결과(AI-generated %, Deepfake %, Generation Sources, Content Credentials)
            신뢰도: high (신호 종류), outcome 값은 설계 결정

SourceMatch id, check_id, url, first_seen_at, page_title, similarity, is_earliest, diff_regions(json)
            근거: 경쟁사에 없음. fix-F2 / 신뢰도: guess (역이미지 검색 API가 무엇을 돌려주는지에 따라 달라짐)

Claim       id, check_id, text, fact_check_url, rating, publisher   (URL 입력 시)
            근거: fix-F4 / 신뢰도: guess

Usage       user_id 또는 anon_id, day, count     (무료 한도, 실패는 세지 않음)
            근거: TruthScan 무료 월 25건, fix-F7 / 신뢰도: medium
```

관계: User 1-n Check, Check 1-n Evidence, Check 1-n SourceMatch, Check 1-n Claim

## 기능 매트릭스

`features.csv` 참고. 기존 fix-F1~F8 8행에 recon에서 나온 행을 더했습니다. must 10, should 6, could 3, skip 4.

## 범위 밖 (가져올 수 없거나 가져오면 안 되는 것)

- **경쟁사의 탐지 모델 자체와 학습 데이터.** Pairsight는 공개 API(사용자 본인 키)나 오픈 모델을 쓰거나, 탐지 신호를 외부 제공자에게 맡깁니다.
- **경쟁사의 기업 고객 기능.** SOC 2·ISO 인증, 기업용 SLA, 온프레미스 배포.
- **TruthScan Capture(실시간 재촬영)와 X 봇.** 범위 밖입니다.
- **역이미지 검색 인덱스.** 직접 만들 수 없습니다. 공식 API(예: Google Cloud Vision Web Detection, TinEye API, Bing Visual Search)를 약관에 맞게 써야 하고, 비용이 듭니다.

## 규모

화면 11개, 흐름 6개, 엔티티 6개.

어려운 부분:
1. **원본 추적.** 외부 역이미지 검색 API에 의존하고, 비용과 정확도가 걸려 있습니다.
2. **여러 신호를 3단계 판정으로 합치는 규칙.** 오탐 리스크를 그대로 떠안는 부분입니다.
3. **URL과 기사에서 주장을 추출하고 팩트체크를 매칭하는 일.**
4. **비동기 처리와 결과 재현성.**

크기: **L** (한 분기). 원본 추적 + 이미지 판정만 하는 1단계는 M입니다. URL·기사(fix-F4)와 영상(fix-F8)은 2단계로 미루는 것을 권합니다.
