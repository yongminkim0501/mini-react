# B-4 승인 후 진단 · 최종 히트맵 지연과 관측 오버헤드

2026-11-11 · `feat/fiber-engine` · `/private/tmp/mini-react-fiber-engine`

## 결론

- **기존 지연 증가의 주된 직접 차이는 최종 attempt의 조각 사이 시간이었다.** B-4에서 최종 attempt 경과 차이는 179.5ms였지만 작업 차이는 9.4ms였다. 같은 최종 query의 폐기·재시작은 새 계측에서 0회였다. 이전에 폐기된 작업이 입력 종료 뒤 실행된 시간도 0이다. 폐기 총량을 최종 지연의 직접 원인으로 보지 않는다.
- **지연 격차의 크기와 순서는 재현되지 않았다.** 기존 runner 경로의 3회 평균은 최종 attempt 경과 fiber 347.6ms / bailout 400.3ms였지만, 짧은 Sync를 포함한 입력 종료→히트맵은 432.8 / 408.3ms였다. bailout이 이전처럼 더 느리지 않았다. 브라우저 구간과 프레임 위상에 민감한 수치를 고정된 엔진 특성으로 일반화하지 않는다. 별도 trace 두 표본에서는 조각 사이 잔차의 약 93%가 메인 스레드 렌더링과 겹쳤다.
- **카운터는 오버헤드의 일부이며 전부는 아니다.** 동일 프로덕션 ON/OFF에서 S3의 커밋당 증가율은 current 10.72→8.77%, cached 11.50→6.30%, S2 current는 18.35→9.87%였다. 반면 S1 current는 9.35→0.05%, cached는 7.53→9.11%로 일관되게 감소하지 않았다. 3회 표본의 실제 범위를 유지한다. S2 cached의 큰 감소는 생략 효과를 포함한다.
- **기존 current+bailout S2 세 실행은 모두 경고가 없다.** 경고 없는 실행만의 p95 평균도 전체와 같은 213.86ms다. 57개 입력을 합친 pooled p95는 214.58ms이며 서로 다른 집계다.


## 범위와 검증

엔진(`src/fiber`, `src/core`, `src/runtime`)·앱(`lab/app`)·데이터(`lab/data.js`) 원본은 B-4 승인 시점 `6b99b59` 대비 변경하지 않았다. 경계 기록·스케줄러·레인·큐·앱 캐시는 고치지 않았다. 측정 harness의 단일 실행 API/일시 정지, opt-in runSlice/이벤트 기록, 카운터 제거용 빌드 변환과 분석 도구만 추가했다. 소스 차이가 없다는 확인과 빌드 SHA는 [manifest](../results/fiber-b4-diagnostics/build-manifest.json)에 있다.

- `npm run test:run`: 35개 파일, 357개 테스트 통과. 추가 4개는 카운터 제거 후 문법과 제품 DOM/Render 호출의 보존을 확인한다.
- `npm run typecheck`: 통과.
- 프로덕션 카운터 ON/OFF의 `npm run build`: 둘 다 통과.
- ON/OFF × fiber/fiber-bailout 브라우저 검증: 동일 DOM SHA·title, 같은 셀 재클릭 seq=2. OFF의 counterTotals는 null. [검증 결과](../results/fiber-b4-diagnostics/smoke-validation.json).
- `git diff --check`: 통과. 푸시·PR은 하지 않았다. B-5는 구현하지 않았다.

## 진단 1 · 기존 B-4 자료에서 보이는 직접 차이

아래는 승인된 [B-4 원자료](../results/fiber-bailout-b4/fiber-bailout-cross.json)의 S2 cached를 재계산한 값이다. 마지막 T(Transition) attempt의 Render+Commit 작업 시간과 경과 시간을 구분한다. 작업 시간은 양보 시간을 뺀 작업 구간의 경과 합계이며 OS CPU 시간은 아니다.

| 엔진 | 실행 | 마지막 Sync→T 시작 ms | 최종 T 작업 ms | 최종 T 경과 ms | 경과−작업 ms | 조각 수 | 입력 종료→히트맵 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fiber | 1 | 14.1 | 131.2 | 255.0 | 123.8 | 23 | 346.1 |
| fiber | 2 | 0.1 | 130.3 | 246.8 | 116.5 | 22 | 323.4 |
| fiber | 3 | 0.2 | 126.1 | 277.8 | 151.7 | 22 | 353.0 |
| fiber-bailout | 1 | 12.1 | 138.3 | 428.7 | 290.4 | 25 | 441.1 |
| fiber-bailout | 2 | 11.7 | 137.4 | 424.0 | 286.6 | 25 | 435.8 |
| fiber-bailout | 3 | 14.1 | 140.2 | 465.3 | 325.1 | 26 | 479.7 |


