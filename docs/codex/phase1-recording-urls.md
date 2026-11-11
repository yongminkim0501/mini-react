# 단계 1 · 비교 영상용 실행 URL

2026-11-11 · 새 구현/추가 성능 측정 없음. [README](../../README.md)의 단계별 사다리와 함께 사용한다.

## 같은 빌드에서 실행

```sh
B4_COUNTERS=off npm run build -- --outDir /private/tmp/mini-react-phase1-off
npm run preview -- --host 127.0.0.1 --port 5183 --strictPort --outDir /private/tmp/mini-react-phase1-off
```

이 URL들은 위 preview가 실행 중일 때 동작한다. 5183이 사용 중이면 기존 서버를 먼저 종료한다. 다른 포트를 쓸 때는 목록의 기준 주소도 바꾼다. 서버 실행·중지는 이번 문서 정리에서 수행하지 않았다.

## 엔진 × 앱 변형 × 시나리오 (40개)

| 엔진 | 앱 변형 | 대규모 갱신 | 타이핑 | 클릭 | 수신 애니메이션 |
| --- | --- | --- | --- | --- | --- |
| stack | current | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=stack&app=current&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=stack&app=current&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=stack&app=current&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=stack&app=current&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| stack | cached | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=stack&app=cached&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=stack&app=cached&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=stack&app=cached&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=stack&app=cached&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| fiber-sync | current | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-sync&app=current&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-sync&app=current&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-sync&app=current&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-sync&app=current&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| fiber-sync | cached | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-sync&app=cached&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-sync&app=cached&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-sync&app=cached&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-sync&app=cached&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| fiber-slice | current | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-slice&app=current&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-slice&app=current&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-slice&app=current&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-slice&app=current&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| fiber-slice | cached | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-slice&app=cached&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-slice&app=cached&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-slice&app=cached&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-slice&app=cached&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| fiber | current | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber&app=current&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber&app=current&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber&app=current&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber&app=current&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| fiber | cached | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber&app=cached&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber&app=cached&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber&app=cached&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber&app=cached&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| fiber-bailout | current | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-bailout&app=current&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-bailout&app=current&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-bailout&app=current&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-bailout&app=current&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |
| fiber-bailout | cached | [S1](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-bailout&app=cached&scenario=S1&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S2](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-bailout&app=cached&scenario=S2&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S3](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-bailout&app=cached&scenario=S3&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) | [S4](http://127.0.0.1:5183/lab/pages/heatmap.html?engine=fiber-bailout&app=cached&scenario=S4&size=20000&seed=42&cellCost=0&runs=3&autorun=1&hud=record) |

## 녹화 순서와 통제 조건

1. 창/viewport를 1280×720, DPR 2로 맞추고 충전·60Hz·CPU throttle 없음 조건을 유지한다. 실행 전 주사율 경고가 있으면 영상에 표시한다.
2. 주 사다리는 stack/current → fiber-sync/current → fiber-slice/current → fiber/current → fiber-bailout/cached다. 네 시나리오 각각 같은 seed·size·cellCost를 사용한다.
3. 워밍업 1회가 끝나고 HUD/상태가 `Sx 1/3`으로 바뀐 첫 본 실행을 같은 기준으로 잘라 비교한다. 나머지 2회도 원자료에서 제거하지 않는다.
4. 앱 캐시 효과를 구분할 때는 fiber/current·fiber/cached·fiber-bailout/current·fiber-bailout/cached의 2×2를 사용한다. stack/cached도 앱 변경의 대조군으로 사용할 수 있다.
5. URL은 엔진 하나씩 고정한다. 앱 변형은 페이지의 엔진 이름 옆과 URL로 식별한다. HUD는 엔진·시나리오를 표시한다.

모든 링크는 현재 같은 OFF 프로덕션 빌드를 실행한다. README의 초기 관문 숫자는 과거 개발 서버 자료이므로 영상 수치와 일치한다고 보장하지 않는다. HUD의 canvas/DOM 갱신도 작업을 추가한다. 정량 측정에서는 `hud=record`를 제거한다. preview에서는 개발 서버 전용 `save=1`을 쓰지 않고 JSON 내려받기를 사용한다.

이 문서는 URL 목록이며 영상 파일 자체를 촬영한 결과물이 아니다. 엔진·앱 변형을 바꿔도 같은 앱을 비교하는 단계 1 범위를 유지한다. B-5·경계 기록 경량화·CSS 격리는 구현하지 않았다.
