# Build log (replica-build)

App: `web/` (Next.js 16.4.2, Tailwind 4, TypeScript). Providers: **mock only** (`PAIRSIGHT_PROVIDERS=mock`).
Data: memory store with the same operations as `schema.sql` (no Supabase project connected; no usable Docker socket in the previous session).
Screenshots: `clone-screens/<stage>/`, desktop 1280 (stage 1–2), 1440 (stage 3) and mobile 390.

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-10-18 | done | — | Next 16: middleware is `proxy.ts`, `params`/`cookies()` are async, and Cache Components fail the build on `useParams()` outside `<Suspense>` and on `new Date()` in a client component during prerender. Both caught by `next build`, fixed. |
| S01 | 2026-10-18 | done | thumbnails in the image picker (shows an icon, so the browser does not load third-party images) | The hidden file input had no visible focus; fixed with a `peer` focus ring on the dropzone. Direct image URLs were rejected as "not a page"; now offered as the single image. |
| S02 | 2026-10-18 | done | — | — |
| S03 | 2026-10-18 | done (mock) | 공유 링크 and 재검사 알림 buttons are disabled "준비 중"; v2 heatmap implemented on 2026-10-19; real service adapters pending | The verdict depends on the date the user types, but analyses are shared by image hash, so the verdict is computed per check at read time. Resolved on 2026-10-19: schema stores `checks.claimed_date`, `checks.quota_day`, `analyses.run_number`; verdicts are computed per check, with no shared verdict column. Upgrade migration added. |
| S04 | 2026-10-18 | done (inside S03) | — | — |
| S06 | 2026-10-18 | done | — | — |
| S07 | 2026-10-18 | partial | real email sending, Google sign-in, rate limit on login requests | Resolved on 2026-10-19 in the memory store: existing-account sign-in transfers anonymous checks/uploads and all daily usage atomically, retires the anonymous identity and invalidates pending tokens. Registered accounts are never merged. |
| S09 | 2026-10-18 | done | — | — |
| S08 | 2026-10-18 | placeholder | payments excluded this round | — |
| S10, S11 | 2026-10-18 | placeholder / text only | share links (should), full 판정 방법 page | — |

## Verification, stage 1 (upload → 분석 중 → 결과)

- All five verdicts, 판단 불가 + 원본 없음, and 분석 실패 rendered from mock fixtures at 1280 and 390 (14 screens), 0 console errors, no horizontal scroll.
- 원본 없음 block appears exactly for the scenarios with no match (no_source, ai_generated).
- Keyboard only: URL → pick image → result works; focus is visible.
- Unit tests: 41 (verdict engine 12, SSRF guard + extractor 29).
- Real network checks: public image URL accepted after a redirect; `example.com` → 이미지 없음; `127.0.0.1`, `169.254.169.254` and `localtest.me` (resolves to ::1) blocked, the last one at connect time.
- Pretendard was not loading at first (token said `Pretendard`, the font registers `Pretendard Variable`); fixed in `tokens.json`.

## Verification, stage 2 (로그인 · 무료 한도 · 검사 기록)

Server run with a daily limit of 2 to reach the 한도 소진 screen. At 1280 and 390:

- Meter 2/2 → two checks → 0/2 → third upload shows 오늘 무료 검사를 다 썼어요; the refused attempt is not counted.
- Anonymous history shows both checks; DEV magic link sign-in keeps them (same user id), limit rises to 10, header switches to 내 계정.
- Delete button stays disabled until 삭제합니다 is typed; after deletion the history is empty.
- Only console errors: the two intended 429 responses, logged by the browser.
- Found and fixed from the screenshots: the page-address input collapsed to ~0px height on mobile (`flex-1` in a column); S01 shots retaken.
- Unit tests: 46 (adds quota, refund, cascade delete, single-use login token).

## 나중에 할 것

- [ ] TinEye API 약관 직접 확인: 상업 이용, 결과 캐싱, 결과·미리보기 표시 (Cloudflare 때문에 자동으로 못 읽음)
- [ ] 한국 언론·커뮤니티 이미지 커버리지 벤치마크: 언론 30장 + 커뮤니티 20장을 Google Vision과 TinEye에 비교
- [ ] Supabase 클라우드 개발 프로젝트에서 RLS·스키마 테스트 43개 재실행 (`replica/tests/rls_test.py`, 지금까지는 Supabase를 흉내 낸 Postgres 17에서만 통과)

Found during the build (also later):

- [x] schema.sql: per-check claimed date and computed verdict, UTC quota day, recheck run number and source-date provenance; upgrade migration verified locally (2026-10-19)
- [ ] Real providers behind the existing interfaces: Vision Web Detection, TinEye, Fact Check `claims:imageSearch`, C2PA SDK
- [ ] Email sending for magic links (Resend), then remove the DEV link path; set `PAIRSIGHT_SESSION_SECRET` in every deployed environment
- [x] Merge anonymous checks, uploads and UTC daily usage into an existing account on sign-in in the memory store (2026-10-19); Supabase transaction still needed when implementing that adapter
- [ ] Image picker thumbnails through a server proxy (today an icon, so the browser never loads third-party images)
- [ ] `/dev/fixtures` and `isMock` are decided at build time; set `PAIRSIGHT_PROVIDERS` before `next build`
- [ ] Jobs from architecture.md: reap.stale, cleanup.anon


## Verification, stage 3 (2026-10-19, Codex continuation)

