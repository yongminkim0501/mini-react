# B-4 · fiber-bailout

2026-11-10 · `feat/fiber-engine` · `/private/tmp/mini-react-fiber-engine`

## 구현 범위

사용자가 rev2를 승인한 범위에서 `fiber-bailout` 모드를 추가했다. 코드 커밋은 `9b3084e`이며 측정 시작 시 작업 트리는 깨끗했다. 푸시·PR은 하지 않았다. 기존 fiber의 레인·업데이트 큐·중단/재시작·스케줄러·인덱스 비교 의미는 유지한다. `src/core`, `src/runtime`, `lab/data.js`와 Heatmap/Row/Cell 등 자식 함수는 수정하지 않았다. 앱 예외는 App 루트 두 useMemo뿐이다.

경계 기록은 host 부모 Fiber의 current/WIP에만 있다. 같은 부모, 투명 확장 경로와 평탄화 인덱스에서 같은 VComponent 객체이고 단일 host를 반환할 때 적중한다. 경계 host 헤더 하나만 WIP로 초기화해 새 return/sibling에 연결하고 공유 자손에는 진입하지 않는다. 경계 헤더의 조상 key 전달 변경은 별도 처리할 수 있으나 공유 구간은 Commit 변경 목록에 들어가지 않는다. 중첩된 투명 경계의 기록도 보존한다. 이후 미스에서는 기존 alternate를 초기화하고 방문 경로의 부모 연결을 재구성한다. 기존 alternate 연결 bookkeeping 외에 current의 경계·자손·Hook 상태를 Render에서 덮어쓰지 않는다.

텍스트·빈 출력·다중 host는 기존 경로로 fallback한다. 전역 mutable 경계 캐시는 없다. 자식 순수성·입력 불변성 계약을 유지한다. 제자리 수정 + 같은 VNode는 이전 화면을 유지하고 새 VNode는 갱신한다. 캐시된 위임 핸들러는 해당 VNode의 props와 일치하며 onSelect는 함수형 갱신이라 오래된 selected를 읽지 않는다. 행별 캐시·같은 셀 좌표 고정·key 매칭·prop별 얕은 비교는 구현하지 않았다.

## 변경 파일과 결정

| 파일 | 변경 |
| --- | --- |
| `src/fiber/workLoop.ts`, `types.ts` | 단일 host 경계 기록, 위치/동일성 판정, 헤더 복제와 공유, fallback |
| `src/fiber/index.ts`, `root.ts` | 별도 모드와 attempt 카운터, Commit/폐기 스냅샷 |
| `src/fiber/counters.ts`, `commit.ts`, `dom.ts` | Render/Commit/DOM/핸들러/적중·미스 카운터 |
| `src/fiber/bailout.test.ts`, `b4-prerequisites.test.ts` | 연속 적중·첫 미스·중단·계약·상태 버전 oracle |
| `lab/app/heatmap-app.js` | 승인한 루트 useMemo 두 개와 기존 반환 위치 대체 |
| `lab/engine-adapter.js`, `params.js`, `main.js`, `runner.js` | 같은 빌드의 current/cached 선택, 6개 조합 교차 실행 |
| `lab/metrics.js` | attempt 원자료와 committed/Sync/aborted 카운터 합계 |
| `lab/fiber-differential.test.js`, `lab.test.js`, `runner.test.js` | 모든 앱 변형의 DOM/title 차등, 파라미터·6개 조합 순서 |
| `lab/dev/measure-fiber-sync.mjs`, `summarize-bailout.mjs` | `--b4` 측정, 보존된 원자료의 카운터 재집계·불변식 검증 |
| `README.md`, `docs/decisions.md` | 카운터 정의·쿼리·판단 기록 |

결정은 [B35~B39](../decisions.md)에 이어 기록했다. B35는 승인과 소유권, B36은 앱 변형/Hook 고정 수, B37은 카운터·미스 분류·stack N/A, B38은 정확성/교차 순서, B39는 실측 결과다.

## 앱 변경 diff 전문

`current`는 새 두 useMemo에 undefined deps를 주어 이전처럼 매 렌더 새 함수와 새 VNode를 만든다. `cached`만 승인된 deps를 사용한다. 두 변형 모두 Hook 수가 고정된다. **가정:** current도 두 Hook 호출/슬롯의 작은 추가 비용이 있으므로 과거 B-3 코드와 바이트 단위 동일한 대조군은 아니다. 이번 같은 빌드 내 비교로 해석한다.