기존 fiber의 평균 최종 attempt는 작업 약 129.2ms·경과 259.9ms, bailout은 작업 138.6ms·경과 439.3ms였다. 경과 차이 **179.5ms 중 작업 차이는 9.4ms**, 나머지 **170.0ms(약 95%)**는 엔진 작업 구간 밖 시간이었다. 기존 자료는 ProgressApp의 작업 길이와 matchQuery별 시작을 남기지 않아 그 세부 항목을 소급해 0으로 채우지 않는다.

### 기존 runner 경로의 재측정

원래 `runner.runScenario`의 워밍업 1회·3회 교차 루프를 그대로 사용하고, S2 cached의 두 엔진에만 외부 probe를 달았다. probe는 각 루트 runSlice의 시작/끝·이벤트와 완료/폐기 시 WIP의 query/matchQuery를 읽으며 상태·큐·DOM을 쓰지 않는다. 측정 중 engine은 counters ON인 개발 서버다. 초기 단일 실행 API 조사 자료는 별도로 보존하며 아래 3회 결과와 섞지 않는다.

| 엔진 | 실행 | Sync→T 시작 ms | Render 작업 ms | R+Commit 작업 ms | R+Commit 경과 ms | 조각 수 | 입력 종료→히트맵 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fiber | 1 | 12.8 | 113.1 | 130.4 | 371.3 | 23 | 463.6 |
| fiber-bailout | 1 | 11.6 | 132.2 | 149.5 | 388.5 | 26 | 400.5 |
| fiber | 2 | 0.2 | 112.3 | 128.6 | 373.5 | 23 | 450.3 |
| fiber-bailout | 2 | 0.2 | 123.1 | 138.0 | 377.7 | 25 | 378.2 |
| fiber | 3 | 11.6 | 107.8 | 123.1 | 298.1 | 22 | 384.6 |
| fiber-bailout | 3 | 11.1 | 130.7 | 146.5 | 434.8 | 26 | 446.2 |


### 최종 attempt의 시간 분할

`대상 runSlice + ProgressApp + 다른 레인 + 엔진 밖 잔차 = 최종 attempt 경과`다. 대상 runSlice 열에는 계측·루프 후처리도 포함돼 위 표의 엔진 activeMs와 미세하게 다르다. ProgressApp은 그 루트의 Render/Commit 작업이다. rAF의 setter enqueue 등은 엔진 밖 잔차에 남긴다. 다른 레인은 진행 바를 제외한 다른 루트/레인의 runSlice다.

| 엔진 | 실행 | 경과 ms | 대상 runSlice ms | ProgressApp ms | 다른 레인 ms | 엔진 밖 잔차 ms | 진행 바 조각 수 | 같은 최종 query 폐기 수 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fiber | 1 | 371.3 | 130.4 | 2.4 | 0.0 | 238.5 | 19 | 0 |
| fiber-bailout | 1 | 388.5 | 149.5 | 2.5 | 0.0 | 236.5 | 20 | 0 |
| fiber | 2 | 373.5 | 128.6 | 2.1 | 0.0 | 242.8 | 18 | 0 |
| fiber-bailout | 2 | 377.7 | 138.0 | 2.0 | 0.0 | 237.7 | 18 | 0 |
| fiber | 3 | 298.1 | 123.1 | 1.6 | 0.0 | 173.4 | 14 | 0 |
| fiber-bailout | 3 | 434.8 | 146.5 | 2.1 | 0.0 | 286.2 | 20 | 0 |


이번 재측정에서 최종 attempt의 평균 작업/경과는 fiber 127.4/347.6ms, bailout 144.7/400.3ms였다. 경과 시간에는 각각 ProgressApp 약 2.0/2.2ms, 다른 레인 0ms, 엔진 밖 잔차 218.2/253.5ms가 포함됐다. 잔차는 시간 조각 사이 브라우저에 제어권을 돌려준 구간이다. Layout/Paint만을 뜻하지 않으며 다른 JS·task 대기·probe 기록도 포함한다. 이를 전부 브라우저 렌더링 시간이라고 부르지 않는다.

### 전체 반영 지연과 폐기 작업의 시간상 위치

