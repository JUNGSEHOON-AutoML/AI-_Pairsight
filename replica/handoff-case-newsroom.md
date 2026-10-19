# 인수인계 — 실제 사건 중심 편집국 통합

작성일: 2026-10-19. 실행 계약은 [case-newsroom.md](case-newsroom.md).

## 현재 사용할 화면

- 운영자 편집국: http://localhost:3002/newsroom
- 공개 대시보드: http://localhost:3002/cases
- 별도 Claw3D: http://localhost:3460/newsroom
- HTTP 관제 어댑터: 127.0.0.1:3461, 서버 환경 토큰 인증. 브라우저에 토큰을 입력하지 않는다.

사용자가 운영자 계정 등록을 완료했고 등록 여부를 HTTP로 확인했다. 비밀번호/해시/키는 출력하지 않았다. 운영자 로그인은 사용자가 직접 수행한다.

## 작업 위치와 커밋

두 원본 저장소를 수정하는 대신 worktree를 사용했다. 모두 로컬 커밋이며 push하지 않았다.

Pairsight 작업 위치:
`~/Documents/Codex/2026-10-19/my-app-playwright-mcp-node-v16/worktrees/ai-verify-cases`

브랜치 `feature/case-newsroom-integration`:

1. `f96b74e` — Case·SQLite·순차 워커·실패/승인 대기 흐름.
2. `b6706b2` — 각 부서 최소 기능·사람 승인·신뢰성.
3. `3d4ccb7` — 운영자 인증·수동 접수·Google 한국어 피드.
4. `8fdb911` — 편집국 보드·승인 후 실제 사건 공개·예시 화면 분리.
5. `5e5ae84` — Case/법정 이벤트·Claw3D 어댑터·공동 실행기·운영 환경의 구 mock API 차단.
6. 이 문서와 최신 정책 링크·브라우저 캡처는 마지막 문서 커밋에 포함한다.

Claw3D 작업 위치:
`~/Documents/Codex/2026-10-19/my-app-playwright-mcp-node-v16/worktrees/claw3d-cases`

브랜치 `feature/case-department-view`:

1. `35e6bd7` — 9개 부서의 3D 전용 화면·읽기 전용 localhost 서버.
2. `a192153` — 인코딩 경로 우회 차단·법정 발언 인용 표시.

원본의 미커밋 .gitignore 변경, 진단 캡처 32장, Claw3D의 기존 probe 테스트는 보존했다. 예전 7좌석 mock 반복 시연 프로세스는 종료했다. 3000의 원본 앱은 새 앱과 별개이며 작업 결과를 보려면 위 3002/3460을 사용한다.

## 실데이터와 한계

Google Fact Check 검색은 HTTP 200으로 연결됐고 3건을 비공개 Case로 접수했다. 결제 설정을 변경하지 않았다. 프로젝트의 기존 결제 연결 상태나 향후 요금은 별도로 확인하지 않았다.

- AFP 두 건: robots 허용 확인 불가로 OSINT 중단. 우회·자동 재시도 없음.
- 오마이뉴스 한 건: 이미지 동일성 미확인으로 판단 불가, 공방 생략/LLM 0회, T&S 승인 대기.
- 공개 승인·정답 평가 라벨은 자동으로 넣지 않았다. 현재 공개 0건, 정확도 미평가.
- 이 실행은 통합 경로 확인이며 판정 정확도나 오탐/미탐의 새 실측이 아니다.
- RSS는 이용 허락이 확정되지 않아 비활성. 근거와 공식 링크는 [case-newsroom.md](case-newsroom.md).
- 자동 역이미지 검색과 Fact Check 이미지 검색은 아직 새 Case 흐름에 미연결. 수동 후보 + Fact Check 텍스트 검색을 사용한다.
- Supabase는 아직 미연결. 로컬 SQLite + 서버 권한 검사로 운영하며 기존 SQL/RLS를 클라우드에서 실행·검증한 것으로 표현하지 않는다.
- LLM 기본은 로컬 Ollama `http://127.0.0.1:11500`. 판단 불가이면 호출하지 않는다. 실제 공방이 필요한 경우 Ollama 사용 불가는 법정 실패로 남는다. 공유 서버의 다른 Ollama나 GPU 작업은 변경하지 않았다.
- 공개 제목·요약과 권리/콘텐츠 플래그의 적절성은 사람이 검토한다. ‘공개 승인 철회’가 즉시 공개 목록과 상세에서 제외한다.

