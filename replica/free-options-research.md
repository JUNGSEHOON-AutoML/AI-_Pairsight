# 무료 경로 조사 (2026-10-19)

이 문서는 조사 결과만 담습니다. 코드는 바꾸지 않았습니다.
- 측정값은 이 서버(Intel i9-10980XE, Ubuntu 20.04, glibc 2.31, Node 24)에서 직접 잰 값입니다.
- "확인 못 함"은 공개 문서에서 답을 찾지 못했다는 뜻입니다.

## 요약

| 항목 | 결론 | 바로 쓸 수 있나 |
| --- | --- | --- |
| SerpApi Google Lens | 무료 플랜 월 250회, 시간당 50회. Lens 엔진이 무료 플랜에서 막혀 있다는 문구는 없음. 상업 이용은 약관에 명시적 금지 없음, 단 재판매·재가공 금지 조항 있음 | 파일럿 후보 찾기에는 가능. 서비스용으로는 한도가 너무 작음 |
| Google Fact Check Tools API | 이미지로 찾는 `claims:imageSearch`가 **있음**. 키는 필수. 결제 계정이 필요한지는 공개 문서에 없음 | 키를 직접 만들어 확인해야 함(5분) |
| C2PA 검증 (Node) | `@contentauth/c2pa-node` 0.9.10, MIT. **이 서버에서는 실행 안 됨**(glibc 2.32 이상 필요). c2patool CLI도 같은 문제 | 서버 OS를 Ubuntu 22.04 이상으로 올려야 함 |
| 이미지 임베딩 (CPU) | CLIP B/32 이미지 1장 31–121 ms. 단 OpenAI CLIP 가중치는 "배포 용도는 범위 밖"으로 명시됨. DINOv2(Apache-2.0)·SigLIP(Apache-2.0)·LAION CLIP(MIT)은 라이선스상 문제없음 | 가능. 후보 찾기 보조로만 |

## 1. SerpApi 무료 플랜 (Google Lens / 역이미지)

