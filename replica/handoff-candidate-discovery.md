# 인수인계: 후보 발견 경로 교체

날짜: 2026-10-20. 작업 worktree: `worktrees/ai-verify-cases`, 브랜치: `feature/case-newsroom-integration`.

## 결론

Fact Check 기사 후보 자동 연결과 본문 사진 비교를 구현했다. SerpApi 실행 코드는 제거했다. **Gemini 검색 URL 자동 수집은 공식 약관과 충돌하여 활성화하지 않았다.** 작동하지 않는 검색을 완성했다고 보고하거나, 다른 서비스의 요약으로 근거를 대신하지 않는다.

조건·보관·공식 출처: [candidate-discovery.md](candidate-discovery.md).
전체 비교표: [discovery-comparison.md](discovery-comparison.md), 기계 판독: [discovery-comparison.json](discovery-comparison.json).

## 구현

- `CandidateDiscoveryProvider`: 텍스트 주장 → 최대 5개 후보 URL. `FactCheckArticleDiscovery`는 기존 한국어 피드의 15분 캐시와 시간당 6회 예약 한도를 공유한다. 수동·피드 후보는 중복 제거 후 최대 5개.
- 피드로 접수한 사건은 기사 URL을 조사 후보에 자동 포함. 다른 사진 접수는 주장으로 피드를 검색. URL 검증 후 기사당 최대 6개 이미지를 기존 장면 관문·픽셀 비교에 전달.
- 팩트체크 평가·본문 발췌는 법정 근거에서 제외. 이미지 일치와 출처 URL·날짜 관측만 사용. 비교하지 못한 사진, 관련 없는 사진, 유포 사진이 지정되지 않은 기사 대표 사진의 자기 비교는 성공 근거로 집계하지 않는다.
- `GeminiSearchDiscovery`는 약관 제한을 반환하는 비활성 계약. 검색 API·썸네일 묘사·그라운딩 저장/표시 경로는 없다. 일일 사용 조회의 한도는 0. 이를 실제 검색이 가능한 무료 쿼터 제어로 오해하면 안 된다.
- 일반 방문자·운영자 이미지 모두 이번 후보 발견 경로에서 Gemini에 전송하지 않는다. 기존 법정/보고서 LLM의 텍스트 전용 경계 유지.
- `SerpApiDiscoveryProvider` 타입만 보존. 업로드 코드·키 입력 스크립트·선택 동의 UI 제거. 기존 DB의 SerpApi 캐시는 역사 자료로 보존되지만 읽거나 재사용하지 않는다.
- 후보가 없으면 조사 데스크 중단 → 수동 링크 보충 → 편집장 할 일. 판정 규칙, 기준값, 공방 권한, 사람 승인 규칙은 변경하지 않았다.

## 실제 측정 범위

- Gemini 키: 모델 정보 GET HTTP 200. 생성·그라운딩 호출 0. 키의 활성 무료 RPM/TPM/RPD와 계정 등급은 미확인이다. 공개 가격표 수치를 해당 프로젝트의 보장 한도로 쓰지 않았다.
- Fact Check: 실제 한국어 `네팔 홍수` 검색 성공, 후보 5개 반환. Provider 출력은 URL·제공자만.
- 실제 접수 3개: 후보 페이지 각 1개. AFP 두 URL은 robots 허용 여부 확인 실패, Ohmynews URL은 페이지 확인 성공이나 별도 유포 사진 미지정. 따라서 실제 사건의 사진 검증 통과 수/성공률은 미측정이다. 네팔 홍수 두 제보와 개표소 제보 하나이므로 독립적인 사건 3종의 평가도 아니다.
- 수동 대조는 같은 피드 URL을 지정했다. 동일 페이지를 다시 요청하거나 차단을 재시도하지 않았다. 두 경로의 독립적인 검색 성능 비교가 아니다.
- 합성 파일럿 4개: 두 경로 각각 후보 4개 중 3개 사진 일치, 다른 장면 1개 제외. 이 중 `no_source`는 공유 밑그림으로 정상 일치했다. 합성 그림을 실제 유포 사건이나 실제 사진 파일럿으로 이름 바꾸지 않았다.
- Gemini 행은 약관상 미실행으로 표시했으며 ‘검색 결과 0개’로 계산하지 않았다. 운영 사건의 저장 레코드 해시가 평가 전후 동일했다.