`입력 종료→Sync + Sync→최종 T 시작 + 최종 T 경과 + 최종 Commit→다음 rAF`로 기존 heatmapSettleMs와 일치하는지 검사했다. 마지막 열은 이전에 폐기된 attempt의 runSlice가 입력 종료 후에 실제 실행됐는지를 합산한 값이다.

| 엔진 | 실행 | 입력 종료→Sync ms | Sync→T ms | 최종 T ms | Commit→rAF ms | 합계 ms | 이전 폐기 작업 ms | 폐기 작업의 종료 후 실행 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fiber | 1 | 79.4 | 12.8 | 371.3 | 0.1 | 463.6 | 126.4 | 0.0 |
| fiber-bailout | 1 | 0.2 | 11.6 | 388.5 | 0.2 | 400.5 | 638.6 | 0.0 |
| fiber | 2 | 76.5 | 0.2 | 373.5 | 0.1 | 450.3 | 123.7 | 0.0 |
| fiber-bailout | 2 | 0.2 | 0.2 | 377.7 | 0.1 | 378.2 | 605.0 | 0.0 |
| fiber | 3 | 74.8 | 11.6 | 298.1 | 0.1 | 384.6 | 130.2 | 0.0 |
| fiber-bailout | 3 | 0.3 | 11.1 | 434.8 | 0.0 | 446.2 | 636.3 | 0.0 |


같은 최종 `matchQuery = deploy-1742 err-503`로 시작했다가 버려진 attempt는 재측정에 없었다. 이전 prefix의 폐기된 작업은 마지막 Sync 이전에 수행됐다. 따라서 **폐기 비용 증가를 최종 attempt가 그 비용을 다시 모두 기다렸다는 뜻으로 해석하면 안 된다.** 이전 할당의 GC 등 간접 효과는 이 시간 분할만으로 분리하지 않았다. 전체 작업 낭비 지표와 마지막 입력 뒤 지연은 다른 관측값이다.

### 별도 trace 1회씩 · 잔차의 브라우저 작업 확인

trace는 위 3회 평균에 섞지 않은 별도 표본이다. 동일 페이지 PerformanceMark로 trace 시계와 performance.now를 정렬했다. CrRendererMain에서 UpdateLayoutTree/RecalculateStyles/Layout/PrePaint/Paint/Layerize/CompositeLayers 구간의 **합집합**을 만들고, 모든 엔진 runSlice와 겹치는 부분을 뺀 뒤 잔차와 비교했다. 중첩 이벤트를 이중 합산하지 않는다.

| 엔진 | 최종 T 경과 ms | 작업 ms | ProgressApp ms | 잔차 ms | 잔차 중 브라우저 렌더링 ms | 잔차의 렌더링 비율 | 그중 Paint ms | 그중 Layerize ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fiber | 310.0 | 123.9 | 1.2 | 184.9 | 171.7 | 92.9% | 91.5 | 62.2 |
| fiber-bailout | 394.1 | 154.5 | 2.4 | 237.2 | 221.8 | 93.5% | 115.6 | 77.4 |


이 두 표본에서는 잔차의 약 93%가 메인 스레드 렌더링 작업과 겹쳤다. ProgressApp의 JS Render/Commit이 작다는 것은 그 DOM 갱신이 유발할 수 있는 브라우저 렌더링까지 작다는 뜻이 아니다. 이 trace만으로 모든 Paint를 특정 노드나 ProgressApp 하나의 인과로 귀속하지 않는다. 두 trace 파일과 clock offset은 원자료와 analysis.json에 있다.

## 진단 2 · 프로덕션 카운터 ON/OFF

### 제거한 관측 코드

`B4_COUNTERS=off`일 때만 Vite 빌드 변환을 적용한다. 원본 engine 파일을 편집하지 않는다.

- 계수 호출, newCounters 객체 생성/스냅샷, 영역 분류 계산/필드, 계수용 DOM callback·Commit visit 함수를 제거한다.
- 미스 사유만을 위한 relocated 조회와 역방향 boundaryVNodes 인덱스(컨테이너·배열·보존 필드)를 제거한다.
- 실제 생략 판정에 쓰는 boundaries의 위치/VNode 비교와 boundaryIndices의 host 연결, reuse, nested 기록은 유지한다.
- B-3 시간 이벤트·rAF·Long Task·LoAF 관측은 양쪽 빌드에서 유지한다. **모든 관측 비용이 0인 실험이 아니라 B-4 카운터 계측의 유무 비교**다.

