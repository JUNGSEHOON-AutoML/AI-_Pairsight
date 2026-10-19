# 운영자용 관제실: Claw3D 연결 (2026-10-19)

법정 레이어([newsroom-court.md](newsroom-court.md))의 공방을 운영자가 3D 사무실에서 지켜보는 **보기 전용** 화면입니다. Claw3D는 별도 앱으로 두고, Pairsight에는 어댑터만 있습니다.

## 1. Claw3D 확인 결과

| 항목 | 값 |
| --- | --- |
| 저장소 | [github.com/iamlukethedev/Claw3D](https://github.com/iamlukethedev/Claw3D) |
| 라이선스 | **MIT** (GitHub API, 저장소 LICENSE) |
| 상태 | 보관(archived) 아님. 별 약 2,340개, 포크 640개, 열린 이슈 51개 |
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

## 2. 어댑터 (`web/lib/controlroom/`)

| 파일 | 하는 일 |
| --- | --- |
| `state.ts` | 법정 이벤트(`CourtEvent`)를 좌석 7개(판사, 검사, 변호인, 배심원 1·2·3, 서기)의 상태로 바꿉니다. 상태: 대기/작업 중/발언, 발언 요약, 인용 근거 카드 ID, 폐기된 주장 수 |
| `server.ts` | Claw3D custom 런타임 계약을 따르는 HTTP 서버 |
| `scripts/controlroom-demo.ts` | mock 재판 하나를 처음부터 끝까지 재생합니다(단계마다 지연, `--loop`로 반복) |

**법정 쪽 이벤트**
- `runCourt(…, { onEvent })`가 좌석마다 작업 → 발언 → 대기 순서로 이벤트를 냅니다.
- 발언에는 **검증을 통과한 주장만** 들어갑니다. 폐기된 주장은 개수만 나갑니다. 관제실이 근거 없는 주장을 퍼뜨리지 않게 하기 위해서입니다.

**보안·권한**

| 요구 | 구현 |
| --- | --- |
| 보기 전용 | 바꾸는 경로가 없습니다. `PUT`/`PATCH`/`DELETE`는 405, 그 밖의 경로는 404입니다. 채팅은 운영자 메시지를 **읽지 않고** 버립니다. 어떤 LLM이나 법정에도 전달하지 않고, 그 좌석의 현재 상태만 돌려줍니다("보기 전용 관제실이에요…"). Claw3D 쪽도 custom 런타임에서 `config.*`를 지원하지 않습니다 |
| localhost만 | 어댑터는 loopback이 아닌 주소에 바인딩하지 않습니다(테스트). Claw3D도 `HOST=127.0.0.1`로 띄웁니다 |
| 토큰은 환경 변수 | `PAIRSIGHT_CONTROLROOM_TOKEN`(24자 이상, `[A-Za-z0-9_-]`). 프록시가 헤더를 전달하지 않으므로 런타임 URL 경로에 넣습니다(`http://127.0.0.1:3410/<token>`). 틀린 토큰은 없는 경로와 똑같이 404를 받습니다. 비교는 상수 시간으로 합니다 |
| 포트 | Pairsight 3000, **Claw3D 3400**, **어댑터 3410**(`PAIRSIGHT_CONTROLROOM_PORT`) |
| 요청 크기 | 16 KB를 넘는 채팅 본문은 413 |

**토큰 노출의 한계:** Claw3D는 런타임 URL을 연결 화면에 평문으로 보여주고, `~/.openclaw/claw3d/settings.json`에 저장합니다. 그래서 토큰도 함께 보입니다.
- localhost 전용이라 외부에서는 접근할 수 없습니다.
- 그래도 토큰은 데모마다 새로 만들고, 공유 화면에 띄우지 않습니다.

## 3. 실행

```bash
export PAIRSIGHT_CONTROLROOM_TOKEN=$(python3 -c "import secrets;print(secrets.token_urlsafe(32))")
cd ~/ai-verify/web && npx tsx scripts/controlroom-demo.ts --step-ms 6000 --loop
```

```bash
cd ~/claw3d && PORT=3400 HOST=127.0.0.1 CUSTOM_RUNTIME_ALLOWLIST=127.0.0.1 CLAW3D_GATEWAY_ADAPTER_TYPE=custom CLAW3D_GATEWAY_URL=http://127.0.0.1:3410/$PAIRSIGHT_CONTROLROOM_TOKEN npm run dev
```

브라우저에서 `http://127.0.0.1:3400`을 열고 연결 화면에서 Connect를 누릅니다.

## 4. 실제 연결 확인 (2026-10-19, 이 서버)

- **연결됨:** "CUSTOM • CONNECTED". 좌석 7개가 사무실 에이전트 7명(Judge, Prosecutor, Defense, Juror 1–3, Clerk)으로 나타났습니다.
  - 캡처: `clone-screens/controlroom/claw3d-office-1440.png`
- **상태 애니메이션은 되지 않습니다.** Claw3D의 custom 런타임에는 이벤트 스트림이 없습니다(1장). 그래서 사무실의 "작업 중/발언" 표시가 어댑터 상태를 따라가지 않고, 7명 모두 idle로 보입니다.
  - 공방 진행 상태는 어댑터 `/state`의 `pairsight` 필드에는 있지만, Claw3D는 이 필드를 그리지 않습니다.
- **Claw3D 채팅도 어댑터에 닿지 않습니다.** Claw3D 채팅이 먼저 `sessions.patch`를 부르는데, Claw3D 자신의 custom 공급자가 이를 구현하지 않아 "Custom runtime does not implement sessions.patch" 오류가 납니다.
  - 캡처: `clone-screens/controlroom/claw3d-chat-sessions-patch-1440.png`
  - Claw3D 연결 화면도 "transport-specific chat handoff still needs a follow-up slice"라고 안내합니다.
  - 어댑터의 채팅 응답 자체는 테스트로 확인했습니다(`tests/controlroom.test.ts`).
- **정리하면:** 요청한 범위(OpenClaw·Hermes 설치 없이 custom HTTP 인터페이스만)에서 지금 Claw3D가 보여주는 것은 **좌석 명단**까지입니다. 3D로 공방 진행을 재생하려면 아래 중 하나가 필요합니다(결정 필요).
  - (a) Claw3D 쪽에 custom 런타임 이벤트 폴링이나 스트림, `sessions.patch` 무동작 처리를 기여합니다. 상류(upstream) 변경이라 시간이 걸립니다.
  - (b) Claw3D에 들어 있는 데모 게이트웨이의 WebSocket 프로토콜(`server/demo-gateway-adapter.js`, OpenClaw 호환)을 따르는 두 번째 어댑터를 씁니다. OpenClaw를 설치하지는 않지만 "custom HTTP만"이라는 조건을 벗어납니다.
- **데모 스크립트**(`controlroom-demo.ts`)는 실제 파이프라인(가상 페이지)과 규칙 v3로 판사 판정을 냅니다. 스크립트된 에이전트로 공방 전체를 재생하는 동안 어댑터 상태가 단계별로 바뀌는 것을 확인했습니다(로그 20개 이벤트). 재생 중에 다음 두 가지를 볼 수 있습니다.
  - 인용 없는 검사 주장이 폐기되는 장면
  - 배심원 3이 "진짜 확인"으로 바꾸려다 거부되는 장면
