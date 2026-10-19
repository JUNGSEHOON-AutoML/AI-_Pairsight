# 실제 사진 비교 보정 실험

이 디렉터리는 이미지 비교 관문과 v3 편집 판정의 제한된 평가다. 후보 발견·기사 fetch·촬영 출처 검증이나 기사 주장의 진위 정확도를 측정하지 않는다. 사진의 권리·출처와 변경 내역은 [ATTRIBUTION.md](ATTRIBUTION.md), 개별 파일 해시는 `sources.json`을 따른다.

## 사전에 고정한 구성

`protocol.json`은 모델 결과를 보기 전에 작성했다. 공개 SkyFinder 카메라 ZIP 중 용량이 작은 12개를 택했다. 각 카메라에서 서로 다른 날짜 3개를 선택하고, 카메라 ID의 고정 해시 순서로 보정 6대 / 검증 6대를 나눴다. 같은 사진의 날짜별 프레임과 모든 파생본은 같은 분할에만 있다.

선택은 날짜순·밝기·대비 기준만 사용한다. 밝기 기준이 주간 촬영을 보장하지는 않으며 야간·안개·렌즈 물방울이 있는 사진도 남는다. 디코딩할 수 없는 손상 파일은 별도로 기록하고 제외한다. 검출 결과가 나쁘다는 이유로 사진을 바꾸지 않는다. 소규모이며 작은 ZIP을 골랐으므로 대표 표본이 아니다.

각 분할은 18장으로 **192쌍**을 만든다.

| 종류 | 분할당 수 | 정답 근거 |
| --- | ---: | --- |
| JPEG 재압축 | 72 | 18장 × 품질 40·60·80·90. 내용 변경 없음 |
| 국소 편집 | 54 | 18장 × 불투명 패치·copy-move·패치 두 개. 코드로 편집 과정이 알려진 양성 대조군 |
| 같은 장소·다른 시점 | 36 | 카메라별 3개 날짜의 모든 쌍, 양방향. 날짜는 원본 아카이브 파일명 기준이며 시간대는 미제공 |
| 다른 카메라 | 30 | 카메라별 첫 사진을 다른 카메라의 첫 사진과 양방향 비교 |

편집본은 실제 사진 위의 **통제된 픽셀 편집**이다. 실제로 유포된 가짜 뉴스 수집물이 아니며 악의나 유포 맥락을 평가하지 않는다. 원자료의 비편집 라벨은 자료 제공자의 촬영 자료 설명과 사진 검토를 따른다. C2PA 등 센서 원본 인증은 없다.

## 오탐·미탐 정의

- **편집 오탐:** 비편집 쌍을 `edited`로 판정한 수 / 비편집 쌍 수. 재압축·다른 시점·다른 카메라를 따로 집계한다.
- **편집 미탐:** 편집 쌍 중 `edited`를 내지 못한 수 / 편집 쌍 수. 판단 불가도 빠짐없이 미탐에 포함한다.
- **재압축 동일 사진 수용:** JPEG 쌍이 픽셀·장면·잔차 조건을 통과하고 영역 0개, 변화율 <2%인 비율. 낮아지면 보수적으로 모두 거절한 비용이 드러난다.
- **다른 시점의 동일 사진 오수용:** 시간상 별개 촬영 쌍에 위 ‘같은 사진’ 조건이 성립한 수. 편집 오탐 0과 별개로 보고한다.
- 픽셀 정렬 통과, 장면 제외, 잔차·면적·개수 제외 수도 남겨 어느 단계에서 놓쳤는지 확인한다.

같은 카메라/사진의 파생 쌍은 상관되어 있으므로 수백 쌍을 수백 개 독립 표본처럼 해석하지 않는다. 집계는 이 표본의 관측치이며 서비스 전체 정확도나 모집단 오류율이 아니다.

## 실제 코드 사용 범위

실제 `LocalImageComparisonProvider`와 고정된 DINOv2-small 모델로 픽셀 수치를 측정한다. 그 뒤 실제 `decideVerdict`에 프로필을 전달한다. 평가에서만 `evaluation.example.test`의 신뢰 출처와 이른 게시일을 **통제 변수로 가정**한다. 실제 SkyFinder 사진에 검증된 신뢰 출처·게시일이 있다고 꾸미거나 운영 신뢰 목록에 넣지 않는다.

v2에는 유효한 편집 출처 기록을 만들어 넣지 않는다. 별도 출처 증거가 없는 이 표본에서는 판단 불가가 정상이며 v2의 결론율은 따로 보고한다. 이전 v2 C2PA mock 경로 반례는 기존 단위 테스트와 뮤테이션 검사로 유지한다.

## 보정·검증 분리

`calibrate`는 보정 분할만 읽는다. 사전 격자에서 비편집 오탐 0과 합성 대조군 보존을 만족하는 후보를 고른다. 편집 검출 수, 재압축 수용 수, 다른 시점 오수용 수 순으로 비교하며 동률 처리도 `protocol.json`에 명시했다. 기존 회귀 테스트가 통과한 뒤 `freeze`로 프로필과 보정 데이터 해시를 고정한다. 검증 측정은 이 파일 없이는 실행할 수 없다.

검증 결과가 생기거나 프로필을 고정한 뒤에는 같은 디렉터리의 재보정을 금지한다. 새 연구에서 기준을 바꾸려면 새로운 검증 카메라가 필요하다. 아래 재현은 동일 실험의 확인이며 새 독립 검증이 아니다.

## 재현

Node LTS, 저장소 의존성, 기존 DINO 모델 캐시가 필요하다. `web/`에서 실행한다.

```sh
# 저장된 측정치로 실제 판정 규칙을 다시 실행해 보고서 JSON 집계
node --import tsx eval/real-photos/runner.ts report
# 해시·출처·분할·고정 프로필 및 실제 픽셀 재측정 회귀 테스트
npx vitest run tests/real-photo-evaluation.test.ts tests/edit-locality.test.ts tests/scene-gate.test.ts
```

전체 384쌍을 보존된 결과와 분리하여 재측정하려면:

```sh
mkdir -p .data/real-photo-reproduction
cp -r eval/real-photos/images eval/real-photos/sources.json eval/real-photos/protocol.json .data/real-photo-reproduction/
export PAIRSIGHT_REAL_PHOTO_EVAL_DIR=.data/real-photo-reproduction
node --import tsx eval/real-photos/runner.ts measure calibration
node --import tsx eval/real-photos/runner.ts calibrate
node --import tsx eval/real-photos/runner.ts freeze
node --import tsx eval/real-photos/runner.ts measure validation
node --import tsx eval/real-photos/runner.ts report
```

이미지는 커밋에 있으므로 보통 네트워크가 필요 없다. 재수집이 필요한 경우에만 `python3 scripts/prepare-real-photos.py`를 실행한다(Pillow 필요). 사이트 정책·체크섬이 바뀌면 중단하며 우회하지 않는다. ZIP과 원본 해상도 사진은 메모리에서만 처리하고, 저장은 최대 512px 파생 이미지와 메타데이터로 한정한다.