초기 OFF 변환에 분류 전용 조회가 남은 것을 발견해 보완하고 본 측정을 처음부터 다시 실행했다. 불완전한 초기 결과는 최종 표에 포함하지 않았다.

### 방법과 환경

동일 프로덕션 설정으로 두 번 build 후 preview 5182(ON)/5183(OFF)에 제공했다. 한 headed Chrome 세션의 두 페이지를 번갈아 활성화하며, 비활성 페이지는 앱/진행 바 루트를 내려 대기시켰다. 시나리오는 **S1 → S3 → S2**, 20k·seed=42·cellCost=0. 시나리오마다 8개 조합별 워밍업 1회를 버린 뒤 3회 측정했다. 본 측정은 ON 36회·OFF 36회다.

각 반복은 current/fiber ON→OFF, current/bailout ON→OFF, cached/fiber ON→OFF, cached/bailout ON→OFF 순서다. 기존 B-4 개발 서버 수치를 프로덕션 OFF와 직접 빼서 관측 비용으로 주장하지 않는다. 같은 프로덕션 ON을 추가한 이유다. 매 실행 직전 주사율을 고정하고 환경을 수집했다. 초기 단일 API probe에는 이 추가 교정 구간이 있으므로 진단 1의 주 표는 기존 runner 경로로 재확인했다.

| 환경 | 값 |
| --- | --- |
| 브라우저 | Chromium 153.0.8010.12, Not_A Brand 8.0.0.0 |
| 전원 | AC 연결·충전, 배터리 100% |
| viewport / DPR | 1280x720 / 2 |
| 논리 코어 | 10 |
| 실행 | headed Chrome, CPU throttle 1배 |
| 프로덕션 측정 코드 | 42b0d9657f9fbf55a6ab7baddce7d71ffb6d7800 |
| 프로덕션 측정 시작 작업 트리 | clean |
| 생산 경고 실행 수 | 0 |


### 요청한 커밋당 작업 증감률

실행별 activeMean의 3회 평균으로 `100 × (bailout / fiber − 1)`을 계산한다. 단위는 ms, 마지막 열은 OFF 증감률−ON 증감률의 percentage point다. S2 cached는 실제 생략 효과도 포함하므로 그 음의 증감률을 순수 관측 비용이라고 부르지 않는다.

| 시나리오 | 앱 | ON fiber ms | ON bailout ms | ON 증감률 | OFF fiber ms | OFF bailout ms | OFF 증감률 | OFF−ON 증감 pp |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | current | 149.0 | 163.0 | 9.35% | 135.4 | 135.5 | 0.05% | -9.30 |
| S1 | cached | 152.4 | 163.9 | 7.53% | 124.9 | 136.3 | 9.11% | 1.58 |
| S3 | current | 84.4 | 93.4 | 10.72% | 67.2 | 73.1 | 8.77% | -1.95 |
| S3 | cached | 82.6 | 92.1 | 11.50% | 68.0 | 72.3 | 6.30% | -5.20 |
| S2 | current | 79.4 | 93.9 | 18.35% | 63.4 | 69.6 | 9.87% | -8.48 |
| S2 | cached | 78.3 | 7.5 | -90.36% | 63.8 | 5.7 | -91.08% | -0.72 |


### 커밋 구성과 Sync 비용

특히 S2는 카운터 OFF에서 Transition이 더 자주 완료될 수 있다. 커밋당 평균의 분모/레인 구성이 달라질 수 있으므로 아래를 함께 본다. **이번 S2 본 측정은 모든 조합에서 실행당 총 20회=Sync 19회+Transition 1회로 동일했다.** 같은 입력에 대한 Sync 비용은 그 영향을 덜 받는 보조 비교다.