- Confirmed existing three local commits and a clean worktree before continuing. Node v24.22.0 is installed in the user's local Node directory.
- Removed the shared stored verdict from the domain and SQL schema. `verdictForCheck` remains the single place applying the user's claimed date. Added explicit `run_number`; reuse now chooses the newest usable run even when runs share a timestamp.
- Added `checks.claimed_date`, `checks.quota_day`, and `source_matches.first_seen_source`. Added `migrations/002_check_context_and_runs.sql` for the previous schema; fresh databases use `schema.sql` only.
- Replaced separate token consumption/linking with `completeLogin`, an atomic memory-store operation. Anonymous checks, upload access and every day's usage transfer to the existing account. Consumed, expired and deleted-account tokens are rejected; other pending links from a linked/merged identity are invalidated. Switching registered accounts does not move their history or change their email.
- Found by browser verification: NextURL normalizes loopback IPs to localhost. Absolute DEV login links split session cookies between hosts. DEV links and callback redirects now use relative paths and preserve the browser's origin.
- Unit tests: **57 passed**. ESLint, TypeScript and production build passed. The initial sandbox build failed because the CSS compiler needs a local socket; a clean build with the necessary execution permission passed.
- Disposable PostgreSQL **17.11**: **43/43 RLS and schema tests passed** (33 existing permissions tests adapted to computed verdicts + 10 context/run checks). Production/Supabase data was not touched.
- Previous-schema migration: **8/8 checks passed**, covering preserved evidence/checks/file references, original UTC quota day, unknown date provenance, completed status, rechecking and RLS.

Browser: **9/9 checks passed**, including real upload → first sign-in → existing-account merge → recheck → deletion, rejected retired sessions/used links, and same-origin redirects. History renders at 1440px and 390px with no horizontal scroll or console/page errors. Reproduce with `replica/tests/account_flow.cjs` against a disposable local mock server (requires Playwright). Browser results are recorded in `clone-screens/stage3/verification.json` with desktop/mobile screenshots. External search, cloud persistence/auth, email sending and article-body fact checking remain unimplemented. No payment or deployment work was done.

## Verification engine v2 — 2026-10-19

Design and service terms/quota findings: [verification-pipeline.md](verification-pipeline.md). No Supabase project, paid services or real provider keys connected.

- Six provider stages now run end to end: bounded input, reverse/fact-check discovery, candidate page/date verification, actual image comparison + EXIF and mock C2PA, per-check mock LLM context, conservative verdict v2.
- HTML metadata/caption parsing and robots/rate/SSRF policy execute with fixture transports. No real HTTP fallback in mock mode. Live HTTP compatibility adapter now uses the same policy gate.
- Real pHash, crop/flip registration, color normalization, local difference regions and small heatmaps use owned pixel-pair fixtures. C2PA signature validation, external APIs and LLM inference remain mock.
- Removed unsafe v1 conclusions based only on old page dates, earlier identical copies or pixel differences. Fact-check lookup alone does not decide; current claim and image/page must match. Historical dates must bind to the compared image hash. Context strength is capped at medium and cited text is checked.
- Raw uploaded/candidate bytes are request-memory only. New upload storage contains stripped <=512px thumbnails. Rechecks explicitly cannot revalidate original EXIF/C2PA. Excerpts are <=200 Unicode characters per source; temporary image URLs are revoked and omitted from results.
- UI adds a claim field, review cards, source excerpts/citations, date provenance/confidence, transforms and a 128px difference heatmap. Image containers follow uploaded aspect ratio. Incomplete verification is distinguished from no source.

Validation: 97 unit/integration tests; lint; TypeScript; production build passed. Browser: 8 fixture states at 1440 and 390 (16 renders) plus URL+claim flow, 17 scenarios passed; 9 account/merge/recheck/deletion regressions passed. No browser console/page errors or horizontal overflow. Captures in `clone-screens/stage4/` and `stage4-account/`.

The browser API assertions use same-origin page fetch so the real browser's localhost Secure-cookie behavior matches the UI. The old date-only expectations in unit/account tests were replaced with conservative inconclusive results. Existing account behavior and historical files were preserved.

Limitations: fixture success is not real-world detector accuracy; current alignment is bounded and cannot guarantee arbitrary rotations/perspective or tiny crops. Existing schema.sql and migration 002 describe the prior account stage; v2 persistence requires a new migration and RLS review before Supabase. Wayback commercial use conditions and numeric Google/Wayback quotas remain unresolved as detailed in the design. Firecrawl scrape robots/no-bypass guarantees are not established, so it is not selected.

## Verdict v3: trusted sources (2026-10-19)

- Rules: `web/lib/verdict.ts` (`v3.trusted_edited`, `v3.trusted_context`, `v3.capture_vs_trusted_conflict`), list `web/config/trusted-sources.json`, criteria `replica/trusted-sources.md`, spec `replica/verification-pipeline.md` §5-1.
- `VerdictResult` now carries `rule`, `strength`, `headlineFinding`; the banner shows 핵심 발견 ("단, …" first on 판단 불가) and the deciding strength.
- v2 vs v3 on fixtures (same evidence, real pipeline): only `trusted_edited` (판단 불가 → 편집 조작, 중) and `trusted_context` (판단 불가 → 맥락 조작, 중) change, and only under the mock list; the production list changes no fixture (they use .test domains).
- Found while measuring: the `edited` fixture changes 1.8% of the grid but leaves a region, so "same picture" now needs **no regions** as well as <2% change. Benign transforms (JPEG, crop, flip, colour) measured with 0 regions.
- **Fixed 2026-10-19 (follow-up):** v2's image-bound-date rule and the fact-check image match also required only <2% change; both now also require no diff region, so a lightly edited copy is no longer called 맥락 조작 or matched to a fact-check. Counterexample tests added.
- Eval harness: `web/eval/` (README there). Mock smoke run on the example cases: 9/9 as expected, 판단 불가 55.6% → 33.3%, 반대 판정 0. No real-case run yet (needs a Vision key and cases).
- Tests: 148 (adds v3 rules + counterexamples 41, fixtures v2/v3 3, eval + Vision adapter 7). Screens: `clone-screens/stage3-v3/`, 1280 and 390, 0 console errors.

---

# 인수인계 (2026-10-19, 커밋 9bb7553 기준)

## 현재 상태

