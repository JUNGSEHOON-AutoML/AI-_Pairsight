> 2026-10-20 갱신: SerpApi 실행 코드는 제거하고 Provider 타입만 남겼습니다. 아래 SerpApi 안내는 이전 구현 기록입니다. 현재 후보 경로와 Gemini 약관 제한은 [candidate-discovery.md](candidate-discovery.md)를 따릅니다.

# 편집국 5개 데스크 인수인계 — 2026-10-20

## 실행·화면

Pairsight worktree: `worktrees/ai-verify-cases` / `feature/case-newsroom-integration`.
Claw3D worktree: `worktrees/claw3d-cases` / `feature/case-department-view`.
기존 원본 checkout과 3000 서버는 변경하지 않는다. 커밋은 로컬에만 남기며 push하지 않는다.

- 운영자: http://127.0.0.1:3002/newsroom (기존 운영자 계정)
- 방문자: http://127.0.0.1:3002/check
- 승인된 공개 사례: http://127.0.0.1:3002/cases
- 3D는 같은 화면의 /controlroom/newsroom 프록시로 표시. 별도 Claw3D는 3460, 읽기 전용 어댑터는 3461.
- CPU 전용 개인 Ollama: 127.0.0.1:11500, 기존 ~/.ollama-pairsight 모델 사용. 공용 Ollama·GPU 작업 변경 없음.

web에서 실행:

```sh
PATH="$HOME/.local/node/bin:$PATH" \
CLAW3D_DIR="$HOME/Documents/Codex/2026-10-19/my-app-playwright-mcp-node-v16/worktrees/claw3d-cases" \
PAIRSIGHT_LLM=ollama \
PAIRSIGHT_MODEL_CACHE="$HOME/ai-verify/web/.cache/models" \
node --env-file-if-exists="$HOME/ai-verify/web/.env.local" scripts/newsroom-start.mjs
```

런처는 로컬 Ollama가 없으면 기존 설치 바이너리로 CPU 전용 개인 인스턴스를 함께 시작한다. 이미 실행 중인 개인 인스턴스는 건드리지 않는다. PAIRSIGHT_MANAGE_OLLAMA=0이면 자동 시작하지 않는다. 수동 실행이 필요하면:

```sh
CUDA_VISIBLE_DEVICES=-1 OLLAMA_HOST=127.0.0.1:11500 \
OLLAMA_MODELS="$HOME/.ollama-pairsight" OLLAMA_NUM_PARALLEL=1 ollama serve
```

보고서 전용 기본 모델은 qwen2.5:1.5b; PAIRSIGHT_REPORT_MODEL로 변경. 판정 규칙·법정 모델 선택·배심원 하향 제한·사람 승인 규칙은 유지한다.

## 구현

1. newsroom/desks에 사람용 지침 6개. JSON 부분집합 front-matter와 필수 4개 본문 섹션 검사. protected.json으로 검사기·판정·법정·승인·안전 테스트·기준값 보호.
2. 기존 9개 코드 작업을 5개 데스크로 묶었다. 성공한 코드 뒤 LLM이 허용 사실 ID를 구성하고 검증된 문장으로 보고서를 만든다. 실패·형식 오류는 인계 중단, 재시도 시 성공한 코드 작업 반복 없음. 중단 문서에는 code-fallback 작성 방식을 표시.
3. newsroom/cases/<id>/01-접수.md … 05-발행.md가 사람이 읽는 기록의 기준. SQLite는 기존 코드와 호환되는 구조화 근거·승인 상태 및 보고서 해시 인덱스를 유지하며 마크다운 본문을 중복 저장하지 않는다. 비공개 문서 디렉터리는 Git 제외, 파일 권한 0600.
4. 기존 사건은 legacy 문서로 이관하며 재판 재실행·승인 변경·가짜 LLM 이력·과거 애니메이션을 만들지 않는다. 중단·완료·승인 대기·반려·철회 시 사건 브리핑, 한국 시간 하루 1회 일일 브리핑. 워커가 꺼진 날은 소급 작성하지 않는다. LLM 장애 때 코드 비상 현황으로 할 일을 표시한다.
5. 운영자 첫 화면은 왼쪽 요약 3줄·할 일·사건 목록, 오른쪽 3D. 상세는 문서 5개와 검토 옆 승인. 9개 탭·JSON 제거. 방문자는 사진/URL + 질문 2개 필수, 브라우저 소유권 쿠키로 비공개 접수 보호, 승인 후 결론·근거 3개·접힌 공방.
6. Claw3D 빌더 OfficeMap 기반 7개 구역. 같은 템플릿을 정식 빌더의 /office/builder/pairsight에서 열 수 있다. 운영용 서버는 빌더와 모든 수정 API를 차단한다. 보고서 완료 → 직원이 편집장실로 문서 전달, 브리핑 완료 → 편집장이 운영자 자리로 전달. 첫 연결·재연결·중복 스냅샷·코드만 끝난 단계는 전달 애니메이션 없음.
7. SerpApi 무료 전용 Google Lens Provider. 무료 플랜 확인, 최근 31일 250회/시간당 50회 SQLite 예약 카운터, 1시간 캐시, 429 즉시 수동 후보 요청. 후보만 발견하고 페이지 검증은 기존 robots·SSRF·접근 제한 정책 유지.

