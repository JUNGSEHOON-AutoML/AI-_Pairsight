# 인수인계 — 실제 사건 중심 편집국 통합

작성일: 2026-10-19. 실행 계약은 [case-newsroom.md](case-newsroom.md).

## 현재 사용할 화면

- **통합 편집국: http://localhost:3002/newsroom — 왼쪽 대시보드 + 오른쪽 3D, 이 주소 하나만 사용**
- 공개 대시보드: http://localhost:3002/cases
- Claw3D 내부 뷰어: 127.0.0.1:3460/controlroom/newsroom (진단 전용, 별도 탭 불필요)
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
6. `40a7220` — 초기 통합 인수인계·정책 링크·브라우저 캡처.
7. `7498979` — 인증된 실시간 SSE·읽기 전용 3D 프록시·회귀 검사.
8. `6bd017a` — 왼쪽 카테고리 대시보드 + 오른쪽 3D 통합 화면·공동 실행기·격리 브라우저 검사.
9. 후속 인수인계와 통합 화면 캡처는 문서 커밋에 포함한다.

Claw3D 작업 위치:
`~/Documents/Codex/2026-10-19/my-app-playwright-mcp-node-v16/worktrees/claw3d-cases`

브랜치 `feature/case-department-view`:

1. `35e6bd7` — 9개 부서의 3D 전용 화면·읽기 전용 localhost 서버.
2. `a192153` — 인코딩 경로 우회 차단·법정 발언 인용 표시.
3. `84efae6` — 같은 주소 임베딩·작업/인계 애니메이션·부모 화면 연동·모바일 캔버스.

원본의 미커밋 .gitignore 변경, 진단 캡처 32장, Claw3D의 기존 probe 테스트는 보존했다. 예전 7좌석 mock 반복 시연 프로세스는 종료했다. 3000의 원본 앱은 새 앱과 별개이며 작업 결과는 3002/newsroom에서 본다. Codex의 로컬 전달 포트는 세션마다 다를 수 있으므로 기존 두 탭을 함께 열 필요가 없다.

## 한 화면 통합 후속 작업

- 왼쪽: 주제 5종, 전체 사건/승인 대기/공개 사례 탭, 조작 유형·제보 경로 필터. 승인된 결과만 사실 제목과 흐린 썸네일로 공개한다.
- 오른쪽: 실제 9개 부서·담당자·사건 위치. 사건 선택 → 현재 부서 강조, 부서 선택 → 해당 작업 기록. 세부 근거와 사람 승인은 기존 사건 상세로 연결한다.
- 같은 SSE가 두 화면을 갱신한다. 실제 작업 중에만 담당자가 책상으로 걸어가 타이핑하고, 부서 전환은 문서 인계로 표시한다. 대기/실패 시 작업이 멈추며 연결이 끊기면 마지막 기록임을 알린다. 처음 열 때 과거 이력을 진행 중인 것처럼 재생하지 않는다.
- 프로세스는 별도 유지한다. `/controlroom` 인증 프록시가 Claw3D HTML/정적 자산만 전달하며 변경 API·임의 URL은 차단한다. 브라우저는 추가 포트·관제 토큰을 입력할 필요가 없다. OpenClaw/Hermes는 설치하지 않았다.
- 재시작 후 실제 DB 확인: **3건, 승인 대기 1 / 실패 2 / 작업 중 0 / 공개 0**. 새 승인·접수·재시작을 대신 실행하지 않았다. 현재 담당자가 쉬고 있는 것은 실제 상태에 따른 표시다.
- 비밀 파일 내용은 출력하지 않았고 `.env.local` 및 `.newsroom/operators.json`이 Git 제외 대상임을 확인했다. 기존 운영자 계정 등록도 유지된다.

### 후속 검증 결과

- 기존 전체 검사 **25파일·287개 통과**. 이후 판정 생성 전 법정 상태에 대한 회귀 검사를 추가하고, 관련 검사 **6개 모두 재통과**했다. 전체 287개와 관련 6개는 중복을 포함하며 합산하지 않는다.
- Claw3D 관련 검사 **5개 통과**, Pairsight 전체 린트·양쪽 프로덕션 빌드(타입 검사 포함), Claw3D 변경 파일 린트 통과.
- 최종 격리 브라우저 검사: 같은 출처에 대시보드/iframe/정적 자산 로딩, 아홉 부서, 양방향 선택, 작업 시작/이동/실패 반영, 실제 캔버스 프레임 변화, 승인 전 비노출·승인 후 제목/흐림·철회 즉시 제외, fixture 제외, 익명 접근 차단·로그아웃 후 SSE 종료.
- 최종 1회 측정의 저장 → 3D 작업 표시 지연 **681ms**. 성능 보장이나 LLM 실행 시간 측정이 아니다.
- 390px: iframe 뷰포트·캔버스 모두 368px, 아홉 부서가 화면 안에 보임, 가로 넘침 없음. 1440px: 왼쪽 대시보드와 오른쪽 3D 배치 확인. 브라우저 예외 0, 3D 정적 자산 오류 0.
- 캡처: [전체 화면](clone-screens/unified/unified-1440.png), [390px](clone-screens/unified/unified-390.png), [작업 동작](clone-screens/unified/isolated-working-1440.png), [검사 결과](clone-screens/unified/result.json). `isolated-working`은 **운영 DB 사본에서 시험한 상태**이며 실제 운영 사건이 처리 중이라는 증거가 아니다.
- 발견해서 수정한 문제: iframe의 임베딩 감지 누락, 판결 전 빈 법정 섹션 참조, 모바일 전환 시 캔버스가 이전 데스크톱 폭으로 고정되는 CSS 문제. 테스트를 완화하지 않고 연결 감지·null 처리·그리드 최소 너비와 카메라 맞춤을 수정했다.

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

## 이전 통합 검증과 재현

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

브라우저 재검증 (양쪽 빌드가 있어야 하며, 테스트가 3012/3462에 자체 서버를 시작한다):

~~~bash
CLAW3D_DIR="$(cd ../../claw3d-cases && pwd)" node --import tsx eval/newsroom/unified-smoke.mjs
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

코드를 수정했다면 Pairsight web에서 `npm run build`, Claw3D worktree에서 **`CLAW3D_NEWSROOM_MODE=1 npm run build`** 후 실행한다. Claw3D 실행 시에도 동일한 모드가 필요하며 공동 실행기가 이를 전달한다. 의존성과 모델 캐시는 이미 설치되어 있고 OpenClaw·Hermes 설치는 필요하지 않다.

키 파일과 `.newsroom/` 전체가 Git 제외 대상임을 확인했다. 키 값·비밀번호·계정 해시는 커밋하지 않았다. 운영자 추가는 `python3 scripts/create-newsroom-operator.py`; 정치·선거의 독립 2인 검토에는 다른 운영자 계정이 필요하다.