- **앱:** `web/` (Next.js 16.4.2, App Router, Tailwind 4, TypeScript). `PAIRSIGHT_PROVIDERS=mock`만 동작합니다. 외부 서비스(Supabase, Google, TinEye, Wayback, LLM)는 앱에 연결되어 있지 않습니다.
- **데이터:** 메모리 저장소(`web/lib/data/store.ts`). `replica/schema.sql`의 규칙을 따르지만 아직 DB에 연결하지 않았습니다.
- **판정:** v3 = v2 + 신뢰 출처 규칙(`web/lib/verdict.ts`).
  - 결과에 `rule`, `strength`, `headlineFinding`을 담습니다.
  - "같은 사진"은 v2·v3 모두 **변화 2% 미만 + 차이 영역 0개**일 때만 인정합니다. 팩트체크 이미지 일치도 같은 기준입니다.
  - 신뢰 출처 목록: `web/config/trusted-sources.json`. 편집 검토 전 초안입니다. 기준은 `replica/trusted-sources.md`에 있습니다.
- **평가 하네스:** `web/eval/`. 라벨은 사실 4종만 받고, 결과를 맞힘 / 판단 불가 / 오판으로 나눕니다. 오판은 정답과 다른 확정 판정 전부입니다.
  - 파일럿 30건 템플릿과 절차: `web/eval/README.md`
  - Google Vision 어댑터는 하네스에서만 씁니다(`web/lib/providers/google-vision.ts`).
  - 키가 없으면 mock으로 돕니다.
- **검증:** 테스트 155개 통과(`PAIRSIGHT_MOCK_DELAY_MS=0 npm test`), `tsc`·`eslint`·`next build` 통과. 하네스 mock 실행으로 예시 8건 확인(맞힘 6, 판단 불가 2, 오판 0).
- **문서:**
  - 판정·파이프라인 사양: `replica/verification-pipeline.md` (§5-1이 v3)
  - 용어: `replica/design/glossary.md`
  - 화면·문구: `replica/design/components.md`
  - 화면 캡처: `replica/clone-screens/stage1`, `stage2`, `stage3-v3`. `stage3`, `stage4`, `stage4-account`는 추적 해제(.gitignore).

## 미완료

1. **실제 사례 파일럿 미실행.** 사용자가 Vision 키와 30건(`web/eval/cases.jsonl` + `web/eval/images/`)을 준비하는 중입니다. 지금까지 측정은 모두 합성 fixture 기준이라, 실제 사진에 대한 정확도는 알 수 없습니다.
2. **실제 모드에서 판정할 수 없는 것:**
   - C2PA·워터마크 검증, 팩트체크 검색(임시 공개 URL 필요), Wayback 날짜는 하네스에 연결하지 않았습니다.
   - 그래서 진짜 확인과 AI 생성은 실제 모드에서 거의 판단 불가가 됩니다.
3. **신뢰 출처 목록 검토.** 각 도메인을 그 조직이 실제로 소유하는지 확인하지 않았습니다. 독자 제보 영역 처리 정책도 정해지지 않았습니다.
4. **TinEye 약관**(상업 이용·캐싱·표시)과 **한국 언론 이미지 커버리지**를 확인하지 못했습니다.
5. **Supabase:**
   - 스키마 변경이 필요합니다: `checks.claimed_date`·`claim_text`·`context_*`, `analyses` run 번호, 새 evidence kind와 `strength`, v2 검증 필드.
   - RLS 테스트 33개를 Supabase 클라우드 개발 프로젝트에서 다시 돌려야 합니다. 지금까지는 Supabase를 흉내 낸 Postgres 17에서만 통과했습니다.
6. **앱 기능:** 실제 메일 발송, 공유 링크(S10), 재검사 알림, 결제(범위 밖).
7. **fixture 표시 흠:** `trusted_edited` 이미지 안 라벨이 "SAMPLE no-source"이고, mock 기사 캡션이 모든 시나리오에서 같은 문장입니다. 판정에는 영향이 없습니다.

## 다음 작업

1. 사용자가 `cases.jsonl`을 채우면 아래 순서로 진행합니다.
   - `npm run -s eval -- --cases eval/cases.jsonl --validate`
   - 그다음 `--only <id>`로 한 건을 확인하고 전체를 실행합니다.
   - 보고서의 **오판 섹션부터** 사례별로 원인을 분류합니다. 분류는 규칙, 비교 임계값, 날짜 메타데이터, 신뢰 출처 목록, 검색 커버리지로 나눕니다.
2. 오판 원인에 따라 `TRUSTED_RULES` 임계값이나 규칙을 고칩니다. 각 수정에는 그 사례를 재현하는 반례 테스트를 먼저 추가합니다(`web/tests/verdict-v3.test.ts`).
3. 파일럿에서 신뢰 출처 후보가 0인 사례가 많으면, 목록보다 검색 커버리지 문제입니다. TinEye 비교 또는 Naver 키워드 보조 검색을 검토합니다(`replica/reverse-search-comparison.md`).
4. 그 뒤 Supabase 스키마 마이그레이션과 RLS 재검증을 진행합니다(미완료 5번).

## 이 서버에서 작업할 때

- **Node 경로:** Node는 `~/.local/node/bin`에 있습니다(시스템 Node는 v16). 명령 앞에 `PATH=$HOME/.local/node/bin:$PATH`를 붙여 주세요.
- **Docker:** 권한이 없어서 Supabase 로컬을 띄울 수 없습니다.
- **Postgres:** conda로 스크래치 경로에 설치해서 썼습니다(`replica/tests/rls_test.py` 참고).
- **curl과 쿠키:** 프로덕션 빌드에서는 세션 쿠키가 `Secure`라서, curl은 http로 쿠키를 저장하지 않습니다. API 확인은 Playwright(브라우저)로 하세요.
- **vitest 출력:** 통과한 테스트의 `console.log`는 숨겨집니다. 측정값이 필요하면 파일로 쓰거나 일부러 실패시켜 출력하세요(예: `FIXTURE_TABLE_OUT=경로 npx vitest run tests/fixtures-v2-v3.test.ts`).
- **zsh 구분선:** 명령 안에 `====` 같은 줄을 넣으면 zsh가 명령으로 해석합니다.
- **커밋 방식:** 작업 단위마다 로컬 커밋하고 push는 하지 않습니다. 작업을 마칠 때 이 파일에 인수인계를 추가합니다.