| 시나리오 | 앱 | 카운터 | 엔진 | 총 커밋/실행 | Sync/실행 | T/실행 | Sync 작업 ms | Sync Render ms | 입력 p95 ms | 클릭 p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S3 | current | on | fiber | 11.0 | 10.0 | 1.0 | 78.1 | 78.0 | N/A | 112.8 |
| S3 | current | on | fiber-bailout | 11.0 | 10.0 | 1.0 | 86.8 | 86.8 | N/A | 114.8 |
| S3 | current | off | fiber | 11.0 | 10.0 | 1.0 | 61.3 | 61.3 | N/A | 87.7 |
| S3 | current | off | fiber-bailout | 11.0 | 10.0 | 1.0 | 67.2 | 67.1 | N/A | 100.9 |
| S3 | cached | on | fiber | 11.0 | 10.0 | 1.0 | 76.2 | 76.1 | N/A | 105.5 |
| S3 | cached | on | fiber-bailout | 11.0 | 10.0 | 1.0 | 85.4 | 85.3 | N/A | 119.4 |
| S3 | cached | off | fiber | 11.0 | 10.0 | 1.0 | 62.5 | 62.4 | N/A | 91.5 |
| S3 | cached | off | fiber-bailout | 11.0 | 10.0 | 1.0 | 66.5 | 66.4 | N/A | 90.5 |
| S2 | current | on | fiber | 20.0 | 19.0 | 1.0 | 76.1 | 76.1 | 106.1 | N/A |
| S2 | current | on | fiber-bailout | 20.0 | 19.0 | 1.0 | 91.2 | 91.2 | 259.1 | N/A |
| S2 | current | off | fiber | 20.0 | 19.0 | 1.0 | 61.2 | 61.2 | 91.0 | N/A |
| S2 | current | off | fiber-bailout | 20.0 | 19.0 | 1.0 | 67.2 | 67.2 | 101.4 | N/A |
| S2 | cached | on | fiber | 20.0 | 19.0 | 1.0 | 75.6 | 75.5 | 105.3 | N/A |
| S2 | cached | on | fiber-bailout | 20.0 | 19.0 | 1.0 | 0.3 | 0.2 | 25.6 | N/A |
| S2 | cached | off | fiber | 20.0 | 19.0 | 1.0 | 61.6 | 61.6 | 87.2 | N/A |
| S2 | cached | off | fiber-bailout | 20.0 | 19.0 | 1.0 | 0.2 | 0.2 | 28.2 | N/A |


### OFF의 실행별 범위

세 표본을 모두 유지했다. 작은 차이를 통계적으로 확정하지 않으며, 특정 실행을 제거해 증감률을 재작성하지 않는다. [실행별 CSV](../results/fiber-b4-diagnostics/production-per-run.csv)와 분석 JSON도 보존했다.

| 시나리오 | 앱 | 엔진 | OFF 건당 작업 3회 ms | OFF 최소–최대 ms |
| --- | --- | --- | --- | --- |
| S1 | current | fiber | 132.9, 140.8, 132.6 | 132.6–140.8 |
| S1 | current | fiber-bailout | 134.8, 135.0, 136.7 | 134.8–136.7 |
| S1 | cached | fiber | 126.3, 125.2, 123.3 | 123.3–126.3 |
| S1 | cached | fiber-bailout | 135.3, 137.4, 136.1 | 135.3–137.4 |
| S3 | current | fiber | 67.8, 66.8, 66.9 | 66.8–67.8 |
| S3 | current | fiber-bailout | 73.1, 74.6, 71.5 | 71.5–74.6 |
| S3 | cached | fiber | 67.8, 68.7, 67.4 | 67.4–68.7 |
| S3 | cached | fiber-bailout | 72.6, 73.2, 71.0 | 71.0–73.2 |
| S2 | current | fiber | 62.4, 63.9, 63.8 | 62.4–63.9 |
| S2 | current | fiber-bailout | 70.2, 69.2, 69.6 | 69.2–70.2 |
| S2 | cached | fiber | 65.0, 63.6, 62.7 | 62.7–65.0 |
| S2 | cached | fiber-bailout | 5.5, 5.9, 5.6 | 5.5–5.9 |


## 남은 경계 기록의 객체 생성 위치

아래 수는 이번 앱의 단일 host·중첩 없는 경계, 각 키의 첫 기록에서 **JS 객체 생성 표현식이 평가되는 수**다. 실제 V8 힙 객체/백킹스토어의 개수나 bytes를 재는 HeapProfiler 결과가 아니다. 임시 빈 배열은 최적화로 제거될 수 있고 Map/배열 내부 capacity 할당과 GC는 별도다. 문자열 경로도 객체 수에 합산하지 않는다.

| 위치 (src/fiber/workLoop.ts) | ON | OFF | 용도 |
| --- | --- | --- | --- |
| 115–116 boundary 리터럴 | 1 객체 | 1 객체 | 입력 VNode/위치/출력/host/nested 기록 |
| 62 byVNode 배열 | 2 배열 | 0 | `?? []` 임시 배열 + 저장 배열; 미스 사유용 |
| 65 index 배열 | 2 배열 | 2 배열 | 임시 빈 배열 + host 연결용 저장 배열 |
| 60·61·64 Map | 부모당 최대 3 | 부모당 최대 2 | 경로/역방향 분류/인덱스 컨테이너 |
| 84 path | 1 문자열 평가 | 1 문자열 평가 | 같은 부모 안의 확장 위치 |

