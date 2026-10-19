# Gemini와 기준값 래칫 인수인계 — 2026-10-19

프로젝트: `/userHome/userhome4/sehoon/ai-verify`. Node: `/userHome/userhome4/sehoon/.local/node/bin/node` (v24.22.0). 변경은 로컬 커밋이며 push하지 않았다.

## 완료

- GeminiProvider + `PAIRSIGHT_LLM=gemini|ollama|mock` 선택. 기본 mock. 키는 `process.env.GEMINI_API_KEY`만 사용한다. API 오류 본문·cause를 폐기하고 모델 출력의 키를 마스킹한다.
- Gemini 외부 입력은 카드 요약·허용 측정값·검증된 공방 텍스트뿐. 이미지·썸네일·히트맵·이미지/서명 URL·기사 발췌·사용자 주장 원문을 제외한다. 요청에 이미지 필드를 추가하거나 텍스트에 바이너리를 숨기는 경우 전송 전에 차단한다.
- 429는 대기/재시도/다른 모델 전환 없이 즉시 재판 종료. `reviewStatus=unavailable`, `failureCode=rate_limit`, **맥락·법정 확인 못 함**, 최종 판단 불가. 원래 코드 판정은 `judgeVerdict`, 실패한 429를 포함한 호출 수는 `llmCalls`에 보존한다.
- `tuning/thresholds.json`을 생산 비교기·판정기의 단일 기준값 파일로 연결. 초기값 변경 없음. 기준값 해시를 분석 캐시 키에 포함한다.
- `tuning/*` 전용 깨끗한 worktree, 보호 파일 시작 해시 및 변경 감지, 시간/횟수 제한, 후보 커밋 → 전체 테스트 → dev 평가 → 거부 후보 reset 틀. 후보 JSON을 받으며 에이전트나 예약 작업을 자동 기동하지 않는다.
- 새 dev/holdout 각각 0건. 실제 사진 dev 독립 사례 30건 미만 또는 별도 holdout 미준비이면 평가/커밋 전에 거부한다. 루프는 holdout 정답·점수를 읽지 않는다. 수동 holdout CLI는 대화형 확인이 필요하다.

## 검증

전체 테스트 **20파일 259개 통과**. 이후 수정에 해당하는 법정/Gemini/튜닝/실제 사진 테스트 40개와 튜닝 안전장치 7개도 통과했다. 기존 같은 장소·다른 시점 반례, 편집 fixture, 뮤테이션 검사, SSRF 방어는 유지한다. 타입 검사·린트·Next.js 프로덕션 빌드 통과.

JSON을 저장소 루트에 둔 뒤 Turbopack이 web 밖 파일을 찾지 못해 `next.config.ts`의 root를 저장소로 지정했다. 이때 생성되는 루트 `.next/`도 Git에서 제외했다. 과거 frozen profile과 현재 운영값이 영구히 같아야 한다는 단일 동등성 assertion은 제거했다. 과거 자료의 해시·고정 결과·실제 픽셀·반례 검사 자체는 그대로 유지한다. 모든 테스트 파일은 루프가 시작되면 보호 대상이다.

**실제 튜닝 루프 실행 0회.** 임시 Git 저장소에서 보호 파일 변경 중단·시간 제한·안전한 후보 reset을 단위 테스트했을 뿐이다. dev·holdout 평가도 실행하지 않았다.

## 실측 및 남은 일

Ollama 동일 `trusted_edited` 사례 재측정: 1.5B 141.895초, 3B 232.655초, 7B 439.265초. 모두 6회 호출, 편집 조작 유지. GPU와 공용 Ollama는 사용하지 않았다. 1사례/1회 측정이며 일반 정확도를 나타내지 않는다. 자세한 조건과 Gemini 행은 [비교표](llm-benchmark-2026-10-19.md), 숫자 원본은 [JSON](benchmarks/llm-2026-10-19.json).

Gemini 실측은 서버 런타임의 키 설정이 남았다. `.env.local`의 존재 여부/환경 변수 설정 여부만 확인했으며 내용을 열거나 출력하지 않았다. `.env*` 규칙으로 제외되고 Git에 추적되지 않는다. 채팅으로 받은 키는 명령·파일·문서에 복사하지 않았다.

사람이 서버 터미널에서 다음을 실행하면 키를 화면에 표시하지 않고 새 `.env.local`에 권한 0600으로 저장한다. 기존 파일은 덮어쓰지 않는다.

```sh
python3 /userHome/userhome4/sehoon/ai-verify/web/scripts/set-gemini-key.py
```

설정 뒤 `web/`에서 `PAIRSIGHT_LLM=gemini npm run court -- --json /tmp/pairsight-gemini-court.json`을 실행해 같은 사례의 시간·호출 수·판정을 표에 추가하면 된다. 429가 나면 재시도하지 말고 실패 상태를 그대로 보고한다. 실제 무료 RPM/TPM/RPD는 AI Studio의 프로젝트 화면에서 확인해야 하며 공개 문서 숫자를 추정하지 않았다. 공식 요금·데이터 사용 조건은 [Gemini 문서](gemini-provider.md)에 링크와 함께 기록했다.

튜닝을 실행하려면 사람이 이용 권한과 사실 라벨을 확인한 새 dev/holdout 자료를 확보하고, holdout inventory를 수동으로 봉인한다. 절차·사례 스키마·명령은 [사람 실험 지침](../tuning/program.md)을 따른다. 이미 공개된 SkyFinder validation을 새 비공개 holdout으로 재사용하지 않는다. 별도 실행 지시 전에는 루프를 돌리지 않는다.

## 커밋과 작업 폴더

- `220bc69` — Gemini 제공자·텍스트 경계·429 종료·보안 테스트.
- `1169bb3` — 기준값 JSON·튜닝 틀·안전 가드·테스트·생산 캐시 연결.
- 후속 문서 커밋 — 숨김 키 입력 도구, 최신 비교표, 공식 조건, 이 인수인계.

기존 사용자 미추적 파일 `replica/clone-screens/controlroom/ws-replay-*.png` 32장은 변경·삭제·커밋하지 않았다. 키와 실제 실험 결과를 자동으로 Git에 올리는 코드도 없다.