---

# 인수인계 — 2026-10-19 무료 경로 (Google Vision 사용 안 함)

## 현재 상태

- **커밋:**
  - `2521b22` 수동 후보(`sourceUrls`), 무료 실제 모드
  - `e540f16` RSS 점검표·색인 설계
  - `9db8a3c` v3가 가장 가까운 신뢰 출처를 인용
  - `55c160f` RSS 해시 색인
  - `a863b28` 같은 사진 신뢰 출처가 있으면 편집 조작 막음
  - `a681d95` 앱 free 모드·결과 화면 한계 문구·eval `--index`·색인 형식 v2
  - `3285e15` 문서
  - `9d10853` 무료 경로 조사
  - 모두 로컬 커밋이고 push는 하지 않았습니다.
- **1. 수동 후보:** `cases.jsonl`에 `sourceUrls`가 있으면 검색을 건너뛰고 그 페이지들을 실제로 가져와 확인 → 비교 → 판정합니다(`PolicyFetch` 그대로). 보고서 맨 위에 "검색 없이 수동 후보로 평가함 (n건)"이 나오고, 사례 표에 후보 출처 열이 있습니다.
- **2. RSS 해시 색인:**
  - 수집기(`npm run index:collect`)는 `feeds[].status === "allowed"`인 공식 RSS만 요청합니다.
  - 저장하는 것: 기사 URL, 게시일, 이미지 URL, pHash(전체 + 잘라내기 5종), 수집 시각. 이미지와 본문은 저장하지 않습니다.
  - 검색은 `RssIndexReverseSearch` 하나로 연결했습니다. 앱은 `PAIRSIGHT_PROVIDERS=free`, 평가는 `--index`.
  - "수집 시작 이전 사진은 못 찾음"을 결과 화면("검색한 곳" 아래와 하단 안내)과 문서에 적었습니다. 캡처: `replica/clone-screens/stage5-free/`.
- **현재 허용 피드는 0개입니다.** `replica/rss-collection-checklist.md` 기준:
  - 제외: 연합·동아·경향·SBS(RSS 비상업·개인 이용 한정), MBC·Reuters(robots 전체 차단), AP(RSS 경로 차단), 정책브리핑(RSS 중단, 사진은 사전 협의).
  - 보류: 한겨레·뉴시스 등. 아직 확인하지 않았습니다.
  - 위키미디어 공용: SHA-1 완전 일치 검색만 가능해서 색인하지 않았습니다.
  - 그래서 실제 운영에서 색인은 아직 비어 있습니다.
- **판정 수정 2건(반례 테스트 포함):**
  - v3가 날짜가 오래된 비슷한 장면 대신 **가장 가까운** 신뢰 출처를 인용합니다.
  - 신뢰 출처에 업로드와 **같은 사진**이 있으면, 다른 신뢰 출처 사진과의 차이로 편집 조작을 내지 않습니다. 대신 판단 불가와 "신뢰 출처 두 곳의 사진이 서로 달라요"를 표시합니다. 이 문제는 색인 스모크 실행에서 오판 1건으로 발견했습니다.
- **3. 조사:** `replica/free-options-research.md`
  - SerpApi는 월 250회.
  - Fact Check API에 `imageSearch`가 있습니다. 결제 없이 되는지는 확인하지 못했습니다.
  - c2pa-node는 MIT지만 이 서버의 glibc 2.31에서 실행되지 않습니다.
  - CPU 임베딩은 1장 31–133 ms. OpenAI CLIP 가중치는 배포 범위 밖입니다.
- **검증:** 테스트 170개, `tsc`, `eslint`, `next build` 모두 통과. 예시 하네스 `--mock --index` 결과는 맞힘 6, 판단 불가 3, 오판 0.

## 미완료

1. **허용 피드 0개.** 보류 언론사의 RSS 이용 조건 확인 또는 이용 허락이 필요합니다. 사람이 판단해야 합니다.
2. **실제 사진 파일럿 미실행.** `cases.jsonl` 30건을 `sourceUrls`로 채워야 합니다.
   - MBC·Reuters 페이지는 robots 때문에 수동 후보로도 가져오지 않습니다.
3. **합성 fixture 한계.** 모든 예시 장면이 같은 틀이라 서로 다른 장면도 해시 거리가 2 안팎입니다.
   - 그래서 모의 free 모드에서 `ai_generated.png`가 신뢰 출처 2021 사진과 비교되어 "편집 조작"으로 나옵니다.
   - 실제로 다른 사진을 걸러내는지는 실제 사진으로만 확인할 수 있습니다.
4. **색인 운영:** 출처가 기사를 내리거나 삭제를 요청할 때 정리하는 작업, 크론 등록, 보관 기간이 미구현입니다.
5. 이전 인수인계의 미완료 3–7(신뢰 목록 소유 확인, TinEye, Supabase, 앱 기능, fixture 흠)은 그대로입니다.

## 다음 작업

1. 사용자: Fact Check API 키를 결제 없이 만들어 `claims:search`가 200인지 확인합니다. 되면 `imageSearch` 어댑터를 만듭니다.
2. 사용자: 파일럿 30건의 `sourceUrls`를 채웁니다. 그다음 `--validate`, `--only`, 전체 실행 순서로 진행하고, 오판 섹션부터 원인을 분류합니다.
3. 보류 언론사 RSS 조건을 확인해 `trusted-sources.json`의 `feeds[].status`를 갱신합니다. 허용이 생기면 크론으로 `index:collect`를 시간당 실행합니다.
4. (선택) 파일럿 후보 찾기에 SerpApi Lens 어댑터를 붙입니다(키가 있을 때만). 색인 보조로 DINOv2 임베딩도 비교합니다.
5. 배포 서버 OS를 glibc 2.32 이상으로 정한 뒤 C2PA 검증을 붙입니다.

