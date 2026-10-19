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