## 검증

- Pairsight 전체: 30개 파일, 316개 테스트 통과. 기존 실제 사진·편집·다른 시점 반례 테스트 유지.
- Claw3D 관련: 6개 통과. 양쪽 프로덕션 빌드·타입 검사 통과. Pairsight 전체 린트 및 Claw3D 변경 파일 린트 통과.
- 실제 로컬 Ollama 보고서: 실제 사건을 읽기만 하여 34,017ms에 형식 검사 통과. 원본 사건 수정·승인 없음. 성능 평균이나 정확도 벤치마크를 뜻하지 않는다.
- 통합 브라우저: 임시 DB 복사본·별도 계정·별도 서버 사용. 동일 출처 3D, 문서 전달 두 종류, 실제 픽셀 움직임, 보고서 5개, 승인 옆 배치, 방문자 필수 입력 2개, 비소유자 404, 익명 운영 API 차단, 세션 철회, fixture 숨김, 390px 넘침 없음. 결과와 캡처: replica/clone-screens/five-desks/.
- 빌드와 테스트가 겹친 실행에서 기존 이미지 비교 한 건이 5초 시간 초과. 빌드 완료 후 전체를 다시 실행하여 316개 모두 통과. 기준값이나 테스트 제한 시간을 바꾸지 않았다.

실행 서버 확인에서 개인 Ollama가 종료되어 편집장 브리핑이 코드 비상 현황으로 저장되는 문제를 발견했다. 런처가 개인 CPU Ollama를 함께 관리하도록 보정했다. 비상 보고서는 삭제하지 않고 파일을 유지하며, 사람이 요청하는 재작성은 같은 사건 상태/일일 인덱스의 새 문서로 갱신한다. 자동 하루 한 번 규칙은 그대로다. 수동 복구 명령:

```sh
PAIRSIGHT_LLM=ollama node --env-file-if-exists="$HOME/ai-verify/web/.env.local" --import tsx scripts/newsroom-briefing.ts --retry
```

실행 서버 최종 확인: 실제 사건 4건은 중단 3건·사람 승인 대기 1건, 승인 0건으로 보존됐다. legacy 마크다운 보고서 10개를 이관했다. 사건 브리핑 4개와 일일 브리핑 1개가 실제 LLM으로 완료됐으며 최종 비상 fallback 문서는 0개다. 이는 기록 생성 검증이며 사건의 진위·게재 승인을 새로 확정한 것이 아니다. 정상 완료 뒤 워커는 새로운 사건·상태 변경 또는 다음 날짜를 기다린다.

## 남은 설정과 한계

SERPAPI_API_KEY 미설정: 실서비스 인증·실제 검색 결과 연결 확인은 수행하지 못했다. 키 값은 읽어 출력하지 않았고 .env.local의 Git 제외를 확인했다. 운영자는 아래 명령으로 화면에 보이지 않게 입력할 수 있다. 키를 채팅에 보내지 않는다.

```sh
python3 "$HOME/Documents/Codex/2026-10-19/my-app-playwright-mcp-node-v16/worktrees/ai-verify-cases/web/scripts/set-serpapi-key.py" "$HOME/ai-verify/web/.env.local"
```

키 설정 후 런처를 재시작해야 실행 중 프로세스에 반영된다. 무료 계정이 확인되지 않으면 유료 검색을 하지 않고 수동 후보 링크를 요청한다. 카드 입력의 외부 썸네일 검색은 선택 동의다. localhost 공개 주소 없이 SerpApi Image API의 임시 image_id를 사용할 수 있으며, 10분 ID 만료는 즉시 삭제 보장이 아니다. 검색 자료 31일 보관 조건과 공식 출처는 replica/serpapi-lens.md 참고.

개인정보·이미지 권리·인용 원문의 동일성은 여전히 사람 검토가 필요하다. 기사 대표 이미지의 주장 동일성이 확인되지 않으면 기존처럼 판단 불가. robots/봇 차단으로 멈춘 기존 사건은 자동 우회·재개하지 않는다. 저장 사진은 썸네일이며 실제 원본 전체에 대한 정확도를 보장하지 않는다. 실제 사용자 사건의 승인은 이번 검증에서 수행하지 않는다.

## 작업 단위 커밋

- Pairsight 5efd8d9: 6개 지침·형식 검사기·보호 해시
- Pairsight 937709e: 데스크 처리·LLM 보고서·편집장 브리핑
- Pairsight 61add40: 운영 UI·방문자 접수·개인 조회 경계
- Pairsight 18f05f5: 5개 데스크·편집장 이벤트 투영
- Pairsight dcc8a22: 무료 SerpApi·한도·수동 대안
- Claw3D 0e6a3aa: 7개 구역·문서 전달 동작
- Pairsight c903eed: 중단 문서·간결한 할 일·기존 기록 이관 보정
- Pairsight 5036c7e: 통합 브라우저 검증·인수인계
- Claw3D a0255dc: 동일 배치의 실제 빌더 입력 화면
- 이후 개인 LLM 수명 관리 보정은 최신 git log 참고.