---

# 인수인계 — 2026-10-19 같은 장면 관문 (다른 장면 오판 방지)

## 현재 상태

- **커밋**
  - `2cbceeb` 장면 fixture 10장
  - `0281220` 같은 장면 관문, 반례 테스트, 파이프라인 문서 §3-1
  - (이 인수인계 커밋)
  - 로컬 커밋만 했고 push는 하지 않았습니다.
- **fixture** (`public/fixtures/scenes/`, `scripts/make-scene-fixtures.py`로 직접 그림, 제3자 이미지 없음)
  - 관계없는 장면 6장: 밤 도시, 해변, 숲, 과일 식탁, 산과 호수, 항공 농지
  - 같은 배경 다른 피사체 4장: 스튜디오 주전자, 화분, 꽃병, 자전거
    - 스튜디오 쌍 중 4쌍은 기존 픽셀 관문을 통과하고 "국소 차이 1곳"으로 나옵니다. 그래서 편집된 사본처럼 보입니다.
- **관문**(`lib/verification/scene-gate.ts`)
  - 모델: DINOv2-small(Apache-2.0) ONNX 8비트, 리비전 고정, CLS 코사인 유사도
  - 픽셀 정렬을 통과한 후보만 검사합니다. 유사도가 0.76 미만이면 비교 대상에서 뺍니다.
  - 제외 관문으로만 쓰고, 판정 근거로는 쓰지 않습니다.
  - 모델을 불러오지 못하면 그 후보 비교는 실패로 처리합니다(fail closed).
- **측정**(`npx tsx scripts/measure-scene-gate.ts`)
  - 같은 장면 66쌍: 최소 0.801
  - 관계없는 장면 36쌍: 최대 0.582
  - 같은 배경 다른 피사체: 최대 0.729
  - 기존 같은 틀 fixture끼리: 0.86–0.956
  - 모델 후보 비교: DINOv2-base와 패치 평균은 같은 배경 쌍을 구분하지 못했습니다.
- **반례 테스트**(`tests/scene-gate.test.ts`)
  - 업로드: 스튜디오 주전자
  - 후보: 2020-05-01자 가상 신뢰 출처의 다른 스튜디오 사진 3장
  - 관문을 켜면: 판단 불가 + 원본 없음(검증 완료, 경고 1줄)
  - 관문을 끄면: 같은 입력이 **편집 조작**으로 나옵니다. 위험이 실제로 재현된다는 뜻입니다.
- **뮤테이션 검사**: 7개 모두 테스트가 실패했습니다(모두 잡힘).

  | 변형 | 실패한 테스트 |
  | --- | --- |
  | 관문이 항상 통과 | 반례 |
  | `matched`가 관문 무시 | 반례 |
  | 관문 호출 안 함 | 반례 |
  | 임계값 0.6 | 반례 + 다른 장면 |
  | 임계값 0.72 | 반례 + 다른 장면 |
  | 임계값 0.81 | 같은 장면 유지 |
  | 임계값 0.85 | 같은 장면 유지 |
  | CLS 대신 패치 평균 | 반례 + 다른 장면 |

  - 처음에는 임계값 0.85 변형이 살아남았습니다. 그래서 60% 잘라내기 쌍을 "같은 장면 유지" 테스트에 추가했습니다.
- **시간**(이 서버: i9-10980XE, 2스레드)
  - 모델 첫 다운로드와 로드: 3.0초(24 MB)
  - 디스크 캐시가 있는 새 프로세스의 로드: 0.37–0.55초
  - 이미지 1장 임베딩: 중앙값 84 ms. 메모리 약 220 MB(이전 조사 기준).
  - 사례당 추가 시간 ≈ 84 ms × (1 + 픽셀 정렬을 통과한 후보 수)입니다. 업로드는 한 번만 계산하고, 후보는 최대 5개라 최대 약 0.5초입니다.
  - 실측: 예시 3건 × 2회 평균의 차이가 −140…+71 ms였습니다. 페이지 확인과 정렬에 드는 약 0.7초의 변동에 묻혀서 구분되지 않았습니다.
- **검증**
  - 테스트 175개, `tsc`, `eslint`, `next build` 모두 통과
  - 예시 하네스 `--mock --index` 결과: 맞힘 6, 판단 불가 3, 오판 0

## 미완료

1. **모의 free 모드의 `ai_generated.png` → 편집 조작은 그대로입니다.**
   - 이 fixture는 다른 템플릿 장면과 같은 그림에서 색, 간판, 해만 다릅니다. 임베딩 유사도도 0.91–0.94로 "같은 장면"입니다.
   - 실제 세계에서는 "같은 장소를 다른 때 찍은 사진"에 해당합니다. 이 관문으로는 구분할 수 없습니다.
   - 선택지는 두 가지입니다(사용자 결정 필요).
     - (a) fixture를 고유 장면으로 다시 그립니다.
     - (b) 규칙을 추가합니다. 예: 전역 색보정이 필요한 쌍은 편집 조작 근거에서 뺍니다.
2. **임계값 0.76은 합성 이미지 기준**입니다. 양쪽 여유가 0.03–0.04로 좁습니다. 파일럿의 실제 사진 쌍으로 다시 보정해야 합니다.
3. **배포 환경**: 첫 요청에서 모델을 내려받습니다(Hugging Face 접근 필요). 오프라인 배포라면 `PAIRSIGHT_MODEL_CACHE`에 미리 넣어 두어야 합니다.
4. 이전 인수인계의 미완료 항목(허용 피드 0개, 파일럿 미실행, 색인 정리 작업, Supabase 등)은 그대로입니다.

## 다음 작업