- **한도:** 무료 플랜은 월 250회, 시간당 50회입니다([요금표](https://serpapi.com/pricing)). 제3자 블로그에 나오는 "월 100회"는 예전 값으로 보입니다.
- **Google Lens 엔진:** `engine=google_lens`, `url`(공개 이미지 주소)을 받습니다([문서](https://serpapi.com/google-lens-api)).
  - 주소 대신 Image API로 올린 이미지의 `image_id`를 쓸 수도 있습니다.
  - `type`으로 `all`, `exact_matches`, `visual_matches`를 고릅니다. 출처 찾기에는 `exact_matches`가 맞습니다.
  - 요금표에 엔진별 제한은 없지만, 무료 플랜에서 Lens가 되는지는 **실제 키로 한 번 호출해 봐야 확정**됩니다.
- **약관([legal](https://serpapi.com/legal)):**
  - 무료 플랜의 상업 이용을 따로 금지하는 문구는 없습니다.
  - 다만 2조가 "서비스의 어떤 부분도 서면 허락 없이 복제·판매·재판매·이용(exploit)하지 말 것"을 요구합니다. 검색 결과를 우리 서비스 화면에 그대로 보여주는 것이 여기에 걸리는지는 해석의 문제입니다. **유료 전환 전에 서면으로 문의할 것.**
  - 13조의 미국 법적 보호(Legal Shield)는 Free·Starter·Developer 플랜에는 적용되지 않습니다.
  - 검색 데이터는 SerpApi 쪽에 31일 보관됩니다(ZeroTrace 모드 제외). 사용자 업로드를 넘기려면 공개 URL이 필요하므로, 임시 공개 URL과 개인정보 안내가 필요합니다.
  - SerpApi는 구글 결과를 대신 긁어오는 서비스입니다. 구글 약관과의 관계는 SerpApi가 책임지는 구조이고, 무료 플랜에는 그 보호가 없습니다.
- **판단:** 파일럿 30건의 후보를 찾는 데는 한도가 충분합니다(30회). 수동 후보를 찾는 수고를 줄일 수 있습니다. 서비스 상시 사용에는 월 250회가 너무 작고, 약관도 확인이 필요합니다.
- **제안:** 파일럿에서만 `SerpApiLensReverseSearch`를 키가 있을 때만 켜는 선택지로 만듭니다. Vision 어댑터와 같은 방식입니다.

## 2. Google Fact Check Tools API

- **엔드포인트:** `claims:search`(텍스트)와 **`claims:imageSearch`(이미지)** 두 가지가 있습니다([REST 참조](https://developers.google.com/fact-check/tools/api/reference/rest)).
  - imageSearch는 `imageUri`가 **공개 http(s) 주소**여야 합니다([imageSearch](https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/imageSearch)).
  - 문서에 "외부 호스팅 이미지는 차단·스로틀될 수 있으니 운영에서 의존하지 말라"는 경고가 있습니다.
- **키 없이:** 키 없이 호출하면 403 "unregistered callers"가 납니다. 이 서버에서 직접 확인했습니다.
- **결제 계정:** 개발자 문서와 API 키 문서 어디에도 결제 계정이 필요하다는 말이 없습니다. 할당량 숫자도 공개 문서에 없습니다. **확인 못 함.**
- **확인 방법(사용자가 직접):**
  1. Google Cloud 콘솔에서 결제 없이 새 프로젝트를 만듭니다.
  2. "Fact Check Tools API"를 사용 설정하고 API 키를 만듭니다.
  3. 아래 명령을 실행합니다. 200이 나오면 결제 없이 쓸 수 있는 것입니다.

     ```
     curl "https://factchecktools.googleapis.com/v1alpha1/claims:search?query=test&key=$KEY"
     ```

  4. 할당량은 콘솔의 IAM 및 관리자 > 할당량에서 봅니다.
- **우리 앱과의 관계:** 이미 `FactCheckProvider`와 `temporaryImages`(임시 공개 URL)가 있으므로 imageSearch 어댑터를 붙이기 쉽습니다. 결과는 "팩트체크 기사"로만 쓰고, 이미지 비교는 기존 단계 그대로 거칩니다.

## 3. C2PA 오픈소스 검증 (Node 서버)

- **`@contentauth/c2pa-node` 0.9.10, MIT.**
  - Rust 라이브러리 c2pa-rs를 감싼 네이티브 모듈입니다. c2pa-rs는 MIT/Apache-2.0 이중 라이선스입니다.
  - 저장소 `c2pa-node-v2`는 보관(archived) 처리됐고, 개발은 `contentauth/c2pa-js` 모노레포의 `packages/c2pa-node`로 옮겨졌습니다([저장소](https://github.com/contentauth/c2pa-node-v2)).
  - 사용법: `Reader.fromAsset({ path })` → `reader.json()` / `reader.getActive()`. 서명 검증과 신뢰 목록 검사는 설정 객체로 켭니다.
  - Linux x64/arm64, macOS, Windows용 미리 빌드한 바이너리가 있고, Node 22 이상이 필요합니다.
- **이 서버에서 실측:** 설치는 되지만 불러올 때 `GLIBC_2.32 not found`로 실패합니다. 이 서버는 Ubuntu 20.04, glibc 2.31입니다.
  - c2patool v0.27.22 Linux 바이너리도 glibc 2.32–2.34가 필요해 실행되지 않았습니다.
  - 해결책:
    - (a) 배포 서버를 Ubuntu 22.04 이상(또는 Debian 12 기반 컨테이너)으로 합니다. 가장 간단합니다.
    - (b) Rust로 직접 빌드합니다.
    - (c) WASM 빌드를 씁니다(c2pa-js). Node에서 쓸 수 있는지는 미확인입니다.
- **판정에서의 위치:** C2PA는 "진짜 확인"의 유일한 강한 근거입니다(평가 README에 쓴 대로). 서명이 유효하고 신뢰 목록에 있는 서명자일 때만 강한 근거로 둡니다. 서명이 없으면 "기록 없음"이지 가짜 근거가 아닙니다. 이 원칙은 지금 화면 문구와 같습니다.

## 4. 공개 이미지 임베딩 모델 (CPU)

**측정:** Transformers.js 3.8.1과 onnxruntime-node 1.21.0(CPU)을 썼습니다. 이미지 1장의 전처리와 임베딩을 포함하고, 예열 2회를 뺀 중앙값입니다.

| 모델 | 정밀도 | 스레드 | 1장 | 메모리(RSS) | 로드 | 가중치 라이선스 |
| --- | --- | --- | --- | --- | --- | --- |
| CLIP ViT-B/32 (OpenAI) | fp32 | 기본(36코어) | 44 ms | 922 MB | 0.9–11 s | 모델 카드: 연구용, "배포 용도는 상업이든 아니든 범위 밖" |
| 〃 | q8 | 기본 | 31 ms | 387 MB | | 〃 |
| 〃 | fp32 | 2 | 76 ms | 931 MB | | 〃 |
| 〃 | q8 | 2 | 47 ms | 397 MB | | 〃 |
| 〃 | fp32 | 1 | 121 ms | 942 MB | | 〃 |
| DINOv2-small (Meta) | fp32 | 2 | 110 ms | 346 MB | | Apache-2.0 |
| 〃 | q8 | 2 | 73 ms | 217 MB | | Apache-2.0 |
| SigLIP base 16/224 (Google) | q8 | 2 | 133 ms | 469 MB | | Apache-2.0 |
| LAION CLIP ViT-B/32 (OpenCLIP) | (측정 안 함) | | B/32와 비슷할 것 | | | MIT |

**라이선스**
- Transformers.js는 Apache-2.0, onnxruntime-node는 MIT입니다.
- OpenAI CLIP은 코드가 MIT입니다. 하지만 모델 카드가 배포를 범위 밖으로 둡니다([모델 카드](https://huggingface.co/openai/clip-vit-base-patch32)). 그래서 **서비스에는 DINOv2나 SigLIP, LAION CLIP을 권합니다.**

**용도**
- 임베딩은 "비슷한 장면"을 찾습니다. pHash보다 잘라내기, 색보정, 재압축에 강해서, 색인 후보를 넓히는 데 쓸 수 있습니다.
- 반대로 같은 장소에서 찍은 다른 사진도 가깝게 나옵니다. 그래서 **판정 근거로 쓰지 않습니다.** 후보 → 페이지 확인 → 정렬 비교 → 판정 순서는 그대로 둡니다.
- 같은 사진 검출에는 DINOv2가 CLIP보다 낫다고 알려져 있습니다. 하지만 이 판단은 우리가 측정한 것이 아니므로, 실제 사진 파일럿에서 비교해야 합니다.

**비용**
- 색인 1만 건 × 384차원(DINOv2-small) float32는 약 15 MB입니다. 선형 탐색으로 충분합니다.
- 수집할 때 이미지 1장당 0.1초 미만 추가되므로, 시간당 수집에는 부담이 없습니다.

## 다음에 할 일 제안 (결정 필요)

1. Fact Check API 키를 결제 없이 만들 수 있는지 사용자가 확인합니다. 되면 `imageSearch` 어댑터를 만듭니다.
2. 파일럿 후보 찾기용으로 SerpApi 키(무료 250회)를 쓸지 정합니다. 쓴다면 키는 환경 변수로만 넣습니다.
3. 배포 서버 OS(glibc 2.32 이상)를 정한 뒤 C2PA를 붙입니다.
4. 실제 사진 파일럿에서 색인에 DINOv2 임베딩을 보조로 넣었을 때 후보 재현율이 나아지는지 비교합니다.

## 출처

- SerpApi: [요금](https://serpapi.com/pricing), [Google Lens API](https://serpapi.com/google-lens-api), [약관](https://serpapi.com/legal)
- Google: [Fact Check Tools API](https://developers.google.com/fact-check/tools/api), [REST 참조](https://developers.google.com/fact-check/tools/api/reference/rest), [imageSearch](https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/imageSearch), [API 키](https://docs.cloud.google.com/docs/authentication/api-keys)
- C2PA: [c2pa-node-v2](https://github.com/contentauth/c2pa-node-v2), [c2pa-rs](https://github.com/contentauth/c2pa-rs), c2patool 릴리스 c2patool-v0.27.22(2026-09-10)
- 모델: [openai/clip-vit-base-patch32](https://huggingface.co/openai/clip-vit-base-patch32), Hugging Face API의 라이선스 필드(`facebook/dinov2-small`, `google/siglip-base-patch16-224`, `laion/CLIP-ViT-B-32-laion2B-s34B-b79K`)
