# 인수인계: 같은 장소·다른 시점 사진의 편집 오판 방지

2026-10-19. 대상 저장소 `~/ai-verify`, 브랜치 `main`. 직전 기준 커밋 `a908d9f`.

작업 단위 커밋: `e259962`는 그림 fixture, `5a22963`은 판정 조건·측정·테스트·뮤테이션이다. 이 인수인계와 파이프라인 문서는 별도 문서 커밋으로 묶는다.

## 완료한 변경

- v3 신뢰 출처 편집 규칙과 v2 비교 경로에 공통 제외 조건을 추가했다. 영역 밖 잔차 ≤0.008, 전체 차이 영역 면적 합 ≤8%, 전체 영역 수 ≤2개를 모두 만족해야 비교 근거로 사용할 수 있다.
- 조건에 어긋난 후보는 중립 근거로 남긴다. 별도로 사용할 수 있는 비교 후보가 없으면 판단 불가이며 핵심 발견에 **“같은 장소의 다른 사진일 수 있어요”**를 표시한다. 원본 없음으로 숨기지 않는다.
- 영역 면적·개수는 화면에 표시하는 최대 8개로 자르기 전에 측정한다. 영역 밖 잔차는 모든 영역의 합집합 밖에서 측정한다. 측정 누락·잘못된 값·영역 밖 픽셀 없음은 통과시키지 않는다.
- `PIPELINE_VERSION=4`로 새 측정값이 없는 분석 캐시의 재사용을 막았다. 규칙 이름은 `v2.*`·`v3.*`를 유지한다. 이미 저장된 결과를 자동 재분석하지 않으므로 실행 중인 서버를 재시작하고 새 검사를 해야 한다.

## 재현 결과

고정된 거리에서 사람·차량 위치, 구름, 조명, 그림자가 다른 두 장면을 직접 그렸다. DINO 유사도 0.899364, 정렬 상관도 0.913919로 기존 관문은 통과한다. 그러나 영역 밖 잔차 0.03332470, 영역 수 3개로 새 조건을 넘기므로, 이른 날짜의 신뢰 출처를 붙여도 **판단 불가**가 된다. 영역 면적 합은 3.906%다.

기존 간판 변경·사람 추가 fixture는 잔차 0.00219745, 영역 면적 합 1.563%, 영역 수 1개로 **편집 조작을 유지**한다. 기존 `trusted_edited`도 통과한다. 11개 합성 원본 × JPEG 품질 4종의 재압축 대조군 44쌍의 최대 잔차는 0.00606937이었다.

검증 환경: Node 24.22.0, 저장소에 이미 설치된 의존성, 기존 DINO 가중치 캐시. 검증은 작업 복사본에서 했으며 원본 반영 시 파일 SHA-256을 대조했다.

- 전체 테스트 **193개 / 13개 파일 통과**.
- 타입 검사, 린트, Next.js 프로덕션 빌드 통과.
- 뮤테이션 **5종 모두 검출**. 정상 코드 실패 0개. 조건 전체 제거 시 13개, 잔차 조건 제거 2개, 면적 조건 제거 1개, 개수 조건 제거 2개, v2 모호성 검사 제거 4개의 테스트가 실패했다. 조건 전체 제거 시 실제 픽셀 반례도 실패했다.
- 기존 fixture 표 테스트의 제한 시간만 5초에서 30초로 늘렸다. 여러 이미지 모델 테스트가 동시에 실행될 때 관측된 시간 초과를 처리했으며 assertion은 그대로다.

## 이어서 볼 파일과 실행 명령

| 파일 | 내용 |
| --- | --- |
| `replica/verification-pipeline.md` §3-2, §5, §5-1 | 측정 정의, 기준값 근거, v2·v3 적용, 남은 한계 |
| `web/lib/verification/edit-locality.ts` | 공통 제외 조건과 실험 상한 |
| `web/lib/verification/image-comparison.ts` | 실제 픽셀 측정 |
| `web/lib/verdict.ts`, `web/lib/verification/engine.ts` | 판단 불가, 핵심 발견, 중립 근거, 날짜·팩트체크 경로 |
| `web/scripts/make-temporal-fixtures.py` | 새 장면 두 장을 재생성하는 결정적 Pillow 그림 코드 |
| `web/tests/fixtures/temporal/` | 두 PNG, `calibration.json`, `mutations.json` |
| `web/tests/edit-locality.test.ts` | 경계·누락값·v2·v3·실제 이미지·엔진 통합 회귀 테스트 |
| `web/scripts/measure-edit-locality.ts` | 재압축·편집·다른 시점 쌍 측정 |
| `web/scripts/check-edit-locality-mutations.mjs` | 임시 복사본에서 조건을 제거하는 뮤테이션 검사 |

```sh
cd ~/ai-verify/web
export PATH="$HOME/.local/node/bin:$PATH"
export PAIRSIGHT_MODEL_CACHE="$PWD/.cache/models"
python3 scripts/make-temporal-fixtures.py
node --import tsx scripts/measure-edit-locality.ts
npm test
npm run typecheck
npm run lint
npm run build
node scripts/check-edit-locality-mutations.mjs --json tests/fixtures/temporal/mutations.json
```

## 남은 한계와 다음 작업

**관문 0.76과 새 기준값 0.008 / 8% / 2개는 합성 그림으로 정한 초기값이며 실제 사진에서 다시 맞춰야 한다.** 이번 반례를 막았으며 같은 장소의 다른 사진 전체를 구분한다는 보장은 없다. 작은 국소 차이만 있는 다른 시점 사진은 통과할 수 있고, 큰 진짜 편집은 판단 불가로 빠질 수 있다.

다음은 사용 권한이 있는 실제 사진으로 JPEG 재압축, 같은 사진의 편집본, 같은 장소의 다른 시점 사진을 분리해 분포와 오판율을 측정하고 이 기준값을 보정하는 작업이다. 현재 PR·원격 push·서비스 배포는 수행하지 않았다. Supabase 및 외부 유료 서비스 연결 상태는 기존 인수인계를 따른다.