1. 사용자 결정: 미완료 1의 (a) 또는 (b)
2. 파일럿을 실행할 때, 관문에 걸려 제외된 후보를 결과 경고 문구로 집계합니다. 원래 맞는 원본이 제외된 사례가 있으면 임계값을 조정합니다. 이때 반례 테스트를 먼저 추가합니다.
3. 실제 사진 쌍(같은 장면 편집본, 같은 장소 다른 사진)을 `scripts/measure-scene-gate.ts`에 추가해 분포를 다시 측정합니다.

## 추가 — ai_generated fixture 다시 그림 (같은 날)

- **커밋:** `5808e6c`
- **변경:** `ai_generated.png`를 거리 템플릿과 겹치지 않는 고유 장면으로 다시 그렸습니다(고리 행성, 분홍 사구, 떠 있는 등불). `scripts/make-fixtures.py`를 다시 실행해도 바뀌는 파일은 이 하나뿐입니다.
- **확인**
  - 입력, 원본, 장면 fixture 24장 모두와 비교했습니다. 픽셀 정렬을 통과한 것이 없고, 장면 유사도는 최대 0.591입니다.
  - RSS 색인 검색 결과는 후보 0개입니다.
  - 모의 모드: AI 생성(모의 C2PA)과 원본 없음이 그대로 나옵니다.
  - 모의 free 모드: 편집 조작이 아니라 판단 불가 + 원본 없음 + 색인 한계 문구가 나옵니다.
  - 테스트 176개, `tsc`, `eslint`, `next build` 통과. 예시 하네스는 `--mock`과 `--mock --index` 모두 오판 0입니다.
- **캡처:** `replica/clone-screens/stage1/S03-ai_generated-*`(모의), `stage5-free/S03-ai_generated-*`(free)
- **미완료 1번은 해결됐습니다.** 남은 한계는 "같은 장소를 다른 때 찍은 사진"은 관문으로 걸러지지 않는다는 점입니다. 기존 같은 틀 fixture끼리 0.86–0.956으로, 파이프라인 문서 §3-1에 적었습니다. 나머지 미완료와 다음 작업은 위와 같습니다.

## 추가 — 같은 장소·다른 시점 사진의 편집 오판 방지 (2026-10-19)

- 작업 단위 커밋: `e259962`(그림 fixture), `5a22963`(판정·측정·검증). 본 문서와 인수인계는 별도 커밋입니다.
- 위 장면 관문의 한계를 줄이기 위해 v2·v3에 공통 비교 제외 조건을 추가했습니다. 영역 밖 잔차 ≤0.008, 전체 영역 면적 합 ≤8%, 전체 영역 수 ≤2개를 모두 만족해야 합니다. 원자료와 정의는 `verification-pipeline.md` §3-2에 있습니다.
- 같은 거리를 두 번 직접 그린 반례는 장면 관문을 통과하지만(0.899364) 잔차 0.03332470·영역 수 3개로 제외됩니다. 이른 날짜 + 신뢰 출처가 있어도 **판단 불가**, 핵심 발견은 **“같은 장소의 다른 사진일 수 있어요”**입니다. 후보와 중립 근거는 남습니다.
- 기존 간판 변경 + 사람 추가 편집은 계속 편집 조작입니다. 비교용 합성 원본 11개 × JPEG 품질 4종, 44쌍의 최대 잔차 0.00606937을 측정했습니다.
- `PIPELINE_VERSION=4`로 새 수치가 없는 캐시 재사용을 막았습니다. 실행 중인 서버 재시작과 새 검사가 필요하며 기존 저장 결과를 자동 재분석하지 않습니다.
- 검증: **193개 테스트**, 타입 검사, 린트, 프로덕션 빌드 통과. 정상 코드가 통과한 뒤 조건 전체·잔차·면적·개수·v2 모호성 검사 제거 **뮤테이션 5종 모두 검출**했습니다. 전체 제거 시 실제 픽셀 반례 테스트도 실패합니다.
- **남은 한계:** 0.76 / 0.008 / 8% / 2개는 모두 합성 그림 기준입니다. 실제 사진 재보정이 필요하고, 작은 국소 변화만 있는 다른 시점 사진까지 구분한다고 보장하지 않습니다.
- 상세 인수인계: [handoff-edit-locality.md](handoff-edit-locality.md). 이전 외부 서비스·파일럿·Supabase 미완료 항목은 그대로입니다.

## 추가 — 권리 확인된 실제 사진으로 보정 (2026-10-19)

- 작업 단위 커밋: `01ee9f3`(권리·사진·프로토콜), `4b45ec9`(평가·기준값·회귀 검사). 문서는 별도 커밋입니다.
- SkyFinder CC BY 4.0 공개 기록을 권리 근거로 사용했습니다. 12개 카메라의 실제 사진 36장을 최대 512px로 보관하고 출처·날짜 표기·해시·라이선스·변경 표시를 기록했습니다. 사진 원본/ZIP은 메모리에서만 처리했습니다.
- 카메라 단위로 보정 6대/192쌍과 검증 6대/192쌍을 분리했습니다. JPEG·통제된 국소 편집·다른 날짜·다른 카메라를 측정했으며, 검증 전에 값을 고정했습니다.
- **영역 밖 잔차 0.008 → 0.020**, **장면 0.76 / 면적 8% / 2개 유지**. 실제 보정 JPEG 최대 잔차는 0.01986922입니다. `PIPELINE_VERSION=5`입니다.
- **별도 검증:** 비편집 오탐 0/138 유지, 다른 시점 동일 사진 오수용 0/36 유지, 편집 미탐 5/54(9.3%) 유지, JPEG 수용 68/72 → 72/72. 보정에서 미탐은 개선됐지만 검증에서의 개선은 확인하지 못했습니다.
- 기존 합성 반례와 편집 양성 대조군을 유지했습니다. 테스트 **197개**, 타입 검사·린트·프로덕션 빌드 통과. 이전 조건 제거 뮤테이션 **5종 모두 검출**했습니다.
- 검증 미탐은 정렬 제외 3건과 저대비 copy-move 미검출 2건입니다. 작은 웹캠 파일럿이며 실제 서비스 정확도가 아닙니다. 자세한 근거: [real-photo-calibration.md](real-photo-calibration.md), [handoff-real-photos.md](handoff-real-photos.md), `verification-pipeline.md` §3-3.