따라서 fresh miss는 **ON 5 + 3/N, OFF 3 + 2/N** 객체 생성 표현식/기록이다(N=그 host 부모의 기록 수, Map 최초 생성 비용을 균등 배분). 이번 20k 전체 재조정은 경계 20,206건과 경계를 가진 host 부모 204개이므로 **ON 101,642회, OFF 61,026회**의 명시적 객체/배열/Map 생성 평가가 추가된다. 경로 문자열 평가는 20,206회다. 기존 h/키 전달/Expansion 생성은 두 엔진 공통이라 이 추가 수에 포함하지 않는다. nested가 기존 Expansion.records 배열을 더 오래 보유하는 효과도 별도다.

적중한 Heatmap 한 건은 69의 헤더 기록 복제 1객체+nested.map 1배열, record의 배열/Map으로 ON 9회/OFF 6회이며, 90의 reuse Map 최초 생성 1회를 더하면 **ON 10회/OFF 7회**다. 중첩 경계·같은 키 반복에서는 수가 달라진다. 복제/기록을 줄이는 수정은 하지 않았다. 이 생성 수를 시간 차이에 선형 대응시키거나 남은 오버헤드 전부를 할당 하나로 귀속하지 않는다. Map 조회·삽입·경로 생성·메타데이터 보유와 JIT/GC 영향을 개별 분리한 실험은 아니다.

## 확인 · 기존 current + bailout S2 경고

| 실행 | unstable 경고 | 사전 Hz | 실행 중 진단 Hz | 입력 수 | 입력 p95 ms |
| --- | --- | --- | --- | --- | --- |
| 1 | False | 60 | 60 | 19 | 217.67 |
| 2 | False | 60 | 60 | 19 | 209.58 |
| 3 | False | 60 | 60 | 19 | 214.34 |


3/3 실행 모두 unstable 경고가 없고 각 19건이다. 전체 실행 p95 평균과 경고 없는 실행 p95 평균은 모두 **213.86ms**다. 57개 입력을 합쳐 다시 계산한 pooled p95는 두 경우 모두 **214.58ms**다. 두 집계 방식을 구분하며 표본 제거는 없다.

## 재현과 원자료

```sh
B4_COUNTERS=on npm run build -- --outDir /private/tmp/mini-react-b4-prod-on
B4_COUNTERS=off npm run build -- --outDir /private/tmp/mini-react-b4-prod-off
# preview 두 명령은 각각 별도 터미널에서 실행
npm run preview -- --host 127.0.0.1 --port 5182 --outDir /private/tmp/mini-react-b4-prod-on
npm run preview -- --host 127.0.0.1 --port 5183 --outDir /private/tmp/mini-react-b4-prod-off
# 별도 터미널, 전용 headed Chrome :9331 및 dev :5181 사용
node lab/dev/measure-b4-diagnostics.mjs /private/tmp/fiber-b4-diagnostics production
node lab/dev/measure-b4-diagnostics.mjs /private/tmp/fiber-b4-diagnostics attempt-original
node lab/dev/measure-b4-diagnostics.mjs /private/tmp/fiber-b4-diagnostics trace
node lab/dev/analyze-b4-diagnostics.mjs docs/results/fiber-b4-diagnostics
```

[분석 JSON](../results/fiber-b4-diagnostics/analysis.json), [기존 runner probe](../results/fiber-b4-diagnostics/attempt-original.json.gz), [초기 단일 API probe](../results/fiber-b4-diagnostics/attempt.json.gz), [프로덕션 72회](../results/fiber-b4-diagnostics/production.json.gz), [trace 세션 계측](../results/fiber-b4-diagnostics/trace.json.gz), [fiber trace](../results/fiber-b4-diagnostics/final-attempt-fiber.trace.json.gz), [bailout trace](../results/fiber-b4-diagnostics/final-attempt-fiber-bailout.trace.json.gz). gzip은 손실 없이 압축한 원자료이며 분석 도구가 직접 읽는다. phase별 provenance에 커밋·작업 트리·순서를 보존했다.

B-4 승인 후 진단에서 멈춘다. B-5·엔진/앱 개선·푸시·PR은 진행하지 않았다.