## 검증 및 실행

- 전체 회귀: 31개 파일, 317개 테스트 통과(`--maxWorkers=1`). 기존 장면·다른 시점·편집 국소성·뮤테이션 테스트 유지. 병렬 실행에서는 기존 이미지 비교 테스트 1개가 5초 제한을 넘겼고, 순차 실행으로 통과했다. 임계값·테스트 시간 제한은 변경하지 않았다.
- 브라우저 격리 검증: 통합 출처, 7구역·5보고서, 보고서 전달/편집장 이동, 방문자 필수 입력 2개, 익명 차단·소유자 한정 조회·로그아웃 권한 회수 통과. 390px 가로 넘침 없음, 브라우저/자산 오류 0. 상태 반영 691ms(이번 1회 관측). [결과](discovery-browser-check.json).
- 타입 검사·린트 통과. 실제 모델 캐시를 사용한 비교표 생성 완료.
- `.env.local` gitignore 확인. 저장된 키 문자열이 스테이징 변경에 없음을 값 출력 없이 검사했다.
- 프로덕션 빌드는 `npm run build -- --webpack`으로 통과했다. 기본 Turbopack은 이 실행 환경에서 내부 포트 생성이 EPERM으로 거부되어 실패했다. 기본 빌드 명령/소스 설정은 바꾸지 않았다. 브라우저 검증도 이 webpack 산출물을 사용한다.

프로젝트의 `web/`에서 재현:

```sh
PATH="$HOME/.local/node/bin:$PATH" PAIRSIGHT_MODEL_CACHE="$HOME/ai-verify/web/.cache/models" npm test -- --maxWorkers=1
PATH="$HOME/.local/node/bin:$PATH" PAIRSIGHT_MODEL_CACHE="$HOME/ai-verify/web/.cache/models" node --import tsx eval/newsroom/discovery-comparison.ts --live
# 이미 측정한 실제 페이지 결과를 재사용하고 파일럿만 다시 비교:
PATH="$HOME/.local/node/bin:$PATH" PAIRSIGHT_MODEL_CACHE="$HOME/ai-verify/web/.cache/models" node --import tsx eval/newsroom/discovery-comparison.ts --live --reuse-real
```

비교 스크립트는 법정·승인·발행·실제 사건 워커를 실행하지 않는다. 실제 DB는 읽기 전용이며 평가 Case는 메모리에만 생성한다. `--reuse-real`은 직전 JSON의 실제 사건 측정을 그대로 쓰므로 새 실측으로 해석하면 안 된다.

## 남은 조건

1. 요청한 Gemini 자동 검색을 켜려면 이 사용 방식에 대한 Google의 허용 근거나 다른 후보 발견 경로가 필요하다. API 키 추가나 검색 제안 표시만으로 현재 용도 제한이 해결되지 않는다.
2. 실제로 퍼진 사진을 명시적으로 지정한 독립 사건 3건과 접근 허용된 후보 페이지가 있어야 실제 비교 성능을 측정할 수 있다. 현재 평가는 그 요건을 충족하지 않는다.
3. 실제 무료 한도는 해당 프로젝트 AI Studio에서 확인해야 한다. 결제 설정은 변경하지 않았다.
4. 중단되거나 승인 대기 중인 기존 사건은 자동 재시도·자동 승인하지 않았다. 새 코드 적용이 필요한 사건은 운영자가 검토 후 재시도한다.

## 커밋

- `df08d3b`: 후보 발견 인터페이스·SerpApi 제거·약관 차단·팩트체크 사진 검증·테스트.
- 다음 작업 단위: 격리 비교 스크립트·측정 결과·인수인계. 로컬 커밋만, push 없음.

## 실행 위치

기존 통합 런처를 다시 시작했다. Pairsight는 `http://127.0.0.1:3002/newsroom`, 3D는 같은 앱의 `/controlroom/newsroom`으로 임베드한다. 별도 Claw3D 3460/어댑터 3461은 그대로이며 Claw3D 소스 변경은 없다. 운영자는 기존 계정으로 로그인한다. Codex 브라우저의 전달 포트는 재연결 시 바뀔 수 있다.
