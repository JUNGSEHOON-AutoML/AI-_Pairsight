# Build log (replica-build)

App: `web/` (Next.js 16.4.2, Tailwind 4, TypeScript). Providers: **mock only** (`PAIRSIGHT_PROVIDERS=mock`).
Data: memory store with the same operations as `schema.sql` (no Supabase project yet; no Docker on this server).
Screenshots: `clone-screens/<stage>/`, desktop 1280 and mobile 390.

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-10-18 | done | — | Next 16: middleware is `proxy.ts`, `params`/`cookies()` are async, and Cache Components fail the build on `useParams()` outside `<Suspense>` and on `new Date()` in a client component during prerender. Both caught by `next build`, fixed. |
| S01 | 2026-10-18 | done | thumbnails in the image picker (shows an icon, so the browser does not load third-party images) | The hidden file input had no visible focus; fixed with a `peer` focus ring on the dropzone. Direct image URLs were rejected as "not a page"; now offered as the single image. |
| S02 | 2026-10-18 | done | — | — |
| S03 | 2026-10-18 | done (mock) | 공유 링크 and 재검사 알림 buttons are disabled "준비 중"; heatmap (could) not built | The verdict depends on the date the user types, but analyses are shared by image hash, so the verdict is computed per check at read time. **schema.sql needs `checks.claimed_date` and the verdict on checks (or computed in a view)**, and `analyses` needs a run number because 재검사 must not hit the `(input_type, input_key, pipeline_version)` unique key. |
| S04 | 2026-10-18 | done (inside S03) | — | — |
| S06 | 2026-10-18 | done | — | — |
| S07 | 2026-10-18 | partial | real email sending, Google sign-in, rate limit on login requests | Signing in with an email that already has an account switches to it; checks made anonymously just before are **not merged** into that account. |
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
- [ ] Supabase 클라우드 개발 프로젝트에서 RLS 테스트 33개 재실행 (`replica/tests/rls_test.py`, 지금까지는 Supabase를 흉내 낸 Postgres 17에서만 통과)

Found during the build (also later):

- [ ] schema.sql: add `checks.claimed_date` and keep the verdict per check; add a run number to `analyses` so 재검사 does not collide with the unique key
- [ ] Real providers behind the existing interfaces: Vision Web Detection, TinEye, Fact Check `claims:imageSearch`, C2PA SDK
- [ ] Email sending for magic links (Resend), then remove the DEV link path; set `PAIRSIGHT_SESSION_SECRET` in every deployed environment
- [ ] Merge anonymous checks into an existing account on sign-in
- [ ] Image picker thumbnails through a server proxy (today an icon, so the browser never loads third-party images)
- [ ] `/dev/fixtures` and `isMock` are decided at build time; set `PAIRSIGHT_PROVIDERS` before `next build`
- [ ] Jobs from architecture.md: reap.stale, cleanup.anon