---

# 인수인계 — 2026-10-19 편집국 + 팩트체크 법정 (설계 + 최소 구현)

## 현재 상태

- **커밋**
  - `36117f4` 결제(Stripe) 제거, 비영리 시범 운영 전제
  - `29eb742` LLMProvider(Ollama, mock)와 법정 레이어
  - `d0b7cd6` 관찰 이벤트, 변호인 방향 규칙
  - (이 문서 커밋) 설계·측정 문서
- **결제 제거**
  - 바뀐 곳: `architecture.md`, `schema.sql`(`stripe_events`, `profiles.plan`, `stripe_customer_id` 삭제), `features.csv`, S08 문구(운영 안내)
  - RLS 테스트를 Postgres 17에서 다시 돌려 42/42 통과했습니다. 저장된 결과 파일은 33개짜리로 낡아 있어서 갱신했습니다.
- **법정 레이어**(`web/lib/court/`, `web/lib/llm/`)
  - 판사 = 규칙 v3(코드)
  - 검사, 변호인, 배심원 3명(관점이 서로 다름), 서기 = LLM. 도구는 없습니다.
  - 코드가 강제하는 것:
    - 카드 인용이 없는 주장은 폐기
    - 배심원은 유지하거나 판단 불가로 내리기만 가능
    - 의심은 판정에 맞는 종류여야 하고, 인용 카드의 측정값에 신호가 있어야 함
    - 변호인 대안은 판정에 반대하는 쪽만
    - 판사가 판단 불가면 LLM 호출 0
    - 페이지 글은 이스케이프된 데이터로만 전달하고, 링크는 지움
    - Ollama는 loopback 주소만 허용
  - mock LLM 테스트 18개(`tests/court.test.ts`)
  - 실행 스크립트: `scripts/court-run.ts`
- **Ollama**(이 서버, CPU만, 공용 서비스·GPU 미사용)
  - 원시 생성 속도: 1.5B 18 tok/s, 3B 13 tok/s, 7B 7 tok/s
  - 법정 1회: 96 / 164 / 403초
  - 실측에서 규칙 결함 2개를 찾아 고쳤습니다(1.5B: 근거 없는 의심 채택, 7B: 변호인 역할 혼동).
  - 자세한 내용: `replica/llm-options.md`
- **무료 API 조사**
  - Gemini 무료 등급: 입력이 제품 개선에 쓰이고 사람이 검토할 수 있으며, 개인정보를 보내지 말라는 조건이 있어 부적합합니다.
  - Groq: 학습에 쓰지 않습니다. 조건부로 대안이 될 수 있습니다.
  - OpenRouter 무료: 하루 50회라 부적합합니다.
- **편집국 9팀 설계:** `replica/newsroom-court.md` §3
  - 법무는 경고만 냅니다.
  - 게재와 삭제는 사람이 승인합니다.
  - SNS 유포 추적과 봇 탐지는 범위 밖입니다.

## 미완료

1. 결과 화면의 공방 기록 섹션, `court_record` 저장, "공방 검토 중" 표시(비동기 후처리)
2. 법무 경고 규칙(코드)과 T&S 승인 큐
3. GPU 속도는 측정하지 않았습니다. GPU 3장을 다른 사용자가 100% 쓰고 있었습니다.
4. 시스템 Ollama 0.11.2는 gemma3 최신 매니페스트를 받지 못합니다. 업데이트에는 관리자 권한이 필요합니다.
5. 법정 정확도는 사례 1건으로만 봤습니다. 파일럿 사례로 "낮춤 비율"과 "막은 오판 수"를 재야 합니다.

## 다음 작업

1. 파일럿 사례에 `court-run`을 돌려 낮춤이 정당했는지 사람이 라벨링합니다. 결과에 따라 신호 임계값을 조정하고, 반례 테스트를 먼저 추가합니다.
2. 공방 기록 화면과 저장을 붙입니다(`newsroom-court.md` §2-7).

---

# 인수인계 — 2026-10-19 관제실(Claw3D) + 공개 대시보드 + 카테고리 정책

## 현재 상태

- **커밋**
  - `ea68cd3` 관제실 어댑터·데모
  - `8181590`, `805a23b` `public_cases`·RLS·마이그레이션 003
  - `2c9ddfe` 공개 대시보드
  - (정책 문서 커밋)
  - (이 인수인계)
  - 로컬 커밋만 했고 push는 하지 않았습니다.
- **Claw3D**(`replica/controlroom.md`)
  - 상태: MIT 라이선스, 보관 아님, v0.1.4. 마지막 코드 변경은 2026-05-30입니다.
  - 설치 위치: `~/claw3d`(Pairsight 밖). OpenClaw·Hermes는 설치하지 않았습니다.
  - 어댑터(`web/lib/controlroom/`)는 custom HTTP 런타임 계약(`/health`, `/state`, `/registry`, `/v1/chat/completions`)을 따릅니다.
  - 동작 방식:
    - loopback 전용
    - 토큰은 `PAIRSIGHT_CONTROLROOM_TOKEN`으로 받아 URL 경로에 넣음
    - 바꾸는 경로 없음, 채팅은 운영자 메시지를 무시
    - 포트: Pairsight 3000, Claw3D 3400, 어댑터 3410
  - 데모 `scripts/controlroom-demo.ts`가 mock 재판을 끝까지 재생합니다.
  - **실제 연결 결과:** 좌석 7개가 3D 사무실에 나타납니다.
  - **Claw3D 쪽 한계:** custom 런타임에 이벤트 스트림이 없어 상태 애니메이션이 안 됩니다. 채팅은 Claw3D가 `sessions.patch`를 구현하지 않아 실패합니다. 캡처를 남겼습니다.