## 검증과 재현

- 최종 Pairsight 테스트 **24파일·282개 통과**, Claw3D 신규 권한 테스트 **2개 통과**. 기존 법정·사진 비교·같은 장소 다른 시점 반례·튜닝 안전 테스트를 유지했다.
- 단위 검사는 Case 상태, 실패 중단, 정치 2인 승인, 기존 법정 원칙, 실제 픽셀 비교, 권한·피드·관제 HTTP 차단을 포함한다.
- 브라우저 검사는 실제 DB의 **임시 사본**과 일회용 테스트 계정으로 수행했다. 운영 DB의 사건을 승인하지 않았다.
- 로그인 보호/CSRF/오래된 revision 승인 거부/미승인 본문 비노출/운영 환경 fixture 비노출/390px 가로 넘침 없음/9개 3D 구역/쓰기 차단을 검사했다. pageerror 0.
- Next 스트리밍의 notFound는 HTTP 200을 유지할 수 있다. 미승인 상세 검사는 본문 비노출과 noindex도 확인한다.
- 결과와 캡처: [clone-screens/cases/result.json](clone-screens/cases/result.json), 같은 폴더 PNG 7장.
- Pairsight 전체 린트·타입·프로덕션 빌드, Claw3D 전체 타입·프로덕션 빌드와 변경 파일 린트를 확인했다. Claw3D의 기존 전체 테스트 모음을 모두 재검증했다고 주장하지 않는다.
- 새 worktree의 모델 경로 누락으로 첫 비교 검사가 실패했다. 기존 로컬 캐시를 지정해 해결했다. 첫 샌드박스 빌드 실패는 Turbopack 캐시를 지우고 허용된 환경에서 재빌드해 해결했다. 빌드 동시 실행 중 기존 5초 제한 검사 한 건이 시간 초과해, 빌드 종료 후 단일 워커로 다시 검사했다. 테스트 기준/제한 시간은 완화하지 않았다.

~~~bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/Documents/Codex/2026-10-19/my-app-playwright-mcp-node-v16/worktrees/ai-verify-cases/web
PAIRSIGHT_MODEL_CACHE="$HOME/ai-verify/web/.cache/models" npm test -- --maxWorkers=1
~~~

브라우저 재검증 (실제 서버들이 실행 중일 때):

~~~bash
CLAW3D_DIR="$(cd ../../claw3d-cases && pwd)" node eval/newsroom/smoke.mjs
~~~

현재 smoke는 이번에 확인한 3건과 승인 대기 사건을 기대한다. 운영자가 이후 사건을 추가·승인하면 기대값도 갱신하거나 이 시점의 비공개 사본으로 재현해야 한다. 운영 DB를 테스트 기대값에 맞춰 되돌리지 않는다.

## 다시 실행

Node 24를 사용한다. 기존 키 파일을 읽어 출력하지 않고 Node의 env-file 로더로만 로드한다.

~~~bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/Documents/Codex/2026-10-19/my-app-playwright-mcp-node-v16/worktrees/ai-verify-cases/web
CLAW3D_DIR="$(cd ../../claw3d-cases && pwd)" \
PAIRSIGHT_LLM=ollama \
PAIRSIGHT_MODEL_CACHE="$HOME/ai-verify/web/.cache/models" \
node --env-file-if-exists="$HOME/ai-verify/web/.env.local" scripts/newsroom-start.mjs
~~~

실행기는 앱·워커·어댑터·Claw3D를 함께 시작하고 Ctrl+C로 자식들을 종료한다. 토큰을 지정하지 않으면 새 임의 토큰을 자식 환경에만 전달한다. 파일·로그·브라우저에 저장하지 않는다. 포트 변경: `PAIRSIGHT_PORT`, `PAIRSIGHT_CLAW3D_PORT`, `PAIRSIGHT_CONTROLROOM_PORT`. 기존 3000과 모두 달라야 한다.

코드를 수정했다면 양쪽에서 `npm run build` 후 실행한다. 의존성과 모델 캐시는 이미 설치되어 있고 OpenClaw·Hermes 설치는 필요하지 않다.

키 파일과 `.newsroom/` 전체가 Git 제외 대상임을 확인했다. 키 값·비밀번호·계정 해시는 커밋하지 않았다. 운영자 추가는 `python3 scripts/create-newsroom-operator.py`; 정치·선거의 독립 2인 검토에는 다른 운영자 계정이 필요하다.
