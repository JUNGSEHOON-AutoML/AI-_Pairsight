# 역이미지 검색 서비스 비교 (Pairsight 원본 추적용)

작성일: 2026-10-18 · 대상 기능: fix-F2 원본 추적, 판정 "맥락 조작"

표기: **확인** = 공식 문서나 약관에서 직접 확인함 · **추정** = 공식 출처를 찾지 못했거나 2차 출처뿐임 · **확인 필요** = 접근이 막혀 읽지 못함

## 결론 먼저

**추천: Google Cloud Vision Web Detection을 기본으로 쓰고, "날짜가 필요할 때만" TinEye API를 붙이고, Google Fact Check Tools `claims:imageSearch`를 함께 부르는 조합입니다.**

- **Vision으로 일치 이미지와 페이지를 넓고 싸게 찾습니다.** 1,000건당 $3.50이고, 매달 1,000건은 무료입니다.
- **TinEye로 날짜를 얻습니다.** TinEye의 `crawl_date`는 *TinEye가 처음 발견한 날짜*이지 실제 게시일이 아닙니다. 그래도 "최소 이 날짜 전에는 이미 있었다"는 하한선 근거가 되므로 맥락 조작 판별에 쓸 수 있습니다. 서비스 4곳 중 날짜를 주는 곳은 TinEye뿐입니다.
- **Fact Check 이미지 검색으로 이미 팩트체크된 사진인지 확인합니다.** 언론사가 이미 검증한 사진이면 가장 강한 맥락 근거가 됩니다.
- **TinEye 약관은 Cloudflare 봇 확인 때문에 읽지 못했습니다.** 계약 전에 반드시 직접 읽어야 합니다. 특히 결과 저장(캐싱)과 결과 화면 표시 허용 여부를 확인하세요.

**Bing Visual Search는 쓸 수 없습니다.** Microsoft 공식 공지에 따르면 Bing Search API는 2025년 8월 11일에 종료됐습니다.

## 기본 후보에서 제외: Yandex (2026-10-18 결정)

Yandex Cloud Search API는 기술적으로는 쓸 수 있습니다(1,000건당 약 $7.50, 이미지 URL과 페이지 URL 제공). 그래도 **기본 후보에서 뺍니다.** 이유는 아래 세 가지입니다.

1. **사용자 이미지가 러시아 쪽 인프라로 전송될 가능성이 큽니다.**
   - Yandex Cloud의 리전은 러시아(ru-central1)와 카자흐스탄 두 곳뿐입니다 **확인** [20].
   - 이미지 검색 API가 어느 리전에서 처리되는지는 문서에서 찾지 못했습니다. 다만 러시아 리전에서 처리될 가능성이 높다고 봅니다 **추정**.
   - Pairsight에 올라오는 이미지에는 실제 사람의 얼굴, 장소, 사적인 대화 캡처가 들어 있을 수 있습니다.
2. **개인정보 국외 이전 문제가 있습니다.** 한국 사용자의 개인정보를 해외로 보내려면 개인정보 보호법상 국외 이전 요건(고지·동의 등)을 갖춰야 합니다. 이전 국가가 러시아라면 사용자 설명과 동의를 받기도, 감독하기도 어렵습니다. 정확한 요건은 법률 검토가 필요합니다 **추정**.
3. **서비스 신뢰에 맞지 않습니다.** "진위를 확인해 주는 서비스"가 사용자 이미지를 어디로 보내는지 설명하기 어렵다면 신뢰를 잃습니다. 포지셔닝 A("근거를 보여주는 판정")와도 충돌합니다.

그 밖에 결과 캐싱이 금지에 가깝고, 결과 순서를 바꿀 수 없다는 약관 제약도 있습니다(아래 비교표).

→ 비교표에는 참고용으로 남기지만, 코드의 `ReverseSearchProvider` 구현 대상과 한국어 커버리지 벤치마크 대상에서는 뺍니다.

## 비교표

