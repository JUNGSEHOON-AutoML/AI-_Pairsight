# Gemini 법정 제공자 (2026-10-19)

`web/lib/llm/index.ts`의 `createLLMProvider()`가 `PAIRSIGHT_LLM=gemini|ollama|mock`을 읽는다. 미지정 기본값은 외부 전송 없는 `mock`. Ollama와 기존 모의 제공자는 유지한다. Gemini 기본 모델은 공식 요금표에서 무료 등급을 확인한 `gemini-3.8-flash`; `PAIRSIGHT_GEMINI_MODEL`로 지정할 수 있다. 모델 이름을 바꿔도 해당 프로젝트의 무료 이용 가능 여부는 따로 확인해야 한다.

## 키와 전송 경계

- 키는 서버의 `process.env.GEMINI_API_KEY`에서만 얻는다. 소스·명령 인자·쿼리 URL에 넣지 않는다. 요청의 `x-goog-api-key` 헤더만 사용하며 리다이렉트를 거부한다.
- `web/.gitignore`의 `.env*`가 `web/.env.local`을 제외하며, 파일은 Git 추적 대상이 아니다. 이번 서버에서 최초 환경 변수 존재 여부를 확인했을 때 파일이 없었다. 내용은 열어보지 않았다.
- Gemini REST 호출은 도구나 파일 업로드 없이 `parts: [{text: ...}]`만 만든다. 원본 이미지, 썸네일, 히트맵, 이미지 URL, 서명 URL, 페이지 발췌는 전송하지 않는다.
- 발신 직전에 사건 기록을 허용 목록으로 다시 구성한다. 카드 ID·종류·강도·200자 이내 요약·날짜·허용한 측정값, 검증된 공방 문장만 남긴다. 사용자 원문 주장과 판사 사유 원문도 제외한다. 텍스트 필드의 data/blob URI·긴 바이너리 문자열과 요청의 추가 멀티모달 필드는 호출 전에 거부한다.
- 오류 응답 본문은 읽거나 기록하지 않는다. 네트워크/파싱 오류의 원문과 cause도 전달하지 않는다. 모델 출력에는 실제 환경 변수 값과 알려진 키 형식 마스킹을 적용한다.

텍스트 최소화가 개인정보를 완전히 식별·제거한다는 보장은 아니다. 운영 시에는 카드 요약 자체에 민감한 정보가 들어가지 않는 편집 정책이 필요하다. 이번 벤치마크는 가상의 공개 fixture 요약만 사용한다.

## 호출과 실패

재판당 최대 6회(검사, 변호인, 배심원 3명, 서기) 순차 호출. `CourtRecord.llmCalls`에 실제 전송 시도 수를 남기며 실패한 429 호출도 포함한다. 키 누락·입력 차단처럼 전송 전 실패는 0회다.

429는 재시도·대기·다른 모델로 전환하지 않는다. 그 자리에서 재판을 종료한다. `reviewStatus=unavailable`, `failureCode=rate_limit`, 최종 판정 `inconclusive`, 표시 문구 **맥락·법정 확인 못 함**. 코드 판사의 기존 판정은 `judgeVerdict`에 별도로 보존한다. 네트워크·응답 오류도 Gemini 재판을 완료된 것으로 표시하지 않는다. 이미 판단 불가인 사건은 재판을 열지 않아 호출 0회다.

법정은 기존과 같이 CLI/후처리 모듈이다. 공개 대시보드의 기존 seed 사례가 이 설정만으로 실시간 재판으로 바뀌지는 않는다.

## 현재 공식 무료 등급 정보

2026-10-19 조회 기준:

- 한도는 프로젝트 단위이며 키 단위가 아니다. RPM(분당 요청), TPM(분당 입력 토큰), RPD(일일 요청)를 각각 적용하고, 하나라도 넘으면 제한 오류가 발생한다. RPD는 미국 태평양 시간 자정에 초기화된다. 공개 문서는 모든 무료 프로젝트에 적용되는 고정 숫자를 제공하지 않는다. 해당 프로젝트의 실제 숫자는 AI Studio에서 확인해야 하며 가용 용량도 보장되지 않는다. [공식 rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- `gemini-3.8-flash` Standard 요금표의 무료 등급은 입력·출력 무료이고 제품 개선 사용은 Yes다. 무료 제공량 이후 유료 모델로 자동 전환하는 코드는 넣지 않았다. API 키만으로 프로젝트의 결제 등급을 인증할 수는 없으므로 이 코드가 무료 요금제를 강제하는 것은 아니다. [공식 pricing](https://ai.google.dev/gemini-api/docs/pricing)
- 무료 서비스의 입력·출력은 제품·기술 개선에 사용될 수 있고 사람이 검토할 수 있다. 민감·기밀·개인정보를 제출하지 말라고 명시한다. EEA·영국·스위스에 제공하는 API 클라이언트에는 유료 서비스 조건이 적용된다. 현재 약관은 18세 이상 및 전문/사업 목적 개발 용도를 명시한다. [공식 약관](https://ai.google.dev/gemini-api/terms)
- REST 구조화 출력에는 `responseMimeType: application/json`과 `responseJsonSchema`를 사용한다. [공식 구조화 출력 문서](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)

프로젝트별 실제 무료 RPM/TPM/RPD와 결제 상태는 이번 작업에서 확인되지 않았다. 추정 숫자를 설정값이나 보고서에 넣지 않았다.

## 재현

Node 24 기준, `web/`에서 실행한다. 비밀 값은 명령에 넣지 않는다. `npm run court`는 Node 런타임의 환경 파일 로더를 사용한다.

키 파일이 없는 경우 사람이 터미널에서 `python3 scripts/set-gemini-key.py`를 실행해 숨김 입력할 수 있다. 파일 권한 0600으로 생성하거나 기존 파일 끝에 설정을 추가하며, 기존 `.env.local`을 읽지 않는다. 환경 파일 로더는 마지막 GEMINI_API_KEY 설정을 사용한다. 비대화형 실행은 거부한다. 채팅에 보낸 키를 도구 호출 인자로 복사하지 않는다.

```sh
PAIRSIGHT_LLM=mock npm run court
PAIRSIGHT_LLM=gemini npm run court -- --json /tmp/pairsight-gemini-court.json
PAIRSIGHT_LLM=ollama npm run court -- --model qwen2.5:7b --url http://127.0.0.1:11500 --threads 8
```

실측 비교와 미측정 사유는 `replica/llm-benchmark-2026-10-19.md`에 기록한다.
