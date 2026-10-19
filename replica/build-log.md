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
