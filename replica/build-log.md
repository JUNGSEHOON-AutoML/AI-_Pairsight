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

## Verification, stage 1 (upload → 분석 중 → 결과)

- All five verdicts, 판단 불가 + 원본 없음, and 분석 실패 rendered from mock fixtures at 1280 and 390 (14 screens), 0 console errors, no horizontal scroll.
- 원본 없음 block appears exactly for the scenarios with no match (no_source, ai_generated).
- Keyboard only: URL → pick image → result works; focus is visible.
- Unit tests: 41 (verdict engine 12, SSRF guard + extractor 29).
- Real network checks: public image URL accepted after a redirect; `example.com` → 이미지 없음; `127.0.0.1`, `169.254.169.254` and `localtest.me` (resolves to ::1) blocked, the last one at connect time.
- Pretendard was not loading at first (token said `Pretendard`, the font registers `Pretendard Variable`); fixed in `tokens.json`.
