# Architecture: Pairsight (TruthScan·Hive Detect의 핵심 흐름 + 원본 추적)

근거 문서: [recon.md](recon.md) (화면 S01~S11, 흐름 F01~F06), [features.csv](features.csv) (23행), [fixes.md](fixes.md) (fix-F1~F8)
작성일: 2026-10-18

## 스택

| 계층 | 선택 | 이유 |
| --- | --- | --- |
| 웹 | Next.js (App Router) + TypeScript | 서버 액션과 API 라우트를 한 저장소에 둘 수 있고, 결과 공유 페이지(S10)를 서버에서 렌더링하면 미리보기 카드가 잘 나옴 |
| 스타일 | Tailwind + `design/tokens.json` | replica-brand에서 만든 토큰(plum, 판정 3색)을 그대로 테마로 매핑 |
| 데이터베이스 | Postgres on Supabase | DB, 인증, 파일 저장, RLS를 한 곳에서 관리. 무료 등급으로 시작 가능 |
| ORM | Drizzle | SQL에 가까워서 `schema.sql`과 일대일로 맞추기 쉬움 |
| 인증 | Supabase Auth (익명 로그인 → 이메일 매직 링크 / Google로 연결) | 비회원도 처음부터 user_id를 가지므로 RLS 규칙이 하나로 통일됨. 가입하면 같은 id에 계정을 연결해서 기록이 유지됨 |
| 결제 | Stripe Checkout + Customer Portal | 해지를 Stripe 포털에서 버튼 하나로 처리(리뷰 불만 #2 대응). 1단계에서는 무료만 출시하고 결제는 3단계로 미룸 |
| 이메일 | Resend | 매직 링크와 영수증만 보냄 |
| 작업 큐 | Inngest | 분석 파이프라인이 외부 API를 여러 번 부르는 다단계 작업이라, 단계별 재시도와 중복 실행 방지가 필요함 |
| 파일 | Supabase Storage (비공개 버킷, 서명 URL 업로드) | 업로드 이미지는 비공개로 두고 서버만 읽음 |
| 호스팅 | Vercel | Next.js 기본 배포. 무거운 이미지 비교가 함수 시간 제한에 걸리면 이 단계만 Fly 워커로 분리 |

### 외부 신호 제공자 (모두 공식 공개 API, 사용자 본인 키)

| 신호 (evidence.kind) | 후보 | 비고 |
| --- | --- | --- |
| source_match (원본 추적) | **결정됨:** Google Cloud Vision Web Detection(모든 검사) + TinEye API(날짜가 필요할 때) + Google Fact Check `claims:imageSearch`. Bing Visual Search는 2025-08-11 종료 | **가장 중요한 결정입니다.** Vision은 일치 이미지와 페이지를 주지만 "처음 본 날짜"는 주지 않습니다. 날짜가 필요하면 TinEye(유료)를 검토하세요. 2단계 전에 두 서비스에 같은 이미지 20장을 넣어 비교해 보길 권합니다 |
| c2pa | Content Authenticity Initiative의 오픈소스 C2PA SDK | 서명 검증까지 서버에서 처리 |
| exif | exifr 같은 오픈소스 라이브러리 | 촬영 기기, 편집 소프트웨어 흔적 |
| watermark, pixel_model, screen_recapture | Hive 또는 TruthScan의 공개 API, 혹은 오픈 모델 | **경쟁사 API를 쓰는 것이 각 사 약관에 맞는지 먼저 확인해야 합니다.** 어느 쪽이든 판정을 혼자 결정하지 못하는 보조 신호로만 씁니다 |
| fact_check | Google Fact Check Tools API (claims:search) | URL·기사 입력 시 사용(2단계) |
| (기사 본문 추출) | Mozilla Readability | 유료 기사나 로그인이 필요한 페이지는 추출하지 않고 안내만 함 |
| (주장 추출) | LLM (Anthropic API) | 모델과 프롬프트는 `/replica-backend`에서 정함 |

### 판정 규칙 v1 (fix-F1, F5. `analyses.pipeline_version = 1`)

픽셀 탐지 점수 하나로는 절대 결론을 내리지 않습니다.

판정은 5종이고, 이름은 [design/glossary.md](design/glossary.md)를 따릅니다. 근거 강도는 강/중/약 하나로 통일하고, **AI 탐지(pixel_model)는 항상 약**입니다(DB 제약으로 강제).

- **AI 생성 (`ai_generated`):** 강한 근거가 하나라도 있으면 이 판정입니다.
  - 유효한 C2PA 서명에 AI 생성이 기록되어 있다.
  - 알려진 AI 워터마크가 높은 신뢰도로 검출된다.
- **편집 조작 (`edited`):** 더 이른 원본(`is_earliest`)이 있고, 그 원본과 의미 있는 차이 영역이 있다. 또는 C2PA에 AI 편집 기록이 있다.
- **맥락 조작 (`miscontextualized`):** 이미지 자체는 원본과 거의 같지만(similarity ≥ 0.98), 다음 중 하나가 있다.
  - 팩트체크 기관이 이 이미지를 이미 다른 사건의 사진으로 판정했다(Fact Check `claims:imageSearch`).
  - 사용자가 말한 사건 날짜보다 확실히 이른 날짜의 기록이 있다(TinEye가 처음 발견한 날짜, 또는 페이지에 적힌 게시일).
  - **날짜 근거가 없으면 맥락 조작으로 판정하지 않습니다.**
- **진짜 확인 (`authentic`):** 조작 쪽 강한 근거가 하나도 없고, 다음 중 하나가 있다.
  - 유효한 C2PA가 카메라 촬영을 증명하고, AI 편집 기록이 없다.
  - 이른 원본과 거의 같고, 맥락 문제가 없다.
- **판단 불가 (`inconclusive`):** 나머지 모든 경우입니다. 특히 강한 신호 없이 픽셀 모델 점수만 높거나 낮을 때, 그리고 신호끼리 엇갈릴 때가 여기에 해당합니다.

규칙을 바꾸면 `pipeline_version`을 올립니다. 같은 입력에 예전 판정을 재사용하지 않게 하기 위해서입니다(fix-F6).

## 스키마

테이블 8개: `profiles`, `analyses`, `checks`, `evidence`, `source_matches`, `claims`, `usage_days`, `stripe_events`
접근 규칙: **Postgres RLS.**

- 브라우저는 자기 `checks`, 그리고 그 검사가 가리키는 분석 결과만 읽을 수 있습니다.
- 쓰기는 모두 서버가 service role로 합니다.
- 공유 링크(S10)는 서버가 렌더링합니다.

SQL 전체: [schema.sql](schema.sql)

핵심 설계:

- **분석 결과를 사용자끼리 공유합니다(`analyses`).** 키는 `(input_type, input_key, pipeline_version)`이고, `input_key`는 파일 바이트의 sha256입니다. 같은 이미지는 누가 넣어도 같은 결과를 받습니다(fix-F6). 외부 API 비용도 한 번만 듭니다.
- `checks`는 사용자의 요청입니다. 업로드 파일, 공유 슬러그, 과금 여부를 가집니다. `on delete restrict`를 걸어 두어서, 검사가 남아 있는 분석은 지워지지 않습니다.
- 원본으로 표시할 수 있는 매치는 분석마다 하나뿐입니다(부분 유니크 인덱스).
- 무료 한도는 `take_quota()`로 처리합니다. upsert 한 문장으로 원자적으로 동작하므로, 두 탭에서 동시에 제출해도 한도를 넘지 못합니다. 실패한 분석은 `refund_quota()`로 돌려줍니다(fix-F7).

**제약 조건 검증 (2026-10-18, PGlite 0.5.10 / PostgreSQL 18.6, 판정 5종 반영 전):** 스키마가 오류 없이 생성됐고, 동작 테스트 9개가 모두 통과했습니다.

| 테스트 | 결과 |
| --- | --- |
| 한도 2에서 세 번째 요청 | 거부 |
| 프로필이 없는 사용자 | false를 반환하고 사용량을 기록하지 않음 |
| 판정 없이 done 상태로 변경 | 거부 |
| 같은 입력 키 중복 | 거부 |
| 파일 없는 이미지 검사 | 거부 |
| 원본 표시 2개 | 거부 |
| 잘못된 신호 종류 | 거부 |
| 같은 분석·신호·제공자의 결과 중복 저장 | 거부 (재시도 시 upsert) |
| 사용자 삭제 | 그 사용자의 검사와 사용량이 함께 삭제되고, 공유 분석은 남음 |

**RLS 검증 (2026-10-18): 33개 테스트 모두 통과.** [tests/rls_test.py](tests/rls_test.py) · 결과 [tests/rls_test.result.txt](tests/rls_test.result.txt)

- **환경:** PostgreSQL 17.11에 Supabase의 역할(anon, authenticated, service_role)과 `auth.uid()`, 기본 권한(public의 모든 테이블·함수를 anon/authenticated에 부여)을 재현했습니다([tests/supabase_bootstrap.sql](tests/supabase_bootstrap.sql)).
  - **Supabase 로컬(`supabase start`)은 실행하지 못했습니다.** 이 서버에서 Docker 소켓 권한이 없기 때문입니다. Supabase에 배포하기 전에 Docker가 되는 컴퓨터에서 같은 테스트를 `supabase db reset` 뒤에 한 번 더 돌리세요.
- **확인한 것:**
  - 사용자 A는 자기 검사만 봅니다. B의 검사는 id로도, 공유 슬러그를 추측해도 보이지 않습니다.
  - 같은 이미지를 둘 다 검사했다면 공유 분석은 둘 다 보지만, 상대의 검사 행은 보이지 않습니다.
  - JWT 없는 요청은 아무것도 읽지 못합니다.
  - 브라우저에서는 요금제 올리기, 사용량 초기화, 판정 바꾸기, 검사·근거 넣기가 모두 막힙니다.
  - 무료 한도 함수는 브라우저에서 호출할 수 없고, 서버(service_role)만 호출할 수 있습니다.
- **고친 것:** `take_quota`/`refund_quota`의 실행 권한을 public, anon, authenticated에서 명시적으로 회수했습니다.
  - 지금 정의(security invoker)에서는 함수 안의 RLS가 이미 효과를 막고 있었습니다.
  - 하지만 함수를 security definer로 바꾸면 A가 B의 무료 횟수를 소진시킬 수 있다는 것을 테스트로 확인했습니다. 회수하면 그 경우에도 막힙니다.

## API

### F01 의심 이미지를 확인한다 (S01 → S02 → S03)

| method path | 하는 일 | 호출 가능 | 입력 | 출력 |
| --- | --- | --- | --- | --- |
| POST /api/uploads | 비공개 버킷에 올릴 서명 URL 발급 | 로그인한 사용자(익명 포함) | file_name, size, mime | upload_url, file_path |
| POST /api/checks | 한도 차감 → 분석을 찾거나 새로 만듦 → 검사 생성 → 아직 없으면 `analysis.requested` 이벤트 발행 | 로그인한 사용자(익명 포함) | { file_path } 또는 { url } | check_id, analysis status |
| GET /api/checks/:id | 상태와 결과 조회. 화면은 1초 → 2초 → 4초 간격으로 다시 조회 | 검사 소유자 | — | status, verdict, evidence[], source_matches[] |

### F02 찾은 원본과 비교한다 (S03 → S04)

| method path | 하는 일 | 호출 가능 | 입력 | 출력 |
| --- | --- | --- | --- | --- |
| GET /api/checks/:id/compare?match=:matchId | 원본과 첨부 이미지의 정렬된 쌍, 차이 영역 | 검사 소유자 | match id | 두 이미지의 서명 URL, diff_regions |

### F03 기사 링크를 확인한다 (S01 → S02 → S05) · 2단계

POST /api/checks에 `{ url }`을 넣는 같은 경로를 씁니다. 결과는 GET /api/checks/:id의 응답에 `claims[]`가 추가되는 방식이고, 기사 속 이미지는 각각 하위 분석으로 처리합니다.

### F04 결과를 공유한다 (S03 → S10)

| method path | 하는 일 | 호출 가능 | 입력 | 출력 |
| --- | --- | --- | --- | --- |
| POST /api/checks/:id/share | 추측하기 어려운 슬러그 생성 | 검사 소유자 | — | share_url |
| DELETE /api/checks/:id/share | 공유 해제 | 검사 소유자 | — | 204 |
| GET /r/:slug (페이지) | 읽기 전용 결과. 서버가 service role로 렌더링 | 누구나 | — | HTML + OG 이미지 |

### F05 가입한다 (S07)

| method path | 하는 일 | 호출 가능 | 입력 | 출력 |
| --- | --- | --- | --- | --- |
| GET /auth/callback | 매직 링크 또는 Google 로그인을 마무리하고, 익명 계정에 연결 | Supabase 리다이렉트 | code | 세션 쿠키 |
| GET /api/history | 내 검사 목록 (S06) | 로그인한 사용자 | cursor | checks[] |

### F06 해지하거나 데이터를 삭제한다 (S09)

| method path | 하는 일 | 호출 가능 | 입력 | 출력 |
| --- | --- | --- | --- | --- |
| POST /api/billing/checkout | Stripe Checkout 세션 생성 (3단계) | 가입한 사용자 | plan | url |
| POST /api/billing/portal | Stripe 고객 포털(해지, 결제수단 변경) | 가입한 사용자 | — | url |
| DELETE /api/account | 업로드 파일 삭제 → auth 사용자 삭제(연쇄 삭제) → Stripe 고객 삭제 | 본인 | 확인 문구 | 204 |

### 웹훅과 작업

- **들어오는 웹훅:** `POST /api/webhooks/stripe`. 서명을 검증하고, `stripe_events`에 이벤트 id를 먼저 넣은 다음 처리합니다. Inngest는 `/api/inngest` 엔드포인트로 연결합니다.
- **나가는 웹훅:** 1단계에서는 없습니다.

| 작업 | 언제 | 하는 일 |
| --- | --- | --- |
| analyze.image | `analysis.requested` 이벤트 | 해시 확인 → C2PA·EXIF → 워터마크·픽셀 모델 → 역이미지 검색 → 원본 후보 내려받기 → 정렬·차이 계산 → 판정 규칙 적용. 단계마다 결과를 `evidence`에 저장하고, 재시도해도 같은 행을 덮어씀 |
| analyze.url | `analysis.requested` (url) · 2단계 | 가져오기(SSRF 차단) → 본문 추출 → 주장 추출 → 팩트체크 검색 → 기사 속 이미지마다 analyze.image 실행 |
| reap.stale | 10분마다 | running 상태로 15분이 넘은 분석을 failed로 바꾸고 관련 검사의 한도를 돌려줌 |
| cleanup.anon | 매일 03:00 UTC | 30일 넘게 쓰지 않은 익명 사용자와 그 파일 삭제 |

## 까다로운 부분

- **같은 이미지 동시 제출:** 두 사람이 같은 이미지를 동시에 넣는 경우입니다. `insert … on conflict do nothing returning`으로 처리하고, 결과가 없으면 select로 기존 분석을 가져옵니다. 이벤트는 분석을 새로 만든 쪽만 발행합니다.
- **중복 실행:** Stripe 이벤트는 `stripe_events`로 중복을 걸러냅니다. Inngest 단계는 재시도될 수 있으므로, 결과를 `(analysis_id, kind, provider)` 유니크 키로 upsert해서 여러 번 실행해도 결과가 같게 합니다.
- **무료 한도 경쟁:** `take_quota()` 한 문장이 원자적으로 처리합니다. 실패한 분석은 refund로 돌려줍니다. 날짜 기준은 UTC이고, 화면에는 사용자 현지 시각으로 "자정에 초기화"라고 표시합니다.
- **외부 API 한도와 비용:** 역이미지 검색이 건당 가장 비쌉니다. 분석 결과를 해시 기준으로 공유하므로 같은 이미지는 한 번만 호출합니다. 제공자별 분당 한도를 넘으면 Inngest가 지수 백오프로 재시도합니다.
- **파일 크기와 형식:** 10MB 상한은 DB 제약과 서명 URL 양쪽에 둡니다. HEIC는 서버에서 변환합니다. 원본 후보를 내려받을 때도 크기와 시간 제한을 둡니다.
- **URL 가져오기 보안 (SSRF):** 사설 IP, localhost, 메타데이터 주소를 차단하고, 리다이렉트를 따라갈 때마다 다시 검사합니다. 시간 제한은 10초, 크기 제한은 5MB입니다.
- **실시간 갱신:** 1단계는 폴링으로 충분합니다. Supabase Realtime은 should 항목입니다.
- **개인정보 / 삭제:**
  - 업로드 이미지에 실제 사람이 찍혀 있을 수 있으므로 비공개 버킷에 둡니다.
  - 계정을 삭제하면 파일과 검사를 모두 지웁니다.
  - 공유 분석은 남지만 업로드 파일은 남지 않습니다. 이 동작을 개인정보처리방침(S11)에 적어야 합니다.
- **명예훼손·오판 리스크:** 판정 이름은 용어집의 5종만 쓰고("가짜"라는 말은 판정 이름으로 쓰지 않음), 항상 한 줄 이유를 붙이며, 모든 결과에 고지문을 붙입니다(fix-F5). 공유 페이지에도 고지문을 그대로 표시합니다.
- **제공자 약관:** 경쟁사 API를 신호원으로 쓸 경우, 경쟁 제품에 사용하는 것이 허용되는지 계약 전에 확인해야 합니다.

## 개발 순서

1. **수직 슬라이스** (아직 다듬지 않은 상태로 처음부터 끝까지)
   - 화면: S01 → S02 → S03
   - 테이블: profiles, analyses, checks, evidence, usage_days
   - 라우트: POST /api/uploads, POST /api/checks, GET /api/checks/:id
   - 작업: analyze.image (C2PA + EXIF + 픽셀 모델 1개만)
   - 판정 규칙 v1에서 원본 추적은 아직 "확인 불가"로 둡니다.
   - 목표: 익명으로 접속해 업로드하고, 3단계 판정과 근거 카드를 보는 것까지.
2. **필수 기능 (must 10)**
   - 원본 추적: source_matches, S04, GET /compare (fix-F2)
   - 출처 신호 묶음: 워터마크 추가 (fix-F3)
   - "판단 불가"와 고지문 (fix-F5)
   - 해시 기준 재현성 (fix-F6)
   - 무료 한도와 실패 시 환불 (fix-F7)
   - 미디어 URL 입력
   - 진행 단계 표시
   - 계정·데이터 삭제 (DELETE /api/account, S09)
   - 작업: reap.stale, cleanup.anon
3. **있으면 좋은 기능 (should 6)**
   - 기사 URL과 팩트체크: claims, S05, analyze.url (fix-F4)
   - 검사 기록: S06, GET /api/history
   - 가입·로그인: S07, /auth/callback
   - 공유 링크: S10, share 라우트
   - 결과 리포트 다운로드
   - 요금제 페이지: S08. Stripe 연결은 `/replica-launch`에서 가격을 정한 뒤에 합니다.
4. **선택 기능 (could 3)**
   - 생성 모델 추정
   - 히트맵
   - 영상 키프레임 분석 (fix-F8)

fix-F1~F8은 이미 위 단계에 나뉘어 들어가 있습니다. 1단계가 fix-F1, 2단계가 F2·F3·F5·F6·F7, 3단계가 F4, 4단계가 F8입니다.
