# 공개 대시보드 진입·Claw3D 재확인 인수인계 — 2026-10-19

## 지금 확인할 화면

| 화면 | 서버 주소 | 확인할 내용 |
| --- | --- | --- |
| 공개 사이트 첫 화면 | http://127.0.0.1:3000/ | `/cases`로 이동. 주제 5개, 조작 유형·제보 경로 필터, 승인된 가상 사례 5건 |
| 2D 재판 상세 | http://127.0.0.1:3000/cases/alley-house-sold-sign | 검사 → 변호인 → 배심원 의심 → 판결, 인용 근거 카드 |
| 개인 이미지 검사 | http://127.0.0.1:3000/check | 기존 이미지 업로드·기사 주소 검사 폼 |
| 공개 정책 | http://127.0.0.1:3000/how-it-works | 선정·진영 균형·사람 승인·카테고리 검토·성적 합성물 지원 안내 |
| 별도 운영자 3D 관제실 | http://127.0.0.1:3440/office | mock 재판 반복 재생, 7개 좌석의 대기·작업·발언 |

앱의 원격 미리보기는 위 서버 주소를 다른 localhost 포트로 전달할 수 있습니다. 공개 사이트와 3D 앱은 서로 다른 프로세스이며 공개 메뉴에 관리용 localhost 링크를 넣지 않았습니다.

## 보이지 않았던 이유와 수정

이전 공개 대시보드(`/cases`)와 관제실은 구현돼 있었으나, 앞서 연 `/`는 기존 검사 폼이었습니다. 사용자가 요청한 카테고리 화면을 처음 접속했을 때 볼 수 없었습니다. 정책 문서에는 공개한다고 적었지만 `/how-it-works`는 한 문단짜리 설명만 있었습니다.

- 첫 화면을 `/cases`로 연결하고 업로드 폼을 `/check`로 옮겼습니다.
- 로고·공개 사례 메뉴는 대시보드로, 검사·재검사·취소·빈 기록·로그아웃 후 검사 버튼은 `/check`로 연결했습니다. 기존 `/check/[id]` 결과 주소는 그대로입니다.
- `/how-it-works`에 실제 선정·게재 기준과 공식 피해 지원 안내를 추가하고 대시보드·하단에서 접근할 수 있게 했습니다.
- 기존 승인 필터·DB 제약·RLS·2D 타임라인·Claw3D HTTP/WS 어댑터를 재사용했습니다. 새로 만든 기능으로 중복 보고하지 않습니다.

코드 커밋: **`f333d74`**. 공식 출처 갱신·검증 캡처·이 인수인계는 별도 문서 커밋입니다. push하지 않았습니다.

## 요청 항목별 확인

| 항목 | 현재 상태 |
| --- | --- |
| Claw3D 분리·라이선스·최신 상태 | 별도 `~/claw3d`, MIT. 2026-10-19 GitHub API 재확인: archived=false, 최신 main `0565b789`, 2026-08-21 CI 변경, 최신 릴리스 v0.1.4. 로컬 호환 패치 2개 유지 |
| OpenClaw·Hermes | 추가 설치·실행 없음. Claw3D의 프로토콜 어댑터만 사용 |
| custom HTTP | `/health`, `/state`, `/registry`, 읽기 전용 채팅 응답 유지. HTTP 계약에 애니메이션 이벤트가 없어 **이전 후속 승인에 따른 WS 어댑터**로 3D 재생 |
| 관제실 쓰기 차단 | 판정·에이전트 설정 변경 RPC 거부. 운영자 입력은 법정에 전달하지 않음. 관련 회귀 테스트 통과 |
| 관제실 보안·포트 | localhost 전용. 토큰은 새로 생성해 자식 환경에 전달, 공개 설정에서 비노출. 기존 3400/3410/3411 서버를 건드리지 않고 3440/3450/3451 사용 |
| 공개 대시보드 | 5개 주제, 4개 조작 유형, 5개 제보 경로. 사실 문장 제목·흐림 이미지·판정 배지·390px 상단 주제 탭 |
| 승인 상태·RLS | 기존 `public_cases`와 migration 003에 상태/검토자 제약 및 approved-only SELECT RLS 존재. 현재 웹은 같은 정책을 적용하는 JSON 예시 저장소 사용 |
| 공개 상세 | 검증된 공방 문장과 인용 카드만 표시. 폐기한 주장 원문은 표시하지 않음 |
| 정책 문서 | `category-policy.md` 갱신. 국가법령정보센터·헌재·중앙선관위·성평등가족부·지원센터 공식 출처. 제251조의 2026년 개정 및 지원 연락처 반영 |

