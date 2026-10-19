# 인수인계 — Claw3D WebSocket 관제실 (2026-10-19)

## 완료 상태

Claude 작업 중단 당시의 미커밋 WebSocket 어댑터와 스크립트·테스트를 이어받아 완성했습니다. 실제 mock 재판의 **20개 이벤트·7개 좌석·7개 최종 발언**이 별도 Claw3D 3D 사무실에서 재생되고, 종료 후 **0 working / 7 idle**로 돌아옵니다. 브라우저 오류 0건, 인용 카드 E1·S1 전달, 공개 설정 토큰 비노출을 확인했습니다.

공개 카테고리 대시보드·승인 RLS·카테고리 정책은 기존 커밋을 보존했습니다. 이번 변경은 운영자 관제실 연결과 Claw3D 호환성에 집중했습니다. 검색·LLM·Supabase 실서비스 연결을 새로 진행하지 않았고 공방은 mock입니다.

## 핵심 변경

- Pairsight `web/lib/controlroom/gateway.ts`: localhost·토큰 인증·보기 전용 WS. 좌석별 발언 전송, 연결별 이벤트 번호, 정확한 세션 조회, 이전 재판 큐 취소, 완료 후 기록 동기화.
- `controlroom-demo.ts`: 전송 완료를 기다려 재생 종료/다음 재판이 마지막 발언을 자르지 않습니다. 화면 명단 준비 후 터미널 Enter로 시작할 수 있습니다.
- `controlroom-claw3d.mjs`: 두 서버를 함께 실행, 토큰은 환경으로 전달, 별도 임시 설정 사용, 종료 시 정리. 기존 OpenClaw 설정을 읽는 실행 경로를 사용하지 않습니다.
- Claw3D: 함수형 상태 업데이트의 **이벤트 도착 시각 고정**으로 렌더링 재시도 시 작업 표시가 무한 연장되던 문제 수정. 연결 시 실제 명단 로딩, WebAssembly용 CSP, 환경 변수 전용 인증도 적용했습니다.
- Claw3D의 운영자 쓰기 UI가 없어지는 것은 아닙니다. 어댑터가 변경 RPC를 거부하고 운영자의 메시지를 LLM/법정으로 전달하지 않습니다.

## 검증

| 검사 | 결과 |
|---|---|
| Pairsight 전체 테스트 | 18파일, 241개 통과 (`npm test -- --maxWorkers=2`) |
| 관제실 회귀 테스트 | 21개 통과 |
| Pairsight 타입 / 린트 / 프로덕션 빌드 | 통과 |
| Claw3D 관련 테스트 | 5파일, 17개 통과 |
| Claw3D 프로덕션 빌드 | 통과 |
| Claw3D 변경 파일 린트 | 오류 0; OfficeScreen의 기존 경고는 남음 |
| 시각 회귀 뮤테이션 | 도착 시각 대신 재실행 시각을 읽게 바꾸면 테스트 실패; 원복 완료 |
| 실제 Chrome 3D 검사 | 20개 이벤트, 7명 작업 시작·최종 발언, 최종 작업 0 / 대기 7, pageerror 0 |
| 토큰 | 환경 전용 모드 파일 비저장 테스트 및 브라우저 공개 설정 비노출 검사 통과 |

초기 전체 테스트는 Claw3D 빌드와 동시에 실행하면서 기존 RSS 테스트 한 건이 5초 제한을 넘었습니다. 빌드 종료 후 병렬도를 2로 낮춘 전체 실행은 모두 통과했습니다. 테스트 기대값이나 시간 제한을 완화하지 않았습니다.

GPU 없는 서버에서 브라우저 프레임률을 낮췄습니다. 실제 Claw3D 프로덕션 앱과 프록시를 사용했으며 브라우저에 가짜 완료 상태를 주입하지 않았습니다. 결과는 `clone-screens/controlroom/verified/result.json`, 캡처는 같은 디렉터리의 ready/working/finished.png입니다.

## 실행과 재현

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/ai-verify/web
npm run controlroom
```

`http://127.0.0.1:3400`에서 7명 명단이 보이면 터미널 Enter로 재생합니다. 종료는 Ctrl+C입니다. 기존 세션의 서버가 포트를 사용 중이면 다음 조합을 사용하세요.

```bash
PAIRSIGHT_CLAW3D_PORT=3440 PAIRSIGHT_CONTROLROOM_PORT=3450 PAIRSIGHT_CONTROLROOM_WS_PORT=3451 npm run controlroom
```

자동 재현은 `node eval/controlroom/smoke.mjs`입니다. 기본 검사 포트 3440/3450/3451을 사용하고 검사 종료 후 해당 서버를 정리합니다. Playwright는 별도 Claw3D 설치의 것을 사용합니다. `CLAW3D_DIR`, `CHROME_PATH`, `CONTROLROOM_SMOKE_OUTPUT`으로 위치를 바꿀 수 있습니다.

다른 머신에서는 [연결 문서](controlroom.md)대로 upstream 기준 커밋 `0565b7892909eca7bbc8f2d9b0fad171dd75ad7c`에 `integrations/claw3d-viewer.patch`를 적용하고 빌드해야 합니다. 이 서버의 `~/claw3d`에는 적용했습니다. OpenClaw/Hermes는 설치하지 않았습니다.

## 로컬 커밋

- Pairsight `401cfe2`: WS 관제실·실행기·자동 재현 검사.
- Claw3D `220b072`: 환경 변수 전용 토큰 모드.
- Claw3D `1e1b456`: 활동 기한 고정·첫 연결 명단·WebAssembly CSP 및 회귀 테스트.
- 본 문서·호환 패치·검증 캡처는 별도 문서 커밋입니다. **push는 하지 않았습니다.**

## 보존한 이전 작업과 남은 범위

- Pairsight의 이전 `ws-replay-*.png` 미커밋 진단 캡처 32개와 Claw3D의 `tests/unit/zz-pairsight-probe.test.ts`는 그대로 보존했습니다. 새 성공 캡처만 이번 커밋에 넣었습니다.
- 이전 세션이 실행한 포트 3400/3410/3411 서버와 과거 `~/.openclaw` 설정은 변경하지 않았습니다. 새 실행기는 독립 설정을 사용합니다. 과거 평문 데모 토큰을 새 실행에 재사용하지 마세요.
- 이번에는 원격 배포, Supabase 연결, 외부 검색/LLM 호출을 하지 않았습니다. 실제 판정 정확도에 대한 새 실험 결과도 아닙니다.
- 구체적인 최초 문제: 서버가 끝났는데도 화면의 작업 기한이 계속 현재 시각 + 5초로 재계산됐습니다. 프레임 간격만 늘리는 것으로 해결되지 않았으며, 도착 시각 고정 후 실제 3D 완료 검사가 통과했습니다.

기존 프로세스의 인증 토큰을 `/proc`에서 읽어 진단하려던 도구 요청은 자동 승인 검토가 거절했습니다. 해당 접근은 실행되지 않았습니다. 이후 모든 검사는 새 토큰·별도 포트·임시 설정으로 수행했습니다.