```diff
diff --git a/lab/app/heatmap-app.js b/lab/app/heatmap-app.js
index 1ffe65e..00bf312 100644
--- a/lab/app/heatmap-app.js
+++ b/lab/app/heatmap-app.js
@@ -225,7 +225,14 @@ export function createHeatmapApp(engine) {
       setQuery(value);
       startTransition(() => setMatchQuery(value));
     };
-    const onSelect = (server, minute) => setSelected((prev) => ({ server, minute, seq: (prev ? prev.seq : 0) + 1 }));
+    const onSelect = useMemo(
+      () => (server, minute) => setSelected((prev) => ({ server, minute, seq: (prev ? prev.seq : 0) + 1 })),
+      props.appVariant === 'cached' ? [setSelected] : undefined,
+    );
+    const heatmapVNode = useMemo(
+      () => h(Heatmap, { data, matches, slo, selected, cellCost: props.cellCost, onSelect }),
+      props.appVariant === 'cached' ? [data, matches, slo, selected, props.cellCost, onSelect] : undefined,
+    );
 
     return h(
       'div',
@@ -250,7 +257,7 @@ export function createHeatmapApp(engine) {
         h(DetailPanel, { data, selected }),
         h(ClickCounter, { count: selected ? selected.seq : 0 }),
       ),
-      h(Heatmap, { data, matches, slo, selected, cellCost: props.cellCost, onSelect }),
+      heatmapVNode,
     );
   }
```

## 검증

| 명령 | 실제 결과 |
| --- | --- |
| `npm run test:run` | 34개 파일, 353개 테스트 통과 |
| `npm run typecheck` | tsc --noEmit, 종료 코드 0 |
| `npm run build` | 타입 검사 + Vite 빌드 통과 |
| `git diff --check` | 통과 |

네 전제 테스트를 fiber/fiber-bailout 양쪽에 유지했다. 네 번 연속 적중 후 첫 미스의 깊은 텍스트·삽입·삭제와 핸들러, 중첩 기록 보존, 위치/부모 이동, 조상 key 전달, 텍스트 병합·다중 반환·빈 출력 fallback, 불변성 계약 짝을 검증했다. 고정 seed `0xB400`의 40개 상태 버전 스크립트는 Sync·Transition·재클릭에 해당하는 반복 선택·중단을 섞어 두 모드에 격리해 재생했다. 각 Commit의 적용된 상태 버전을 독립 HTML oracle에 맞추고 passive effect drain 후 title을 검사했다. 중간 Commit 수가 달라도 n번째 Commit끼리 짝짓지 않는다. 실제 히트맵의 검색·수신·선택·같은 셀 재클릭·SLO·크기 변경·반복 수신 DOM/title도 6개 조합에서 stack과 일치했다.

카운터·불변식 결과는 다음 명령으로 원자료에서 다시 산출할 수 있다.

```sh
node lab/dev/summarize-bailout.mjs docs/results/fiber-bailout-b4/fiber-bailout-cross.json docs/results/fiber-bailout-b4
```

## 측정 방법과 환경

20k, seed=42, cellCost=0. 같은 Chrome 세션에서 `?engines=stack,fiber,fiber-bailout&apps=current,cached&size=20000&runs=3&autorun=1`. 시나리오마다 조합별 워밍업 1회를 버린 뒤 current/stack → current/fiber → current/fiber-bailout → cached/stack → cached/fiber → cached/fiber-bailout 순서를 3회 반복했다. 코드/브라우저/viewport/전원/각 실행의 주사율은 [원자료](../results/fiber-bailout-b4/fiber-bailout-cross.json)에 있다.

B-3의 고정 사전 프레임 예산·LoAF·예정 시각 기준 지연·종료 대기 정의를 유지한다. 카운터를 추가한 이번 세션에서 비교하며 과거 B-3과 직접 성능비를 만들지 않는다. 건당 시간·fps·구간 p95는 실행별 값의 3회 평균, 최장 Long Task는 세 실행 전체 최댓값이다. 표본이 작아 인과·통계적 유의성을 주장하지 않는다.

| 환경 | 값 |
| --- | --- |
| 코드 / 작업 트리 | 9b3084e7ab2f561760c8f19100ec651ca9139f34 / clean |
| 브라우저 | Chromium 153.0.8010.12, Not_A Brand 8.0.0.0 |
| 전원 | {'charging': True, 'level': 1} |
| OS | macOS 15.1 (24B2083) |
| viewport / DPR | 1280x720 / 2 |
| 논리 코어 | 10 |
| 실행 | headed Chrome, CPU throttle 1배, Vite 개발 서버 |
| 사전 / 실행 중 Hz | [60] / [10, 26, 40, 48, 60] |
| LoAF / Long Task | True / True |
| 시나리오 시작 UTC | 2026-11-10T12:33:27.347Z ~ 2026-11-10T12:41:43.075Z |
| 경고 실행 수 | 10 (실행 중 rAF 진단 빈도 저하; 사전 예산은 모두 60Hz로 고정) |