Claw3D 공식 확인: [저장소](https://github.com/iamlukethedev/Claw3D), [MIT 라이선스](https://github.com/iamlukethedev/Claw3D/blob/main/LICENSE), [v0.1.4](https://github.com/iamlukethedev/Claw3D/releases/tag/v0.1.4). 상세 계약·실행은 [controlroom.md](controlroom.md)를 참고합니다.

## 이번 검증

- `npm run typecheck`, `npm run lint`, `npm run build` 통과.
- 공개 승인 필터·HTTP 관제실·WS 관제실 회귀 테스트 **3파일 26개** 통과. DB 스키마는 변경하지 않았고 이번에는 Supabase/RLS 서버 테스트를 재실행하지 않았습니다.
- Chrome **1280px / 390px**: 첫 화면 이동, 승인 사례 5건, 주제·조작·유포 경로 조합 필터, 흐림 처리, 검사 메뉴 이동, 2D 타임라인·근거 카드, 공개 정책 확인. 두 크기 모두 가로 넘침·pageerror 0.
- 승인 전·반려·성적 콘텐츠 표시 사례 3개의 직접 상세 접근도 차단. 스트리밍 응답 때문에 상태 코드는 200일 수 있지만 404 화면/noindex이며 사례 내용은 나오지 않는 기존 한계는 유지합니다.
- 별도 Claw3D Chrome 검사: **20개 법정 이벤트, 7명 작업 시작, 7개 최종 발언, 종료 후 0 working / 7 idle**, E1·S1 인용 전달, pageerror 0, 공개 설정 토큰 비노출.
- 공개 화면 캡처/결과: `clone-screens/stage7-public-entry/` (8장 + result.json).
- Claw3D 캡처/결과: `clone-screens/stage7-controlroom/` (3장 + result.json). 자동 검사는 3460/3470/3471에서 실행하고 종료했으며 사용자용 3440은 계속 실행합니다.

## 다시 실행하기

서버의 Node 24 경로를 먼저 설정합니다. 키 값을 명령에 넣지 않습니다.

```sh
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/ai-verify/web
PAIRSIGHT_PROVIDERS=mock PAIRSIGHT_LLM=mock npm run dev -- --hostname 127.0.0.1 --port 3000
```

다른 터미널에서 다음을 실행한 뒤 3D 명단이 보이면 Enter로 시작합니다.

```sh
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/ai-verify/web
PAIRSIGHT_CLAW3D_PORT=3440 PAIRSIGHT_CONTROLROOM_PORT=3450 PAIRSIGHT_CONTROLROOM_WS_PORT=3451 npm run controlroom -- --loop
```

종료는 각 터미널에서 Ctrl+C입니다. 토큰을 입력하거나 `.env.local` 내용을 열 필요가 없습니다.

## 남은 실제 서비스 연결

- 화면은 **시연용 가상 사례**입니다. 사람이 실제 사건을 승인한 운영 서비스라는 뜻은 아닙니다. 승인 UI·Supabase 연결·제보 접수는 아직 없습니다.
- Gemini 실측은 완료됐지만 새 웹 검사 → 실시간 Gemini 공방 → 승인 → 공개 목록으로 이어지는 운영 흐름은 아직 연결되지 않았습니다. 이번 3D 재생은 외부 API 호출 없는 mock입니다.
- 선거 기간 플래그와 카테고리 검토는 운영자 집행이 필요합니다. 성적 합성물 자동 탐지·즉시 삭제, 재난 피해자/참혹 장면의 DB 이미지 차단, 분기 통계는 [정책 문서](category-policy.md)의 남은 작업입니다.
- 키 파일은 읽거나 수정하지 않았습니다. 기존 사용자 `web/.gitignore`, 예전 미추적 관제실 캡처 32장, Claw3D의 기존 미추적 probe 테스트를 보존했습니다.