| 항목 | Google Cloud Vision (Web Detection) | TinEye API | Yandex Cloud Search API (SearchByImage) | Bing Visual Search |
| --- | --- | --- | --- | --- |
| 상태 | 운영 중 **확인** | 운영 중 **확인** | 운영 중 **확인** | **종료 (2025-08-11)** **확인** [1] |
| **최초 게시 날짜** | **없음.** 응답에 날짜 필드가 없음 **확인** [2] | **TinEye가 처음 발견한 날짜(crawl_date)만 있음.** 실제 게시일은 아니며, "언제 처음 인터넷에 올라왔는지는 알 수 없다"고 TinEye가 직접 밝힘 **확인** [5][6] · 오래된 순 정렬 가능 **추정**(API 문서 2차 인용) [6] | **없음.** 날짜 필드 없음 **확인** [9] | — |
| 원본 URL / 이미지 URL | 일치 이미지 URL(`fullMatchingImages`, `partialMatchingImages`), 페이지 URL과 제목(`pagesWithMatchingImages.url`, `pageTitle`) **확인** [2] | 일치 항목마다 `backlinks[]`(이미지 URL, 게시 페이지, crawl_date), 기본 100개 제한(`backlink_limit`으로 변경 가능) **확인** [7] | `url`(이미지), `pageUrl`, `pageTitle`, `host`, `width`, `height` **확인** [9] | — |
| 고해상도 이미지 (나란히 비교용) | 원본 이미지 URL을 주므로 직접 내려받아야 함. 해상도 정보는 없음 **확인** [2] | 일치 이미지의 크기(width, height, filesize) 정보 있음 **추정**(클라이언트 문서 2차 인용) [7] | `width`, `height` 제공 **확인** [9] | — |
| 한국어 언론·커뮤니티 커버리지 | **추정: 언론사 사이트는 넓지만, 네이버 블로그·카페 같은 폐쇄형 커뮤니티는 약할 가능성** (공식 수치 없음) | **추정: 색인 약 790억 장**(2차 출처) [8]. 한국 사이트 비중은 알 수 없음 | **추정: 러시아어권에 강하고 한국어는 알 수 없음** | — |
| 가격 (검사 1,000건) | **$3.50** (1,001~500만 건 구간) **확인** [3] | **약 $40** (5,000건 묶음 $200 = 건당 $0.04) **추정**(공식 블로그 기준, 현재 가격 페이지는 차단됨) [10] · 묶음은 2년간 유효 **확인** [11] | **약 $7.50** **확인** [12] | — |
| 무료 구간 | 매달 1,000건 무료 **확인** [3] | 무료 샌드박스(실제 검색이 아닌 연동 테스트용) **확인** [13] | 확인 못 함 | — |
| 상업적 이용 | 허용. "Vision API 기능을 최종 고객에게 제공하는 솔루션의 구성요소로 사용할 수 있다", 단 API 자체 재판매는 금지 **확인** [4] | 상업용은 유료 API로 허용 **확인** [13] · API는 서버에서만 호출해야 함 **추정** (다른 제품인 MobileEngine의 FAQ에 있는 문구라, TinEye API에도 적용되는지는 미확인) [14] | 고객 사이트에서 결과 사용 허용, 디자인은 자유지만 **결과 순서를 바꾸면 안 됨** **확인** [15] | — |
| 결과 화면 표시 | Vision 전용 제한 조항을 찾지 못함 **추정: 허용** (서비스 약관 전문을 검색함) [16] | **확인 필요** (약관 페이지 접근 차단) | 순서 변경 금지, 결과 페이지마다 이용약관 표시 의무 **확인**(구 Yandex.XML 약관) [15] | — |
| 결과 캐싱 (같은 이미지 재사용) | Vision 전용 제한 조항을 찾지 못함 **추정: 허용** [16]. 단, Google 검색 기반의 *Grounding* 상품은 캐싱 금지이므로 혼동하지 말 것 [16] | **확인 필요** | **불리함.** 구 약관은 결과 저장과 캐싱을 금지하고 임시 복사본만 허용 **확인** [15] | — |
| 업로드 이미지 처리 | 동기 요청은 메모리에서만 처리하고 디스크에 저장하지 않음, 학습에 사용하지 않음 **확인** [4] | 확인 못 함 | 확인 못 함 | — |

### 같이 쓸 만한 서비스

| 서비스 | 역할 | 메모 |
| --- | --- | --- |
| **Google Fact Check Tools `claims:imageSearch`** | 이 이미지가 이미 팩트체크된 적이 있는지 확인 | 공개된 이미지 URL(`imageUri`)을 넣으면 일치하는 팩트체크 주장을 돌려줌 **확인** [17]. `languageCode`로 언어를 좁힐 수 있음. 가격과 한도는 공식 수치를 못 찾음(2차 출처끼리 엇갈림) **추정** [18] |
| **Naver 검색 API (이미지)** | 한국어 보조 검색 | **이미지를 입력으로 받지 못하고 검색어만 받음**, 하루 25,000회 **확인** [19]. 역검색은 불가능하지만, 원본 페이지 제목이나 사건 키워드로 국내 보도 이미지를 찾는 2차 검색에는 쓸 수 있음 |
| SerpApi 등 Google Lens 대행 API | — | **추천하지 않음.** Google의 공식 API가 아니라 Google 결과를 가져오는 방식이라 약관 리스크가 있음 **추정** |

## 비용 추정 (검사 1,000건, 월 기준)

| 구성 | 계산 | 1,000건당 |
| --- | --- | --- |
| Vision만 | $3.50 | **$3.50** (월 1,000건까지는 $0) |
| Vision + 모든 건에 TinEye | $3.50 + $40 | **$43.50** |
| Vision + "Vision에서 일치 항목이 나온 건"만 TinEye | $3.50 + $40 × 일치 비율 | **추정: 일치 비율 50%면 약 $23.50** |
| Yandex만 | $7.50 | $7.50 (날짜 없음, 캐싱 불리) · **기본 후보에서 제외** |