## 교차 측정

| 시나리오 | 앱 | 엔진 | 건당 Render+Commit 경과 ms | 건당 작업 ms | 최장 LT ms | 지연 p95 ms | 끊긴 프레임 | 진행 바 fps | 실행 중 Hz |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | current | stack | 100.9 | 100.9 | 102.0 | N/A | 5.0 | 55.5 | 60.0 |
| S1 | current | fiber | 373.6 | 145.1 | 72.0 | N/A | 8.3 | 55.7 | 60.0 |
| S1 | current | fiber-bailout | 432.3 | 157.4 | 70.0 | N/A | 8.7 | 55.5 | 60.0 |
| S1 | cached | stack | 102.4 | 102.4 | 109.0 | N/A | 4.3 | 56.3 | 60.0 |
| S1 | cached | fiber | 380.1 | 144.9 | 76.0 | N/A | 7.3 | 55.7 | 60.0 |
| S1 | cached | fiber-bailout | 389.0 | 159.5 | 68.0 | N/A | 7.3 | 56.3 | 60.0 |
| S2 | current | stack | 66.0 | 66.0 | 90.0 | 144.3 | 21.0 | 30.8 | 60.0 |
| S2 | current | fiber | 85.5 | 78.0 | 88.0 | 107.6 | 23.0 | 25.7 | 53.3 |
| S2 | current | fiber-bailout | 98.3 | 89.9 | 100.0 | 213.9 | 22.0 | 22.0 | 60.0 |
| S2 | cached | stack | 65.7 | 65.7 | 89.0 | 144.2 | 20.7 | 31.1 | 60.0 |
| S2 | cached | fiber | 85.7 | 79.1 | 89.0 | 111.5 | 22.3 | 24.9 | 60.0 |
| S2 | cached | fiber-bailout | 22.2 | 7.2 | 59.0 | 27.5 | 3.0 | 55.8 | 60.0 |
| S3 | current | stack | 66.2 | 66.2 | 181.0 | 186.4 | 16.3 | 38.8 | 60.0 |
| S3 | current | fiber | 97.0 | 82.4 | 83.0 | 101.8 | 21.3 | 32.3 | 53.3 |
| S3 | current | fiber-bailout | 108.1 | 93.5 | 97.0 | 114.8 | 22.3 | 28.4 | 56.0 |
| S3 | cached | stack | 66.4 | 66.4 | 180.0 | 190.0 | 17.0 | 38.2 | 60.0 |
| S3 | cached | fiber | 95.5 | 82.5 | 80.0 | 102.2 | 21.7 | 31.4 | 60.0 |
| S3 | cached | fiber-bailout | 107.3 | 93.9 | 98.0 | 112.5 | 20.0 | 30.1 | 60.0 |
| S4 | current | stack | 101.4 | 101.4 | 182.0 | N/A | 28.7 | 10.8 | 35.3 |
| S4 | current | fiber | 319.8 | 144.6 | 79.0 | N/A | 33.7 | 34.1 | 60.0 |
| S4 | current | fiber-bailout | 397.4 | 159.7 | 81.0 | N/A | 28.7 | 37.9 | 60.0 |
| S4 | cached | stack | 101.6 | 101.6 | 180.0 | N/A | 29.0 | 10.6 | 25.3 |
| S4 | cached | fiber | 318.2 | 145.7 | 82.0 | N/A | 35.7 | 33.6 | 53.3 |
| S4 | cached | fiber-bailout | 361.3 | 159.0 | 77.0 | N/A | 32.3 | 35.6 | 60.0 |


## 긴 프레임 분류

LoAF의 스크립트/렌더링 구간으로 우세 원인을 분류한 실행별 건수·합계 시간의 3회 평균이다. 브라우저 Layout/Paint는 bailout 범위 밖이다.

