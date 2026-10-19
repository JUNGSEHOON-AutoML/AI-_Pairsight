# 후보 경로 비교 — 2026-10-20

| 측정 묶음 | 수동 후보 | 팩트체크 기사 | Gemini 검색 |
|---|---|---|---|
| 기존 실제 접수 3건 | 후보 3개, 페이지 1개 접근, 사진 검증 미측정 | 같은 URL 3개, 동일한 접근 결과 | 약관상 미실행 |
| 합성 파일럿 4개 | 후보 4개 중 사진 일치 3개 | 후보 4개 중 사진 일치 3개 | 약관상 미실행 |

실제 접수의 `robots_unavailable`은 접근 허용 여부 미확인, `circulated_photo_not_selected`는 유포 사진 미지정입니다. 합성 파일럿의 일치는 진위 판정을 뜻하지 않습니다. 공유 밑그림 사례도 포함되므로 이 수치를 실제 사진 정확도로 해석하면 안 됩니다.

- 수동 대조 경로는 기존 피드 URL을 지정했습니다. 독립적인 검색 성능·재현율 측정이 아닙니다.
- 실제 접수 3건 중 2건은 같은 네팔 홍수 주장입니다. 독립 사건 3개를 대표하지 않습니다.
- 실제 접수에 비교할 유포 사진이 별도로 지정되지 않았습니다. 미측정은 불일치 0건과 다릅니다.
- 파일럿은 기존 합성 그림을 사용한 테스트입니다. 실제 유포 사례가 아니며 대시보드에 넣지 않습니다.
- no_source fixture는 다른 fixture와 같은 밑그림을 공유합니다. 그 사진의 일치는 검색 미발견 시나리오와 구분합니다.
- 이 보고서는 고해상도 원본·HTML·Gemini 응답·외부 기관의 판정 문구를 저장하지 않습니다.

| 사건 | 자료 | 후보 경로 | 후보 | 페이지 확인 | 사진 일치 | 검증 통과 | 상태 |
|---|---|---|---:|---:|---:|---:|---|
| b60efdd2 | real | manual-known-feed-url | 1 | 0 | 미측정 | 미측정 | robots_unavailable |
| b60efdd2 | real | factcheck-import | 1 | 0 | 미측정 | 미측정 | robots_unavailable |
| b60efdd2 | real | gemini | 미측정 | 0 | 미측정 | 미측정 | terms_blocked |
| de10fc57 | real | manual-known-feed-url | 1 | 1 | 0 | 미측정 | circulated_photo_not_selected |
| de10fc57 | real | factcheck-import | 1 | 1 | 0 | 미측정 | circulated_photo_not_selected |
| de10fc57 | real | gemini | 미측정 | 0 | 미측정 | 미측정 | terms_blocked |
| f4b06e55 | real | manual-known-feed-url | 1 | 0 | 미측정 | 미측정 | robots_unavailable |
| f4b06e55 | real | factcheck-import | 1 | 0 | 미측정 | 미측정 | robots_unavailable |
| f4b06e55 | real | gemini | 미측정 | 0 | 미측정 | 미측정 | terms_blocked |
| fx-trusted-edited | synthetic-pilot | manual | 1 | 1 | 1 | 1 | compared |
| fx-trusted-edited | synthetic-pilot | factcheck-mock-article | 1 | 1 | 1 | 1 | compared |
| fx-trusted-edited | synthetic-pilot | gemini | 미측정 | 0 | 미측정 | 미측정 | terms_blocked |
| fx-context-factcheck | synthetic-pilot | manual | 1 | 1 | 1 | 1 | compared |
| fx-context-factcheck | synthetic-pilot | factcheck-mock-article | 1 | 1 | 1 | 1 | compared |
| fx-context-factcheck | synthetic-pilot | gemini | 미측정 | 0 | 미측정 | 미측정 | terms_blocked |
| fx-no-source-shared-art | synthetic-pilot | manual | 1 | 1 | 1 | 1 | compared |
| fx-no-source-shared-art | synthetic-pilot | factcheck-mock-article | 1 | 1 | 1 | 1 | compared |
| fx-no-source-shared-art | synthetic-pilot | gemini | 미측정 | 0 | 미측정 | 미측정 | terms_blocked |
| fx-different-scene | synthetic-pilot | manual | 1 | 1 | 0 | 0 | compared |
| fx-different-scene | synthetic-pilot | factcheck-mock-article | 1 | 1 | 0 | 0 | compared |
| fx-different-scene | synthetic-pilot | gemini | 미측정 | 0 | 미측정 | 미측정 | terms_blocked |

실제 사건에 비교할 유포 사진을 지정하고 허용되는 후보 페이지를 제공해야 실제 진위 검증 통과율을 측정할 수 있습니다. 이 표는 검증 정확도를 주장하지 않습니다. Gemini는 약관상 미실행이므로 후보 0개로 평가하지 않았습니다.
