# 운영자용 관제실: Claw3D 연결 (2026-10-19 인수 완료)

Pairsight 법정 이벤트를 별도 Claw3D의 3D 사무실에 보내는 **보기 전용** 관제실입니다. 사용자 후속 지시에 따라 데모 게이트웨이 WebSocket 프로토콜을 따르는 두 번째 어댑터를 완성했습니다. OpenClaw·Hermes는 설치하지 않았습니다.

## 1. Claw3D 확인 결과

| 항목 | 값 |
| --- | --- |
| 저장소 | [github.com/iamlukethedev/Claw3D](https://github.com/iamlukethedev/Claw3D) |
| 라이선스 | **MIT** ([공식 LICENSE](https://github.com/iamlukethedev/Claw3D/blob/main/LICENSE), GitHub API 재확인) |
| 상태 | 2026-10-19 공식 GitHub API 재확인: archived=false, disabled=false. 별 2,342개, 포크 641개. open_issues_count=51(이슈와 PR 합산) |
| 최근 활동 | 마지막 push 2026-08-21(CI 설정만). 마지막 코드 변경은 2026-05-30(Hermes 어댑터, OpenClaw 프로토콜 v4) |
| 최신 릴리스 | v0.1.4 (2026-04-23). 확인한 커밋은 main `0565b78` |
| 구조 | Next.js 앱 + 자체 Node 서버. 백엔드 런타임(OpenClaw, Hermes, 데모, custom HTTP)에 붙는 UI·프록시 층 |

- **설치 위치:** `~/claw3d`(Pairsight 저장소 밖). OpenClaw와 Hermes는 설치하지 않았습니다.
- **custom HTTP 런타임 계약**(`src/lib/runtime/custom/provider.ts`, `docs/integrations/custom-runtime-provider-spec.md`):
  - 브라우저는 Claw3D 자체의 `/api/runtime/custom` 프록시로만 요청합니다. 프록시가 런타임 주소로 다시 요청합니다.
  - `GET /health`, `GET /state`, `GET /registry`. `/state.active`의 키 하나가 사무실의 에이전트 하나가 됩니다.
  - 채팅은 `POST /v1/chat/completions`(OpenAI 형식 응답)입니다.
  - 스펙이 **"정규화된 스트리밍 이벤트 지원은 아직 의도적으로 빠져 있음"**이라고 밝히고 있습니다. 런타임이 에이전트 상태를 실시간으로 밀어 넣을 길이 없습니다.
  - 프록시는 인증 헤더를 전달하지 않습니다. URL의 사용자 정보(user:pass)는 지우고, 경로는 그대로 둡니다.

## 2. 완성된 연결

`runCourt.onEvent → gateway.ts → Claw3D same-origin WS proxy → 3D office`

- 작업: `agent.lifecycle.start`. 발언: `chat.delta → chat.final`(검증된 요약, 인용 카드 ID, 폐기 주장 수). 대기: `agent.lifecycle.end`.
- 발언은 좌석별 순서대로 전송합니다. `finishHearing()`은 전송 큐를 기다린 뒤 `presence`로 최종 기록을 다시 읽게 합니다. 재생 중 매 발언마다 명단을 갱신하지 않습니다.
- 이벤트 번호는 연결별로 증가합니다. 다른 운영자의 접속·개인 상태 질의가 기존 관찰자에게 가짜 번호 누락을 만들지 않습니다.
- `reset()`은 이전 재판의 대기 중 발언을 취소합니다. 각 좌석의 최근 발언은 최대 100개를 메모리에 유지합니다.
- `sessions.list`는 좌석·검색 조건을 적용하며, history는 정확한 세션 키에만 응답합니다. 완료 기록에는 시각이 있습니다.
- `agent.wait`는 진행 중 `timeout`, 완료 `ok`를 반환합니다. 이는 확인한 Claw3D 클라이언트의 계약입니다.
- `/state`를 제공하는 기존 HTTP 어댑터도 유지합니다. **3D 재생에는 WS 연결을 사용합니다.** HTTP의 URL 경로 토큰 방식은 기본 연결로 쓰지 않습니다.

### 보기 전용 및 인증

- 기본 포트: Pairsight 3000 / Claw3D 3400 / HTTP 3410 / WS 3411. 실행기는 중복 및 3000 사용을 거부하고 서버를 127.0.0.1에만 바인딩합니다.
- WS `connect`의 토큰을 상수 시간으로 비교합니다. 인증 전 RPC, 잘못된 토큰, 외부 브라우저 Origin, 16 KB 초과 프레임을 거부합니다.
- 에이전트·판정·설정·파일·작업 변경 RPC는 거부합니다. `sessions.patch`는 UI 호환 응답만 하고 아무것도 적용하지 않습니다. 운영자 채팅은 에이전트에 전달·저장하지 않고 현재 상태를 반환합니다.
- `controlroom-claw3d.mjs`가 실행마다 임시 토큰을 생성하거나 `PAIRSIGHT_CONTROLROOM_TOKEN`을 받아 자식 프로세스 환경으로만 전달합니다. URL·로그에 토큰을 넣지 않습니다.
- Claw3D 패치의 `CLAW3D_GATEWAY_ENV_ONLY=1`은 연결을 환경 변수에 고정하고 설정 저장 시 토큰을 제거합니다. 공개 설정 API도 토큰을 가립니다. 임시 설정 디렉터리는 종료 시 삭제합니다.
- `STUDIO_ACCESS_TOKEN`을 설정한 환경에서는 Claw3D의 기존 `studio_access` 쿠키 인증도 적용됩니다. 기본 실행은 localhost 전용입니다.

## 3. 실행

이 서버의 `~/claw3d`에는 아래 호환 패치와 프로덕션 빌드가 적용돼 있습니다. 다른 설치에서는 먼저 같은 기준 커밋에 패치를 적용합니다.

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/claw3d
git apply ~/ai-verify/replica/integrations/claw3d-viewer.patch
npm run build
```

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/ai-verify/web
npm run controlroom
```

`http://127.0.0.1:3400`에서 좌석 7개가 보이면 **실행한 터미널에서 Enter**를 눌러 시작합니다. 재생 후 화면은 최종 상태로 유지됩니다. Ctrl+C는 두 서버와 임시 설정을 정리합니다. 웹에서 재판을 시작하거나 판정을 바꾸는 API는 없습니다.

포트가 사용 중이면 아래처럼 별도 포트를 지정합니다(브라우저 검증에 사용한 조합).

```bash
PAIRSIGHT_CLAW3D_PORT=3440 PAIRSIGHT_CONTROLROOM_PORT=3450 PAIRSIGHT_CONTROLROOM_WS_PORT=3451 npm run controlroom
```

`CLAW3D_DIR`로 별도 설치 위치를 지정할 수 있습니다. 단독 어댑터 실행은 `PAIRSIGHT_CONTROLROOM_TOKEN`을 설정하고 `npx tsx scripts/controlroom-demo.ts --wait-for-enter`를 사용합니다. `--loop`, `--once`, `--step-ms`, `--frame-gap-ms`도 지원합니다.

## 4. 멈춤 원인과 Claw3D 호환 패치

1. **활동 표시의 기한 재생성:** React 함수형 상태 업데이트 안에서 `Date.now()`를 읽어 렌더링 재시도마다 오래된 이벤트의 작업·발언 표시가 연장됐습니다. 실제 브라우저에서는 법정 store가 모두 idle인 상태에서도 3D에 전달된 7명의 작업 기한이 같은 시각의 `현재 + 5초`로 계속 재생성됐습니다. 이벤트 도착 시각과 좌석 snapshot을 updater 생성 전에 고정했습니다. reconciliation 시각도 updater 밖에서 고정합니다.
2. **첫 연결 명단:** 연결 전 데모가 만든 `main` 1명을 이미 로딩 완료로 간주하던 경로를 수정해 연결 시 인증된 7명 명단을 다시 읽습니다.
3. **프로덕션 WebAssembly 차단:** Three.js 텍스트 렌더러가 초기화 중 CSP 오류를 냈습니다. JavaScript eval 금지는 유지하면서 `wasm-unsafe-eval`만 허용합니다. [MDN의 두 권한 구분](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_webassembly_execution)을 확인했습니다.
4. **환경 토큰 저장:** Claw3D의 기본 설정 저장이 환경 토큰도 평문으로 복사하므로, 위의 환경 변수 전용 모드를 추가했습니다.

패치는 `replica/integrations/claw3d-viewer.patch`, 원저작권 고지는 `Claw3D-LICENSE`에 있습니다. 별도 Claw3D 저장소 변경이며 Pairsight 제품 화면과는 분리됩니다.

## 5. 검증 결과

- Pairsight **241개 테스트** 통과. 관제실 관련 **21개**에는 인증·Origin·크기 제한·변경 거부·발언 순서·다중 관찰자·reset·완료 후 명단 갱신이 포함됩니다. 타입·린트·프로덕션 빌드 통과.
- Claw3D 관련 **17개 테스트** 및 프로덕션 빌드 통과. 시각 재계산을 되살리는 뮤테이션은 새 회귀 테스트가 실패해 검출했습니다.
- 실제 mock 파이프라인과 규칙 v3의 `trusted_edited` 사건: **20개 법정 이벤트, 7개 좌석 작업 시작, 최종 발언 7개**, 인용 E1·S1 전달. 최종 3D **0 working / 7 idle**, 브라우저 오류 0건, 공개 설정 토큰 비노출 확인.
- 자동 검증: `node eval/controlroom/smoke.mjs`. 별도 Claw3D의 Playwright와 설치된 Chrome을 사용합니다. GPU 없는 서버의 부하를 줄이려고 브라우저 rAF를 느리게 실행하며, 가짜 상태나 프레임을 브라우저에 주입하지 않습니다.
- 캡처·결과: `clone-screens/controlroom/verified/{ready,working,finished}.png`, `result.json`.

## 6. 남은 범위

- 실운영 LLM·검색 API·Supabase 연결은 이번 작업에서 변경하지 않았습니다. 공방 데모의 발언은 mock입니다.
- Claw3D 전체 기능을 지원하는 런타임이 아닙니다. 작업 생성·모델 변경 등 쓰기 UI는 어댑터에서 거부됩니다.
- 과거 HTTP 데모의 설정·캡처는 보존했습니다. 새 실행기는 과거 `~/.openclaw` 설정을 사용하지 않습니다. 과거 설정의 토큰을 새 토큰으로 재사용하지 마세요.
- 초기 upstream 조사(1장)는 인수받은 기록입니다. 이번에는 로컬 기준 커밋과 동작을 검증했으며 새 릴리스 조사는 하지 않았습니다.

## 2026-10-19 브라우저 진입 보완

- 공개 사이트의 첫 화면은 `/cases`이며 3D 관제실은 계속 별도 Claw3D 앱입니다. 공개 사이트 메뉴에 localhost 관리 링크를 넣지 않습니다.
- 기존 3400/3410/3411 프로세스를 보존하고, 이번 사용자 확인용은 UI **3440**, HTTP **3450**, WS **3451**에서 실행합니다. `npm run controlroom -- --loop`로 mock 재판을 반복 재생하며 외부 LLM을 호출하지 않습니다.
- 연결은 기존에 승인된 WS 데모 프로토콜 어댑터를 사용합니다. 요청하신 custom HTTP 어댑터도 유지합니다. Claw3D의 HTTP 계약에는 상태 애니메이션 이벤트가 없으므로 HTTP만으로 3D 재생이 된다고 보고하지 않습니다.