| 시나리오 | 앱 | 엔진 | JS 우세 수 | JS 우세 합계 ms | 렌더링 우세 수 | 렌더링 우세 합계 ms | 원인 미확인 수 | script 합계 ms | rendering 합계 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | current | stack | 3.0 | 405.8 | 0.0 | 0.0 | 0.0 | 303.2 | 100.8 |
| S1 | current | fiber | 2.3 | 160.3 | 0.7 | 45.7 | 0.0 | 104.2 | 101.4 |
| S1 | current | fiber-bailout | 2.3 | 160.0 | 0.7 | 45.5 | 0.0 | 105.3 | 99.9 |
| S1 | cached | stack | 3.0 | 411.7 | 0.0 | 0.0 | 0.0 | 307.6 | 101.9 |
| S1 | cached | fiber | 2.7 | 188.9 | 0.3 | 22.9 | 0.0 | 107.4 | 102.4 |
| S1 | cached | fiber-bailout | 3.0 | 205.4 | 0.0 | 0.0 | 0.0 | 107.1 | 98.0 |
| S2 | current | stack | 19.0 | 1,419.6 | 0.0 | 0.0 | 0.0 | 1,255.7 | 152.4 |
| S2 | current | fiber | 19.0 | 1,572.3 | 1.0 | 54.1 | 0.0 | 1,515.2 | 54.0 |
| S2 | current | fiber-bailout | 19.0 | 1,799.0 | 0.3 | 18.0 | 0.0 | 1,720.0 | 33.2 |
| S2 | cached | stack | 19.0 | 1,417.9 | 0.0 | 0.0 | 0.0 | 1,250.8 | 153.9 |
| S2 | cached | fiber | 19.0 | 1,590.5 | 1.0 | 52.0 | 0.0 | 1,528.3 | 54.8 |
| S2 | cached | fiber-bailout | 0.0 | 0.0 | 0.3 | 16.8 | 0.0 | 6.2 | 10.6 |
| S3 | current | stack | 11.0 | 811.1 | 0.0 | 0.0 | 0.0 | 730.7 | 68.5 |
| S3 | current | fiber | 11.0 | 966.8 | 0.0 | 0.0 | 0.0 | 851.6 | 64.6 |
| S3 | current | fiber-bailout | 11.0 | 1,135.2 | 0.0 | 0.0 | 0.0 | 970.8 | 62.8 |
| S3 | cached | stack | 11.0 | 826.4 | 0.0 | 0.0 | 0.0 | 733.5 | 69.0 |
| S3 | cached | fiber | 11.0 | 973.8 | 0.3 | 18.3 | 0.0 | 852.6 | 63.8 |
| S3 | cached | fiber-bailout | 10.7 | 1,074.1 | 0.7 | 45.1 | 0.0 | 966.5 | 64.0 |
| S4 | current | stack | 29.0 | 3,987.4 | 0.0 | 0.0 | 0.0 | 2,952.4 | 988.6 |
| S4 | current | fiber | 13.3 | 935.1 | 2.7 | 188.1 | 0.0 | 552.8 | 484.9 |
| S4 | current | fiber-bailout | 11.0 | 779.2 | 2.3 | 165.8 | 0.0 | 485.3 | 417.7 |
| S4 | cached | stack | 29.0 | 3,991.6 | 0.0 | 0.0 | 0.0 | 2,953.0 | 995.0 |
| S4 | cached | fiber | 14.0 | 970.7 | 2.7 | 187.5 | 0.0 | 573.5 | 495.8 |
| S4 | cached | fiber-bailout | 13.3 | 933.4 | 1.3 | 87.7 | 0.0 | 504.9 | 437.4 |


## S2·S3 지연 분해

각 구간은 각각의 p95를 3회 평균했다. 합산해 총 p95로 읽지 않는다. fiber 계열은 Sync 렌더, stack은 해당 이벤트를 처리한 렌더에 연결한다.

| 시나리오 | 앱 | 엔진 | 예정→이벤트 ms | 이벤트→렌더 ms | 렌더→커밋 ms | 커밋→rAF ms | 총 지연 p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S2 | current | stack | 80.5 | 0.1 | 77.1 | 0.5 | 144.3 |
| S2 | current | fiber | 27.8 | 0.1 | 77.6 | 5.7 | 107.6 |
| S2 | current | fiber-bailout | 122.3 | 0.1 | 91.7 | 7.0 | 213.9 |
| S2 | cached | stack | 80.6 | 0.1 | 77.5 | 1.0 | 144.2 |
| S2 | cached | fiber | 29.0 | 0.2 | 80.2 | 5.4 | 111.5 |
| S2 | cached | fiber-bailout | 23.2 | 0.1 | 0.3 | 5.2 | 27.5 |
| S3 | current | stack | 123.5 | 0.2 | 63.2 | 0.3 | 186.4 |
| S3 | current | fiber | 20.9 | 0.2 | 78.5 | 6.6 | 101.8 |
| S3 | current | fiber-bailout | 22.1 | 0.1 | 91.1 | 4.6 | 114.8 |
| S3 | cached | stack | 126.1 | 0.2 | 63.7 | 0.3 | 190.0 |
| S3 | cached | fiber | 21.3 | 0.1 | 78.6 | 6.4 | 102.2 |
| S3 | cached | fiber-bailout | 20.7 | 0.1 | 92.1 | 5.2 | 112.5 |


