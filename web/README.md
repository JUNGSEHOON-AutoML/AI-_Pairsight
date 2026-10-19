> **현재 시작 안내는 [프로젝트 README](../README.md)를 먼저 확인하세요.** 아래 문서는 초기 mock 시제품부터의 개발 기록이며, 현재 편집국·로그인·후보 발견 상태는 루트 README와 최신 인수인계가 기준입니다.

# Pairsight 개발용 시제품

이미지 파일 또는 URL 속 이미지를 받아 원본 후보와 근거를 표시하는 Next.js 앱입니다.
현재 역이미지 검색·출처 신호·로그인은 **개발용 모의 데이터**로만 동작합니다.
실제 이미지의 진위를 판별하는 서비스로 사용할 수 있는 단계는 아닙니다.
기사 본문의 사실 확인은 아직 구현되지 않았습니다.

## 실행

이 서버에서 확인한 Node 버전은 사용자 홈에 설치된 v24.22.0입니다.

```sh
cd /userHome/userhome4/sehoon/ai-verify/web
PATH="$HOME/.local/node/bin:$PATH" npm run dev -- --hostname 127.0.0.1
```

`http://127.0.0.1:3000/dev/fixtures`에서 8개 예제를 확인할 수 있습니다.
다른 컴퓨터에서 접속한다면 서버의 3000 포트로 SSH 포트 포워딩을 사용하세요.

처음 받은 소스에서 의존성이 없다면 같은 Node 환경에서 `npm ci`를 실행합니다.
저장소·도메인 타입이 바뀐 뒤에는 개발 서버를 재시작하세요. 개발 중 메모리 저장소가 hot reload를 넘어 유지됩니다.

## 데이터와 로그인

- 메모리 저장소이므로 서버를 재시작하면 계정·기록·분석·사용량은 초기화됩니다.
- 새 업로드는 메타데이터를 제거한 최대 512px 썸네일만 `.data/uploads`에 저장됩니다. 원본 바이트는 처리 중 메모리에서만 사용합니다. 계정 삭제로 그 계정의 파일을 삭제하지만, 프로세스 재시작 전에 남은 파일을 정리하는 작업은 아직 없습니다.
- 메일을 보내지 않습니다. mock 모드의 로그인 페이지에 `DEV` 링크가 표시됩니다. 실제 인증을 제공하는 공개 서비스로 배포하지 마세요.
- 처음 로그인하면 익명 ID와 기록을 유지합니다. 기존 계정으로 로그인하면 익명 검사·파일·날짜별 사용량을 그 계정으로 옮깁니다. 이미 가입한 두 계정의 기록은 서로 합치지 않습니다.
- 분석 근거는 이미지 해시와 파이프라인 버전별로 공유합니다. 판정은 검사별 사건 날짜·유포 주장·맥락 근거로 조회 시 계산합니다. 재검사는 새 실행 번호를 가지며 썸네일로 진행하므로 원본 C2PA·EXIF는 다시 검사하지 않습니다.

## 검증

사용자 Node 경로를 적용한 셸에서 실행합니다.

```sh
npm test
npm run lint
npm run build
npm run typecheck
```

2026-10-19: 단위·통합 테스트 97개, 린트, 프로덕션 빌드, 타입 검사 통과.
DB 테스트와 화면 검증 기록은 `../replica/build-log.md`를 참고하세요.

## DB 스키마

앱은 아직 Supabase에 연결되어 있지 않습니다.

- `../replica/schema.sql`과 기존 002 마이그레이션은 계정 흐름 단계의 기준입니다. 판별 v2의 검사별 맥락 근거·날짜 관찰·비교 결과·새 evidence kind는 별도 스키마 변경/RLS 검증이 필요합니다. 그대로 연결하지 마세요.
- 2026-10-18 스키마가 이미 적용된 개발 DB: `../replica/migrations/002_check_context_and_runs.sql`.
- 새 스키마와 마이그레이션을 연이어 적용하지 않습니다. 이전 판정 컬럼은 제거하고 근거를 보존하므로 기존 DB 적용 전 백업이 필요합니다.
- RLS 테스트: `../replica/tests/rls_test.py`. `PSQL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSFILE`로 테스트 DB 접속을 지정할 수 있습니다. `rls`, `rls_old` DB를 재생성하므로 반드시 폐기 가능한 별도 클러스터에서만 실행합니다.

## 다음 작업

1. `../replica/verification-pipeline.md`의 실제 공급자 계약·호출 한도·보관 조건 확인.
2. 실제 검색·팩트체크·C2PA·맥락 제공자 연결 후 Supabase 스키마·RLS·임시 Storage 구현.
3. 이메일 로그인 발송, 세션 비밀키, 로그인 요청 제한, 익명 데이터 정리 작업.

외부 서비스의 키·계약이 필요한 작업과 실제 클라우드 배포는 아직 진행하지 않았습니다.

## 판별 엔진 v2

설계 및 외부 서비스 확인 결과: `../replica/verification-pipeline.md`.
`lib/verification/`는 6단계 Provider 경계를 구현합니다. 검색·C2PA·LLM은 mock이며 pHash·정렬·잘라내기·반전·색보정·차이 히트맵·EXIF 존재 확인은 실제 처리입니다. mock 모드의 URL 입력은 `https://demo.pairsight.test/news/<scenario>` 예제만 지원하고 실제 HTTP fallback은 사용하지 않습니다.

`npm run fixtures`는 직접 그린 화면 fixture와 실제 비교용 픽셀 쌍을 재생성합니다(Pillow 필요).
브라우저 회귀 검증은 폐기 가능한 로컬 서버에서 `../replica/tests/verification_flow.cjs`, `account_flow.cjs`를 실행합니다. `PAIRSIGHT_PLAYWRIGHT_MODULE`로 설치된 Playwright 경로, `PAIRSIGHT_BASE_URL`로 로컬 서버 주소를 지정할 수 있습니다.
