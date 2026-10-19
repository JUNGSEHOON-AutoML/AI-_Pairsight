# 편집국 문서 하네스

사람이 고치는 업무 지침은 desks/의 6개 파일이다. 사건별 읽을 기록은 cases/<UUID>/01-접수.md부터 05-발행.md까지 마크다운으로 남긴다. 이 디렉터리와 briefings/는 비공개 실행 데이터이며 Git에 넣지 않는다. SQLite에는 상태, 보고서 경로에 대응하는 데스크 ID와 내용 해시만 인덱싱한다.

front-matter는 YAML의 JSON 부분집합 한 줄로 기록한다. version, caseId, desk, status(pass/hold/stopped), evidenceIds, nextDesk, durationMs, instructionHash, createdAt, author(llm/legacy/code-fallback)가 필수다. 실패한 데스크도 code-fallback 중단 문서를 남기며 LLM 보고서로 표시하지 않는다. 보호 파일 변경 시에는 변조 가능성이 있는 작성기·검사기를 다시 호출하지 않고 SQLite 중단 기록과 편집장 비상 현황으로 알린다. 본문은 접수 확인 / 작업 결과 / 자기 검증 / 인계 순서이며 비어 있으면 인계하지 않는다. LLM이 허용 사실 ID를 선택·배열하고, 코드는 원문 문장과 근거 ID로 마크다운을 조립한다. 인용·판정·날짜를 LLM이 새로 만들 수 없다. 이 제한을 보고서에서 밝힌다.

protected.json은 사람이 검토한 검사기·판정·법정·승인 코드와 안전 테스트의 SHA-256 기준이다. 실행 시작과 각 인계 전후에 비교하며 한 파일이라도 바뀌면 중단한다. 실행 중 manifest 자체 변경도 거부한다. 에이전트에는 파일/쉘 도구 권한을 주지 않는다. 해시 검사는 실행 도중 변경 감지이며, 파일시스템 관리자에 대한 보안 경계는 아니다. 승인된 개발 변경 뒤에는 사람의 코드 검토와 테스트를 거쳐 기준을 갱신해야 한다.