## Sync 비용·폐기·최종 반영

Sync Render/전체 작업 시간과 최종 반영은 실행별 평균, 폐기 수/시간은 3회 합계다. stack에는 Sync 레인과 폐기 개념이 없으므로 N/A다. 입력 종료→최종 히트맵은 마지막 이벤트 발사 직후부터 모든 레인이 끝난 idle Commit 다음 rAF까지다.

| 시나리오 | 앱 | 엔진 | Sync 수/실행 | Sync Render 작업 ms | Sync 전체 작업 ms | 폐기 Transition 수 | 폐기 작업 합계 ms | 입력 종료→최종 히트맵 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S2 | current | stack | N/A | N/A | N/A | N/A | N/A | 63.6 |
| S2 | current | fiber | 19.0 | 75.2 | 75.3 | 54 | 397.1 | 355.7 |
| S2 | current | fiber-bailout | 19.0 | 87.3 | 87.3 | 54 | 277.9 | 392.1 |
| S2 | cached | stack | N/A | N/A | N/A | N/A | N/A | 63.3 |
| S2 | cached | fiber | 19.0 | 76.4 | 76.5 | 54 | 360.2 | 340.8 |
| S2 | cached | fiber-bailout | 19.0 | 0.2 | 0.2 | 54 | 1,628.7 | 452.2 |
| S3 | current | stack | N/A | N/A | N/A | N/A | N/A | 63.1 |
| S3 | current | fiber | 10.0 | 75.6 | 75.7 | 30 | 1,458.0 | 399.0 |
| S3 | current | fiber-bailout | 10.0 | 86.9 | 87.0 | 30 | 1,380.2 | 412.7 |
| S3 | cached | stack | N/A | N/A | N/A | N/A | N/A | 62.1 |
| S3 | cached | fiber | 10.0 | 76.0 | 76.0 | 30 | 1,431.2 | 372.9 |
| S3 | cached | fiber-bailout | 10.0 | 87.3 | 87.4 | 30 | 1,301.4 | 417.0 |


## S4: 건당 비용과 실행 전체

데이터를 연속 수신하므로 커밋/수신 수가 다를 수 있다. fps만으로 처리량 증가를 주장하지 않는다.

| 앱 | 엔진 | 수신/실행 | 커밋/실행 | 커밋당 경과 ms | 커밋당 작업 ms | 작업 합계 ms/실행 | 실행 전체 ms | 진행 바 fps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current | stack | 29.0 | 29.0 | 101.4 | 101.4 | 2,940.8 | 5,633.3 | 10.8 |
| current | fiber | 196.0 | 14.0 | 319.8 | 144.6 | 2,023.1 | 5,635.6 | 34.1 |
| current | fiber-bailout | 199.3 | 12.0 | 397.4 | 159.7 | 1,916.4 | 5,683.1 | 37.9 |
| cached | stack | 29.0 | 29.0 | 101.6 | 101.6 | 2,946.5 | 5,649.2 | 10.6 |
| cached | fiber | 202.0 | 14.3 | 318.2 | 145.7 | 2,087.2 | 5,619.1 | 33.6 |
| cached | fiber-bailout | 203.3 | 12.7 | 361.3 | 159.0 | 2,014.1 | 5,600.7 | 35.6 |


## 카운터

[전체 카운터 표 CSV](../results/fiber-bailout-b4/counters.csv)에는 **모든 rev2 카운터와 세 미스 이유**를 시나리오·앱·엔진·커밋/Sync/폐기·total/inside/outside별로 집계했다. 0 attempt 그룹은 합계 0이며 stack은 수정 금지 범위를 지켜 N/A다. [요약 JSON](../results/fiber-bailout-b4/summary.json), [불변식 검사](../results/fiber-bailout-b4/validation.json)도 보존했다. 아래 카운터는 heatmap 루트의 3회 합계이며 시간 평균과 혼동하지 않는다. outside는 이 루트의 SearchBar·툴바·상세·경계 헤더·Hook 처리다. 별도 ProgressApp 루트의 카운터는 이 합계에 포함하지 않고 진행 바 fps를 별도로 기록한다.