같은 이미지는 분석 결과를 재사용하므로(fix-F6) 실제 호출 수는 검사 수보다 적습니다. 다만 TinEye에도 캐싱이 허용될 때만 그렇습니다.

## 추천안: 3단 조합

```
1. Vision Web Detection   (모든 검사)        → 일치 이미지, 게시 페이지 목록
2. Fact Check imageSearch (모든 검사)        → 이미 팩트체크된 사진이면 즉시 "맥락 조작" 근거
3. TinEye                 (1에서 일치가 나왔거나, 사용자가 "날짜 확인"을 눌렀을 때) → crawl_date 하한선
+ 게시 페이지의 공개 메타데이터(article:published_time, JSON-LD datePublished)를 직접 읽어
  게시일 "추정"을 하나 더 얻는다 (자체 수집이므로 근거 강도는 '중' 이하)
```

**판정과 화면에 반영할 것 (`/replica-design`으로 넘김):**

- 날짜는 항상 출처와 의미를 함께 표시합니다. 예: "TinEye가 처음 발견한 날짜: 2019-03-02 (실제 게시일은 더 이를 수 있음)". "최초 게시일"이라는 표현은 쓰지 않습니다.
- **"맥락 조작" 판정의 강한 근거:**
  - 팩트체크 기관의 판정이 있다.
  - 사용자가 주장하는 사건 날짜보다 확실히 이른 날짜에 같은 이미지가 있었다. 이 경우 TinEye crawl_date나 게시 페이지 메타데이터가 근거가 됩니다.
- **날짜 근거가 없으면 "맥락 조작"이라고 단정하지 않습니다.** 이때는 "판단 불가" 화면에 "날짜를 확인하지 못함"을 부족한 근거로 표시합니다.

## 계약 전에 꼭 할 일

1. **TinEye API 약관(tineye.com/api_terms)을 브라우저에서 직접 읽습니다.** 확인할 것은 결과 캐싱, 결과 화면 표시, 일치 이미지 미리보기 표시 허용 여부입니다.
2. **한국어 커버리지 벤치마크를 돌립니다.** 국내 언론 사진 30장과 커뮤니티 이미지 20장을 Vision과 TinEye에 넣어 일치율을 비교합니다. (Yandex는 위 이유로 제외) 커버리지 항목이 모두 추정이라서 이 테스트가 필요합니다.
3. Fact Check Tools API의 현재 한도와 가격을 Google Cloud 콘솔에서 확인합니다.
4. Google Cloud 서비스 약관 전문에서 Vision 전용 조항을 다시 확인합니다. WebFetch가 페이지를 세 부분으로 나눠 읽어서 일부가 잘렸을 수 있습니다.

## 출처

1. Microsoft, Bing Search API retirement 공지: https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
2. Google Cloud, Detect Web entities and pages: https://docs.cloud.google.com/vision/docs/detecting-web
3. Google Cloud Vision 가격: https://cloud.google.com/vision/pricing
4. Google Cloud Vision 데이터 사용 FAQ: https://docs.cloud.google.com/vision/docs/data-usage
5. TinEye 도움말, "first found on"의 의미: https://help.tineye.com/article/248-what-does-tineye-first-found-on-mean
6. TinEye API 도움말, 결과 정렬: https://tineye-api.helpscoutdocs.com/article/246-can-i-sort-my-results
7. TinEye API 릴리스 노트 (backlink_limit): https://help.tineye.com/article/285-tineye-api-release-notes · 필드 설명은 pytineye 클라이언트 문서(2차 인용): https://api.tineye.com/python/docs
8. TinEye 색인 규모 (2차 출처): https://en.wikipedia.org/wiki/TinEye
9. Yandex Cloud, ImageSearch.SearchByImage: https://aistudio.yandex.ru/docs/en/search-api/api-ref/ImageSearch/searchByImage
10. TinEye 블로그, 새 가격 체계: https://blog.tineye.com/new-image-search-pricing/
11. TinEye 도움말, 검색 묶음 구매: https://help.tineye.com/article/169-purchasing-search-bundles
12. Yandex Search API 가격: https://aistudio.yandex.ru/docs/en/search-api/pricing
13. TinEye 도움말, 상업적 이용: https://help.tineye.com/article/241-can-i-use-tineye-for-commercial-purposes-or-high-volume-searching
14. TinEye MobileEngine FAQ (다른 제품, 참고용): https://services.tineye.com/mobileengine_sandbox/faq.html
15. Yandex Search API 이용약관: https://yandex.com/legal/cloud_terms_search_api · 구 Yandex.XML 약관: https://yandex.com/legal/xml/en/
16. Google Cloud 서비스별 약관: https://cloud.google.com/terms/service-terms
17. Google Fact Check Tools API, claims.imageSearch: https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/imageSearch
18. Fact Check Tools API 약관(한국어): https://developers.google.cn/fact-check/tools/api/terms?hl=ko
19. 네이버 검색 API, 이미지 검색: https://developers.naver.com/docs/serviceapi/search/image/image.md
20. Yandex Cloud, Regions: https://yandex.cloud/en/docs/overview/concepts/region