- **법정 이벤트:** `runCourt(…, { onEvent })`. 발언에는 검증을 통과한 주장만 들어갑니다.
- **공개 대시보드**(`replica/public-dashboard.md`)
  - `/cases`: 주제 메뉴(390px에서는 탭), 조작 유형·유포 경로 필터, 사실 문장 제목, 흐림 + 배지
  - `/cases/[slug]`: 2D 재판 타임라인과 근거 카드
  - 승인된 사례만 나오게 RLS와 코드 양쪽에서 막았습니다.
  - 정치는 검토자 2명, 성적 콘텐츠·미성년·사인은 게재 불가, 선거 기간은 이미지 없음. 모두 DB 제약입니다.
- **카테고리 정책**(`replica/category-policy.md`)
  - 공직선거법 §82의8(90일 딥페이크 금지), §108(6일 여론조사), §250·§251
  - 성폭력처벌법 §14의2 ④(소지·시청 처벌) → 표시 금지, 신고 안내(1377)만
  - 플랫폼은 수집하지 않고, 제보 태그만 둡니다.
- **검증**
  - 테스트 228개, tsc, eslint, `next build` 통과
  - RLS 54/54 통과
  - 마이그레이션 경로(10-18 스키마 → 002 → 003) 확인

## 미완료

1. **3D 진행 재생:** Claw3D 쪽 변경(이벤트, `sessions.patch`)이 필요합니다. 아니면 데모 게이트웨이 WebSocket 어댑터를 쓰는 방법이 있지만 custom HTTP 조건을 벗어납니다. 사용자 결정이 필요합니다.
2. 운영자 승인 화면, 제보 접수, 성적 합성물 신고 경로와 즉시 삭제 처리
3. `graphic_violence`·피해자 신원 노출의 이미지 금지를 DB로 강제하기
4. 숨긴 사례 상세의 응답 코드가 200입니다(스트리밍). 내용은 노출되지 않습니다.
5. 변호사 검토 5개 항목(`category-policy.md` §8)
6. 이전 인수인계의 미완료(공방 기록 화면, GPU 측정 등)는 그대로입니다.

## 다음 작업

1. 3D 재생 방식을 결정합니다(미완료 1).
2. 운영자 승인 화면(2인 승인 흐름)을 만들고 Supabase를 연결합니다.
3. 카테고리 정책 다음 작업 1–4번


# 인수인계 — 2026-10-19 WebSocket 관제실 완료

- 사용자 후속 승인(데모 게이트웨이 WS 프로토콜)에 따라 두 번째 어댑터를 완성했습니다. 이전 절의 “3D 진행 재생 결정 필요”는 해결됐습니다.
- Pairsight `401cfe2`, 별도 Claw3D `220b072`·`1e1b456`. 문서·호환 패치·성공 캡처는 별도 커밋입니다. push 없음.
- 실제 mock 법정 20개 이벤트/7명/최종 발언 7개 → 3D 0 working / 7 idle, 브라우저 오류 0건.
- 원인: React updater 재실행 때 Date.now()로 과거 이벤트의 활동 기한을 새로 만들었습니다. 도착 시각 고정 + 완료 기록 갱신으로 해결했습니다. 회귀 테스트와 뮤테이션 검사 통과.
- Pairsight 241개 테스트·타입·린트·빌드, Claw3D 관련 17개 테스트·빌드 통과.
- 실행: web에서 `npm run controlroom`, 화면에 7명이 보이면 터미널 Enter. 토큰은 환경 전용, 임시 설정 사용, localhost·읽기 전용.
- 상세 실행/검증/남은 범위: [handoff-controlroom.md](handoff-controlroom.md), [controlroom.md](controlroom.md).


## 2026-10-19 Gemini / threshold ratchet handoff

- Gemini LLMProvider added with text-only evidence projection, key masking, and no-retry 429 termination. Existing Ollama/mock retained. See `gemini-provider.md`.
- Same trusted_edited hearing measured on CPU Ollama: 1.5B 141.895s, 3B 232.655s, 7B 439.265s, and live Gemini gemini-3.8-flash 42.526s; each six calls, edited maintained. Gemini completed without retries after the user saved the key through hidden terminal input. Text-only request summaries; no key values or raw API responses recorded. One case/run per model, differing hardware and prompt/token budgets; not a general accuracy or speed comparison.
- Central `tuning/thresholds.json` preserves current values. Dev-only guarded ratchet scaffold with protected-file hashes, branch restriction, per-experiment budget/count, strict zero-wrong adoption and guarded rollback. New dev/holdout manifests intentionally empty; fewer than 30 independent real-photo dev cases refuses start. Actual tuning loop NOT run.
- Whole suite 259 tests passed; targeted follow-up regression and safety tests passed. Typecheck/lint/production build verified. Root tuning JSON required Turbopack root = repository; profile hash now separates analysis caches.
- Local work-unit commits, no push. Handoff: `handoff-gemini-tuning.md`. Existing 32 untracked control-room captures preserved.


## 2026-10-19 공개 대시보드 첫 화면·관제실 재확인

- 사용자에게 기존 검사 폼을 열어 요청한 화면이 보이지 않았던 진입 문제를 수정: `/` → `/cases`, 검사 폼 `/check`. 새 정책 안내 `/how-it-works`. 코드 `f333d74`.
- 주제·필터·승인 제한·2D 재판을 1280/390 Chrome에서 확인. 가로 넘침 및 pageerror 0. 관련 테스트 26개, 타입·린트·프로덕션 빌드 통과.
- Claw3D 20개 이벤트/7명/7개 발언, 최종 0 working/7 idle 및 토큰 비노출 재확인. 사용자용 3440 포트에서 mock 반복 재생 중.
- 라이선스·최신 저장소 및 카테고리 정책 공식 출처 재확인. Supabase·승인 UI·실시간 Gemini 웹 연결은 미완료로 유지.
- 인수인계: [handoff-public-entry.md](handoff-public-entry.md). 작업 단위 로컬 커밋, push 없음.