Heatmap 함수 호출은 inside, host 경계 헤더는 outside, 하위 자손은 inside다. liveDomWrites는 엔진 API 호출 수(외부 입력 주입 제외), detachedDomOps는 새 노드 조립, eventHandlerWrites는 핸들러 표 갱신이다. commitFiberVisits=effect+anchor, commitHookVisits는 루트 Hook 반영/레인 재계산이다. 브라우저 내부 DOM 처리·Layout/Paint 비용은 이 숫자에 포함되지 않는다.

| 시나리오 | 앱 | 엔진 | 루트 호출 | 자식 호출 | Render 방문 | Render 단위 | Commit 방문 | Hook 방문 | live DOM | detached | 핸들러 표 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | current | stack | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| S1 | current | fiber | 9 | 181854 | 185760 | 1474416 | 174960 | 216 | 211230 | 0 | 45 |
| S1 | current | fiber-bailout | 9 | 181854 | 185760 | 1474416 | 174960 | 216 | 211230 | 0 | 45 |
| S1 | cached | stack | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| S1 | cached | fiber | 9 | 181854 | 185760 | 1474416 | 174960 | 216 | 211230 | 0 | 45 |
| S1 | cached | fiber-bailout | 9 | 181854 | 185760 | 1474416 | 174960 | 216 | 211230 | 0 | 45 |
| S2 | current | stack | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| S2 | current | fiber | 60 | 1212360 | 1238460 | 9829680 | 60360 | 1440 | 60117 | 3 | 300 |
| S2 | current | fiber-bailout | 60 | 1212360 | 1238460 | 9829680 | 60360 | 1440 | 60117 | 3 | 300 |
| S2 | cached | stack | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| S2 | cached | fiber | 60 | 1212360 | 1238460 | 9829680 | 60360 | 1440 | 60117 | 3 | 300 |
| S2 | cached | fiber-bailout | 60 | 60903 | 64260 | 504195 | 60303 | 1440 | 60117 | 3 | 243 |
| S3 | current | stack | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| S3 | current | fiber | 33 | 666798 | 681714 | 5409228 | 58747 | 792 | 72796 | 111 | 165 |
| S3 | current | fiber-bailout | 33 | 666798 | 681714 | 5409228 | 58747 | 792 | 72796 | 111 | 165 |
| S3 | cached | stack | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| S3 | cached | fiber | 33 | 666798 | 681714 | 5409228 | 58747 | 792 | 72796 | 111 | 165 |
| S3 | cached | fiber-bailout | 33 | 666798 | 681714 | 5409228 | 58747 | 792 | 72796 | 111 | 165 |
| S4 | current | stack | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| S4 | current | fiber | 42 | 848652 | 866880 | 6880608 | 819059 | 1008 | 995755 | 0 | 210 |
| S4 | current | fiber-bailout | 36 | 727416 | 743040 | 5897664 | 702584 | 864 | 856822 | 0 | 180 |
| S4 | cached | stack | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| S4 | cached | fiber | 43 | 868858 | 887520 | 7044432 | 839496 | 1032 | 1021049 | 0 | 215 |
| S4 | cached | fiber-bailout | 38 | 767828 | 784320 | 6225312 | 741442 | 912 | 900623 | 0 | 190 |


### 적중·미스 이유

초기 마운트는 측정 창 밖이다. 부모 안에서 같은 VNode가 이동하면 position, 부모 자체가 바뀌어 이전 기록이 없으면 different VComponent로 집계한다. 미지원 형태는 fallback을 우선한다. 애플리케이션의 주 경로는 단일 host여서 fallback/position 수치가 0일 수 있으며 단위 테스트에서 별도 검증했다.

| 시나리오 | 앱 | 영역 | 적중 | 미스 | 다른 VComponent | 다른 위치 | fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | current | inside | 0 | 181809 | 181809 | 0 | 0 |
| S1 | current | outside | 0 | 45 | 45 | 0 | 0 |
| S1 | cached | inside | 0 | 181809 | 181809 | 0 | 0 |
| S1 | cached | outside | 0 | 45 | 45 | 0 | 0 |
| S2 | current | inside | 0 | 1212060 | 1212060 | 0 | 0 |
| S2 | current | outside | 0 | 300 | 300 | 0 | 0 |
| S2 | cached | inside | 57 | 60603 | 60603 | 0 | 0 |
| S2 | cached | outside | 0 | 300 | 300 | 0 | 0 |
| S3 | current | inside | 0 | 666633 | 666633 | 0 | 0 |
| S3 | current | outside | 0 | 165 | 165 | 0 | 0 |
| S3 | cached | inside | 0 | 666633 | 666633 | 0 | 0 |
| S3 | cached | outside | 0 | 165 | 165 | 0 | 0 |
| S4 | current | inside | 0 | 727236 | 727236 | 0 | 0 |
| S4 | current | outside | 0 | 180 | 180 | 0 | 0 |
| S4 | cached | inside | 0 | 767638 | 767638 | 0 | 0 |
| S4 | cached | outside | 0 | 190 | 190 | 0 | 0 |


### Sync Heatmap 내부

| 시나리오 | 앱 | 엔진 | 자식 호출 | Render 방문 | Commit 방문 | live DOM | 적중 | 미스 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S2 | current | stack | N/A | N/A | N/A | N/A | N/A | N/A |
| S2 | current | fiber | 1151457 | 1174200 | 0 | 0 | 0 | 0 |
| S2 | current | fiber-bailout | 1151457 | 1174200 | 0 | 0 | 0 | 1151457 |
| S2 | cached | stack | N/A | N/A | N/A | N/A | N/A | N/A |
| S2 | cached | fiber | 1151457 | 1174200 | 0 | 0 | 0 | 0 |
| S2 | cached | fiber-bailout | 0 | 0 | 0 | 0 | 57 | 0 |
| S3 | current | stack | N/A | N/A | N/A | N/A | N/A | N/A |
| S3 | current | fiber | 606030 | 618000 | 57 | 57 | 0 | 0 |
| S3 | current | fiber-bailout | 606030 | 618000 | 57 | 57 | 0 | 606030 |
| S3 | cached | stack | N/A | N/A | N/A | N/A | N/A | N/A |
| S3 | cached | fiber | 606030 | 618000 | 57 | 57 | 0 | 0 |
| S3 | cached | fiber-bailout | 606030 | 618000 | 57 | 57 | 0 | 606030 |


### 폐기 attempt

| 시나리오 | 앱 | 엔진 | 폐기 attempt | 내부 자식 호출 | 내부 Render 방문 | 내부 DOM 쓰기 | 내부 적중 | 내부 미스 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | current | fiber | 0 | 0 | 0 | 0 | 0 | 0 |
| S1 | current | fiber-bailout | 0 | 0 | 0 | 0 | 0 | 0 |
| S1 | cached | fiber | 0 | 0 | 0 | 0 | 0 | 0 |
| S1 | cached | fiber-bailout | 0 | 0 | 0 | 0 | 0 | 0 |
| S2 | current | fiber | 54 | 6246 | 0 | 0 | 0 | 0 |
| S2 | current | fiber-bailout | 54 | 3876 | 0 | 0 | 0 | 3823 |
| S2 | cached | fiber | 54 | 5408 | 0 | 0 | 0 | 0 |
| S2 | cached | fiber-bailout | 54 | 191908 | 183833 | 0 | 0 | 191892 |
| S3 | current | fiber | 30 | 221626 | 221221 | 0 | 0 | 0 |
| S3 | current | fiber-bailout | 30 | 179961 | 178183 | 0 | 0 | 179952 |
| S3 | cached | fiber | 30 | 218055 | 217386 | 0 | 0 | 0 |
| S3 | cached | fiber-bailout | 30 | 171233 | 168955 | 0 | 0 | 171222 |
| S4 | current | fiber | 0 | 0 | 0 | 0 | 0 | 0 |
| S4 | current | fiber-bailout | 0 | 0 | 0 | 0 | 0 | 0 |
| S4 | cached | fiber | 0 | 0 | 0 | 0 | 0 | 0 |
| S4 | cached | fiber-bailout | 0 | 0 | 0 | 0 | 0 | 0 |


## 해석과 한계

최소 캐시 앱 + fiber-bailout의 **S2 Sync Render 작업은 76.435→0.225ms(약 99.7% 감소)**, 예정 시각 기준 입력 p95는 111.5→27.5ms였다. 57개 Sync Commit 모두 Heatmap 내부 childCalls·Render 방문/단위·Commit 방문·live DOM·detached·핸들러 표 쓰기가 0이고 경계 적중은 각 1회였다. cached + fiber에서는 내부 함수 호출 1,151,457회와 Render 방문 1,174,200회가 남았다. 루트 실행과 작은 외부 UI 갱신은 생략하지 않았다.

남은 S2 지연은 예정→이벤트 23.2ms, 렌더→커밋 0.3ms, 커밋→다음 rAF 5.2ms(p95 각각)로, 주된 대기가 전체 트리 Sync 재조정에서 이벤트 도착 대기·브라우저 프레임 기회 쪽으로 옮겨갔다. 각 p95는 합산하지 않는다. cached + fiber-bailout의 S2 JS 우세 LoAF는 0, 50ms 초과 Render 작업 구간도 0이었다. 렌더링 우세 긴 프레임은 평균 0.3개 남았다.

응답과 최종 완료는 다르다. cached S2의 입력 종료→최종 히트맵은 **340.8→452.2ms**로 늘었고, 폐기 Transition 수는 54회로 같지만 폐기 작업은 **360.2→1,628.7ms(3회 합계)**로 증가했다. 짧아진 Sync 사이에 낮은 레인 작업이 더 진행된 뒤 버려진 결과와 일치한다. 내부 폐기 Render 방문도 0→183,833회였다. 단, 폐기 포함 전체 작업 합계는 실행당 1,702.3→686.0ms로 줄었다. 이 결과를 최종 강조 표시가 빨라졌다고 해석하지 않는다.

S3는 selected가 매 클릭 새 객체이므로 경계 적중 0, Sync 내부 자식 호출 606,030회·Render 방문 618,000회·DOM 쓰기 57회였다. **DOM 변경이 작아도 함수 재실행 범위는 크다.** cached + fiber의 Sync Render 76.0ms에 비해 bailout은 87.3ms, 클릭 p95는 102.2→112.5ms로 증가했다. 이번 승인은 행별 클릭 최적화를 포함하지 않는다. 같은 셀 재클릭도 실제 앱 차등 테스트에서 seq가 2로 증가함을 확인했다.

current 앱 + fiber-bailout의 적중은 모든 시나리오에서 0이었다. S2 Sync Render는 75.2→87.3ms였고 p95는 107.6→213.9ms로 악화됐다. 분해에서 예정→이벤트 대기가 27.8→122.3ms로 증가했다. 전체 재조정에 경계 기록 비용까지 더해져 입력 처리 간격을 압박한 것으로 해석한다. 앱 캐시 없이 모드만 켜는 것은 이 실험에서 이점이 없었다.

S1·S4도 적중 0이며 변경되는 데이터에 대한 계산은 생략하지 않았다. fiber 대비 커밋당 작업 시간 증가는 S1 current/cached에서 약 **8.5%/10.1%**, S4에서 **10.5%/9.1%**였다. 경계 기록·조회·추가 객체 관리와 카운터를 포함한 관측 오버헤드로 보고하며, 모든 차이를 단일 메모리 연산에 귀속하지 않는다. S4 cached 진행 바는 33.6→35.6fps였지만 커밋은 실행당 14.3→12.7회로 줄었다. 처리량 개선으로 주장하지 않는다. S1·S4의 시간 조각 Render에서 50ms 초과 작업 구간은 0이었지만, 동기 DOM Commit과 브라우저 렌더링을 포함한 긴 Task/LoAF는 남았다.

사전 추정은 **72회 모두 60Hz, 예산 16.67ms(끊김 기준 34.33ms)**였다. 실행 중 rAF 간격으로 계산한 진단값이 10~60Hz로 떨어진 실행 10개에 `in-run-refresh-unstable` 경고가 있다. 이는 물리 디스플레이 주사율이 변경됐다는 증거가 아니다. 예산을 실행 중 값으로 바꾸거나 경고 표본을 제거하지 않았다. S2 cached의 세 엔진은 3회 모두 경고가 없었고, S4의 미세한 fps 차이는 경고와 처리량 차이를 함께 보고 제한적으로 해석한다. 경고 실행 목록은 validation.json에 있다.

72회 모두 미완료 입력·클릭은 0, total=inside+outside·미스 사유 합계·Commit 방문 합계 불일치는 0, 폐기 attempt의 live DOM 쓰기는 0이었다. 카운터는 엔진 API 호출 수이며 브라우저 내부 DOM/페인트 비용을 대체하지 않는다. stack 카운터와 별도 ProgressApp 루트의 세부 카운터는 이 표에서 측정하지 않았다.

B-4에서 멈춘다. 행 단위 클릭 최적화 등 후속 범위는 시작하지 않았고 원격 push/PR도 하지 않았다.
