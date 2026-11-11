# B-1.5 / B-2 · 지표 수정과 fiber-slice

2026-11-10 · 브랜치 `feat/fiber-engine` · 기준 `baseline-stack` (`ef08734`)

## 범위와 승인

사용자가 B-1 결과를 승인하고 B-1.5 지표 변경 후 B-2를 진행하도록 지시했다. B-1.5는 `29b2d55`, B-2 구현은 `d388e27`, 측정 경계·클릭 집계 보완은 `485435c`에 로컬 커밋했다. 최종 측정 코드는 `485435c`다. B-3의 레인·선점·재시작은 추가하지 않았다. 푸시와 PR은 하지 않는다.

작업 위치는 `/private/tmp/mini-react-fiber-engine`이다. Claude의 원래 worktree와 브랜치는 유지했다. `src/core/**`, `src/runtime/**`, `lab/data.js`는 기준 태그와 동일하고, 이번 작업에서는 앱 파일을 추가로 변경하지 않았다. 앱의 기존 차이는 B-0에서 승인한 onRegenerate의 startTransition 한 줄뿐이다.

## B-1.5 지표 수정

### 실행 전 예산 고정

각 실행 직전에 rAF 간격 120개를 추정해 `preRunHz`와 `preRunBudgetMs=1000/preRunHz`를 고정한다. 끊김은 `간격 > 예산×2+1ms`다. 실행 중 중앙값은 `refreshHzObserved` 진단값으로만 보존한다. 실행 전 비60Hz, 실행 중 추정치 불안정/변화를 경고한다. 실제 디스플레이 주사율과 부하로 낮아진 rAF 빈도를 동일시하지 않는다.

**B-1 JSON에는 간격 배열이 없다.** 따라서 이전 요약 통계만으로 재계산하지 않았다. 이번에 새 정의로 stack·fiber-sync도 함께 측정했고 B-1 자료는 그대로 보존했다. rAF 간격은 양 끝이 측정 창 안에 있는 완전한 표본을 기록한다. 새 결과에는 프레임 간격·진행 바 커밋·업데이트·Long Task·LoAF·Render 작업 구간 원자료와 지표 버전 `B1.5-fixed-pre-run-loaf-v2`를 넣었다.

### LoAF와 긴 프레임 분류

`PerformanceObserver('long-animation-frame')`로 50ms 초과 프레임을 수집한다. 각 프레임에서 다음을 기록한다.

| 필드 | 정의 |
| --- | --- |
| beforeRenderMs | 프레임 시작→renderStart. 경과 시간이며 전부 JS라고 간주하지 않음 |
| rafPhaseMs | renderStart→styleAndLayoutStart. rAF 등 포함 |
| styleAndLayoutMs | styleAndLayoutStart→프레임 끝. 이후 렌더링 단계의 경과 시간 |
| scriptMs | 귀속된 scripts.duration에서 강제 style/layout 시간을 뺀 합계 |
| renderingMs | styleAndLayoutMs+귀속된 강제 style/layout 시간 |
| cause | scriptMs≥renderingMs면 JS 우세, 반대면 렌더링 우세. 둘 다 0이면 미확인 |

경계 값이 0이면 해당 렌더링 구간은 0으로 처리한다. 분류별 개수와 **분류된 프레임 전체 duration의 합계**를 표에 표시한다. 별도의 scriptMs/renderingMs 합계도 기록해 프레임 전체 시간과 혼동하지 않게 했다. 미지원 브라우저에서는 0 대신 측정 불가로 표시한다.

이는 원인 진단용 분류다. LoAF는 짧은 콜백 등의 script 귀속을 누락할 수 있고, 렌더링 경과 구간에는 다른 콜백도 포함될 수 있다. 모든 CPU 시간이나 인과를 완전히 분해한 결과로 주장하지 않는다. [W3C LoAF 초안](https://w3c.github.io/long-animation-frames/)의 경계 정의와 S2·S4 trace를 함께 사용한다. observer 항목은 측정 창과 겹치는 경우 포함하며 원래 시각과 전체 duration, windowOverlap 표시를 보존한다. 경계 프레임 합계에는 창 밖의 일부 시간도 포함될 수 있다. 클릭은 각 이벤트의 예상 순번까지 Commit돼야 완료로 집계한다(B22).

### S4 건당 비용과 전체 비용

건당 지표는 커밋 1건의 Render+Commit 경과 시간과 실제 작업 구간 합계다. 전체 지표는 실행 길이·작업 시간 합계·수신 수·커밋 수·커밋/초·긴 프레임 등이다. B-2에서는 여러 수신 action이 한 렌더에 합쳐지므로 수신 1건과 커밋 1건을 구분한다. 함수형 seed 증가 action은 버리지 않는다.

## B-2 구현

- `src/fiber/scheduler.ts`: MessageChannel 기반 host task, 5ms deadline, shouldYield, 중복 예약 방지, 취소·dispose. 하나의 task에서 루트 하나를 처리하고 남으면 FIFO 뒤로 보내 두 루트가 시간 조각 사이에 순환한다.
- `src/fiber/root.ts`: WIP와 다음 단위 작업을 보존해 재개한다. 양보 중 새 action은 다음 렌더를 예약한다. 현재 스냅샷을 끝내고 Commit한 뒤 미소비 큐로 다음 렌더를 시작한다. 레인 구분이나 렌더 중단·재시작은 없다.
- Render JS 작업 중에만 rendering 플래그를 켠다. 양보 중에는 이벤트가 큐에 들어갈 수 있다. Render에는 실제 DOM 변경이 없으며 Commit은 계속 동기다. unmount는 대기 중 작업을 취소한다.
- root/attempt별 activeMs는 Render 작업 구간의 합계와 Commit 시간으로 계산하며 양보 대기는 제외한다. Render 경과 시간에는 양보가 포함된다. 작업 시간은 OS CPU 시간이 아니다.
- `src/fiber/index.ts`, `lab/engine-adapter.js`: 같은 reconciliation·Hooks·Commit에 동기/분할 스케줄링 정책만 바꿔 연결한다. stack, fiber-sync, fiber-slice를 지원한다.
- `lab/main.js`, `runner.js`: reset 후 heatmap idle, 종료 후 heatmap idle+두 rAF를 세 엔진에 공통 적용했다. 마지막 작업·화면 반영이 창 밖으로 빠지는 것을 줄인다. 진행 바는 계속 움직이므로 모든 루트의 전역 idle을 기다리지 않는다.

5ms는 **단위 작업 사이**의 협력적 양보다. root 함수·단일 useMemo 계산·Commit·GC를 중간에 끊지는 못한다. 기대 결과 달성 여부는 측정으로 판정한다.

## 검증

| 명령 | 실제 결과 |
| --- | --- |
| `npm run test:run` | 30개 파일, 320개 테스트 통과 |
| `npm run typecheck` (`tsc --noEmit`) | 종료 코드 0 |
| `npm run build` | 타입 검사·Vite 빌드 통과, 종료 코드 0 |
| `git diff --check` | 통과 |

추가 검증은 고정 예산 회귀, LoAF 경계·강제 layout 분리·미지원 처리, 5ms 가짜 시계 양보, 중복 예약·루트 순환, MessageChannel 연결, 작은 루트가 큰 루트 Render 도중 Commit, 양보 중 action의 순서 보존과 **현재→다음 스냅샷 두 번 Commit**, unmount 중 취소를 포함한다. 미커밋 클릭의 조기 완료·시작 경계 LoAF/Task 누락에 대한 두 회귀 테스트도 추가했다. 기존 히트맵 차등 시나리오도 세 엔진에 실행해 DOM과 document.title이 같음을 확인했다.

## 측정 조건

`?engines=stack,fiber-sync,fiber-slice&size=20000&seed=42&cellCost=0&runs=3&autorun=1`로 실행했다. 각 시나리오에서 엔진별 워밍업 1회를 버리고 실행 단위로 세 엔진을 순환한다. 같은 headed Chrome·viewport·전원에서 측정하며 trace는 교차 측정과 별도로 수집한다.

각 실행 전 추정과 완료 대기가 추가돼 B-1과 측정 정의·창이 달라졌다. 과거 B-1 숫자를 새 수치와 직접 비교하지 않는다. 조건별 3회 표본이며 보편적 성능 개선의 통계적 증명은 아니다.

## 최종 결과

**B-1.5 수정과 B-2 구현을 완료했다.** Render 계산의 긴 작업은 분할됐지만 S1·S4의 커밋/브라우저 렌더링 긴 프레임은 남았다. 단일 레인인 S2·S3은 입력·클릭 지연이 남았고 stack보다 커졌다. B-3 기능이나 앱 최적화로 결과를 우회하지 않았다.

원자료: [세 엔진 JSON](../results/fiber-slice-b2/fiber-slice-cross.json). 코드 `485435c2d5824feab0a5f59adad2bc5146f1590a`, 측정 시작 시 작업 트리 깨끗함. 집계 수정 전 예비 결과(`d388e27`)는 최종 자료에 섞지 않았다.

| 환경 | 값 |
| --- | --- |
| 브라우저 | Chromium 153.0.8010.12, Not_A Brand 8.0.0.0 |
| 전원 | 충전 중, 100% |
| viewport / DPR | 1280x720 / 2 |
| 논리 코어 | 10 |
| 실행 | headed Chrome, CPU throttling 1배, Vite 개발 서버 |
| LoAF / Long Task 지원 | True / True |
| 시나리오 시작 시각 (UTC) | 2026-11-10T04:56:19.287Z ~ 2026-11-10T05:00:29.835Z |

### 교차 측정 표

건당 경과/작업 시간·지연·프레임 수·fps는 실행별 요약의 **3회 평균**이다. 지연은 S2 입력/S3 클릭의 예정 시각 기준 p95이고 해당 없는 항목은 N/A다. 최장 Long Task는 **세 실행 전체의 최댓값**이다. 실행별 값과 원시 구간은 JSON에 있다.

| 시나리오 | 엔진 | 건당 경과 ms | 건당 작업 ms | 최장 Long Task ms | 지연 p95 ms | 끊긴 프레임 | 진행 바 fps | 실행 전 / 실행 중 추정 Hz (각 3회) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | stack | 107.2 | 107.2 | 122.0 | N/A | 3.0 | 55.4 | 60/60/60 → 60/60/60 |
| S1 | fiber-sync | 96.4 | 96.4 | 111.0 | N/A | 3.3 | 55.0 | 60/60/60 → 60/60/60 |
| S1 | fiber-slice | 180.3 | 123.4 | 71.0 | N/A | 3.0 | 55.5 | 60/60/60 → 60/60/60 |
| S2 | stack | 66.2 | 66.2 | 89.0 | 152.3 | 19.0 | 30.3 | 60/60/60 → 60/60/60 |
| S2 | fiber-sync | 61.9 | 61.8 | 87.0 | 138.4 | 19.0 | 32.7 | 60/60/60 → 60/60/60 |
| S2 | fiber-slice | 197.8 | 92.1 | 88.0 | 481.1 | 3.0 | 36.4 | 60/60/60 → 60/60/60 |
| S3 | stack | 66.7 | 66.7 | 182.0 | 190.2 | 10.0 | 43.7 | 60/60/60 → 60/60/60 |
| S3 | fiber-sync | 61.7 | 61.7 | 164.0 | 170.5 | 10.0 | 44.3 | 60/60/60 → 60/60/60 |
| S3 | fiber-slice | 154.7 | 89.3 | 71.0 | 379.7 | 1.0 | 39.4 | 60/60/60 → 60/60/60 |
| S4 | stack | 105.8 | 105.8 | 191.0 | N/A | 27.0 | 10.7 | 60/60/60 → 47/60/48 |
| S4 | fiber-sync | 94.2 | 94.2 | 170.0 | N/A | 28.7 | 11.2 | 60/60/60 → 47/60/40 |
| S4 | fiber-slice | 186.9 | 120.7 | 85.0 | N/A | 20.3 | 22.0 | 60/60/60 → 60/60/60 |

전 실행의 사전 예산은 60Hz(16.67ms)로 고정했다. S4에서 stack·fiber-sync 각각 2/3 실행에 불안정 경고가 있었고 fiber-slice는 경고가 없었다. 실행 중 진단값이 40~48Hz로 내려가도 끊김 기준은 34.33ms 그대로다. 각 실행의 warnings는 원자료에 보존했다. 원시 입력/클릭의 미완료 수는 모든 실행에서 0이었다.

### JS / 렌더링 우세 긴 프레임

아래는 조건별 **3회 합계**다. 개수는 정수이고 분류별 시간은 해당 프레임 전체 duration의 합계다. 별도의 JS/렌더링 구간 합계를 오른쪽에 표시했다. 우세 원인 분류와 단일 JS Task가 50ms를 넘는 것은 다르다. 이번 표본의 강제 style/layout 귀속 시간은 0이었다.

| 시나리오 | 엔진 | JS 우세 수 | JS 우세 프레임 합계 ms | 렌더링 우세 수 | 렌더링 우세 프레임 합계 ms | JS 구간 합계 ms | 렌더링 구간 합계 ms | 미확인 수 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | stack | 9 | 1288.5 | 0 | 0.0 | 966.3 | 314.2 | 0 |
| S1 | fiber-sync | 9 | 1195.7 | 0 | 0.0 | 868.8 | 319.0 | 0 |
| S1 | fiber-slice | 7 | 507.3 | 2 | 123.0 | 307.3 | 296.2 | 0 |
| S2 | stack | 57 | 4282.9 | 0 | 0.0 | 3777.9 | 464.7 | 0 |
| S2 | fiber-sync | 57 | 4003.7 | 0 | 0.0 | 3532.7 | 454.5 | 0 |
| S2 | fiber-slice | 0 | 0.0 | 5 | 310.5 | 67.2 | 222.3 | 0 |
| S3 | stack | 33 | 2439.2 | 0 | 0.0 | 2208.5 | 204.8 | 0 |
| S3 | fiber-sync | 33 | 2275.8 | 0 | 0.0 | 2042.6 | 205.9 | 0 |
| S3 | fiber-slice | 1 | 76.3 | 2 | 131.2 | 98.4 | 103.9 | 0 |
| S4 | stack | 84 | 11913.0 | 0 | 0.0 | 8893.8 | 2889.0 | 0 |
| S4 | fiber-sync | 89 | 11598.0 | 0 | 0.0 | 8405.8 | 3055.7 | 0 |
| S4 | fiber-slice | 17 | 1282.5 | 44 | 3032.9 | 2016.0 | 2104.1 | 0 |

S1の fiber-slice에도 JS 우세 프레임 7건이 남았다. 이는 scriptMs가 렌더링 구간보다 큰 프레임이라는 뜻이며 50ms 넘는 Render 계산이 남았다는 뜻은 아니다. S4에서도 동기 DOM Commit과 스타일/레이아웃 비용이 합쳐진 긴 프레임이 남았다. 따라서 LoAF 분류만으로 목표 달성을 판정하지 않고 작업 구간 및 trace의 Task별 Scripting도 함께 확인했다.

### Render 계산 / 동기 Commit 진단

| 시나리오 | fiber-slice 최장 Render 작업 구간 ms (전체 max) | 50ms 초과 Render 구간 수 (3회 합계) | 최장 동기 Commit ms (전체 max) |
| --- | --- | --- | --- |
| S1 | 9.7 | 0 | 32.4 |
| S2 | 8.8 | 0 | 15.0 |
| S3 | 8.5 | 0 | 30.9 |
| S4 | 12.0 | 0 | 37.0 |

S1·S4을 포함해 50ms 초과 Render 구간은 0건이었다. 가장 긴 단위 작업 묶음은 12.0ms로 5ms deadline을 넘었지만, 다음 단위 전에 양보했다. 단일 함수/GC까지 선점하는 5ms 상한 보장은 아니다. stack에는 이 추가 계측이 없으므로 0건으로 가장하지 않았다.

### S4의 전체 실행과 커밋 1건 비용

다음 표는 **실행별 3회 평균**이다. 수신은 버튼 이벤트 수, 커밋은 heatmap 업데이트 수이며 서로 다르다.

| 엔진 | 전체 실행 ms | 수신 수 | 커밋 수 | 커밋/초 | 전체 작업 시간 합계 ms | 커밋 1건 경과 ms | 커밋 1건 작업 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stack | 5614.0 | 28.0 | 28.0 | 5.0 | 2961.6 | 105.8 | 105.8 |
| fiber-sync | 5603.2 | 29.7 | 29.7 | 5.3 | 2793.6 | 94.2 | 94.2 |
| fiber-slice | 5557.9 | 207.7 | 20.3 | 3.7 | 2453.8 | 186.9 | 120.7 |

많은 수신을 커밋마다 합치므로 fiber-slice의 수신 수가 많다고 같은 횟수의 화면 갱신을 처리했다고 보지 않는다. 중간 스냅샷의 수와 최신 상태 반영 속도를 구분해야 한다. 큐의 함수형 action 순서 보존은 별도 테스트로 검증했다.

### 기대 결과 판정과 비용

- **S1·S4 Render 계산의 긴 JS 작업 분할:** 관측 조건에서 달성. Render 구간의 50ms 초과는 0이며 별도 S4 trace의 최대 Task Scripting도 35.8ms였다. 아래 trace에서 브라우저 렌더링 작업은 여전히 긴 Task를 만든다. 모든 Long Task가 없어졌다고 보고하지 않는다.
- **S4 진행 바:** stack 10.8→fiber-slice 22.0fps. 약 2배지만 60fps에 도달한 것은 아니다. 고정 예산 기준 끊김도 27.0→20.3으로 남았다. 넓은 셀 변경 뒤 동기 Commit·스타일·레이아웃·페인트 비용이 여전히 보인다.
- **S2·S3 지연:** S2 입력 p95 152.3→481.1ms, S3 클릭 p95 190.2→379.7ms. 단일 레인·재시작 없음으로 최신 입력이 현재 렌더 뒤에서 기다리는 결과다. 타이핑 반영을 여러 번 합쳐 S2 커밋 수도 19→9로 줄었다. 계산을 분할하면 입력 응답도 자동으로 빨라진다고 주장하지 않는다.
- **계산 비용 증가:** 커밋당 작업 시간은 S1 107.2→123.4ms, S2 66.2→92.1ms, S3 66.7→89.3ms, S4 105.8→120.7ms로 늘었다. deadline 확인과 host task/버퍼 유지 비용이 추가됐다는 것이 소스에 근거한 추론이다. 요인별 인과 기여도는 분리 측정하지 않았다.
- **전체 비용:** S1은 같은 3회 커밋에서 321.7→370.3ms, S3은 같은 11회 커밋에서 733.7→981.9ms로 전체 작업 시간도 늘었다. S2는 커밋 합침으로 1257.1→828.7ms, S4는 2961.6→2453.8ms로 줄어, 건당 비용과 전체 비용의 결론이 같지 않다.

## Chrome trace 방법

20k S2 첫 글자 `d`와 S4 수신 한 건을 stack/fiber-slice에서 각각 기록했다. S2는 사전 입력을 비워 동일 상태로 맞추고, S4는 같은 seed에서 한 건을 워밍업한 뒤 다음 한 건을 기록한다. 마커 직후 입력/수신을 보내고 heatmap idle+두 rAF 뒤 구간을 닫는다. 네 원본 `.trace.json.gz`는 DevTools Performance로 불러올 수 있다.

집계는 B-1과 같은 주 스레드 이벤트의 중복 없는 구간 합계다. Painting→Rendering→Scripting 우선순위로 한 구간을 한 번만 센다. 나머지는 Other/Idle이다. 비율의 분모는 양보·대기를 포함한 마커 전체 구간이다. **DevTools UI Summary를 읽은 값이 아니라 첨부 trace에서 재현 계산한 값**이다. 분할 엔진은 Idle 비율이 커질 수 있으므로 절대 ms도 함께 비교한다. 진행 바와 계측·CDP 호출도 같은 페이지의 주 스레드에 포함된다. 추가로 같은 범주의 합집합을 RunTask별로 나눠 Task 하나의 Scripting 최댓값과 50ms 초과 수를 계산한다. 이것도 trace 구간 계산값이며, LoAF의 우세 원인 분류와 다른 지표다.

### 실제 trace 결과

원본: [stack S2](../results/fiber-slice-b2/stack-20k-S2-key.trace.json.gz), [stack S4](../results/fiber-slice-b2/stack-20k-S4-receive.trace.json.gz), [fiber-slice S2](../results/fiber-slice-b2/fiber-slice-20k-S2-key.trace.json.gz), [fiber-slice S4](../results/fiber-slice-b2/fiber-slice-20k-S4-receive.trace.json.gz). [집계와 이벤트 정의](../results/fiber-slice-b2/trace-summary.json), [trace 환경과 입력 상태](../results/fiber-slice-b2/trace-info.json).

| 엔진 | 시나리오 | 선택 구간 ms | Scripting ms (%) | Rendering ms (%) | Painting ms (%) | Other/Idle ms (%) |
| --- | --- | --- | --- | --- | --- | --- |
| stack | S2 | 285.6 | 125.2 (43.9%) | 79.7 (27.9%) | 65.8 (23.0%) | 14.8 (5.2%) |
| stack | S4 | 217.5 | 109.6 (50.4%) | 59.1 (27.2%) | 32.9 (15.1%) | 15.8 (7.3%) |
| fiber-slice | S2 | 277.8 | 111.4 (40.1%) | 92.6 (33.3%) | 64.2 (23.1%) | 9.6 (3.5%) |
| fiber-slice | S4 | 352.1 | 140.1 (39.8%) | 119.6 (34.0%) | 81.5 (23.1%) | 10.9 (3.1%) |

| 엔진 | 시나리오 | Task별 Scripting 최대 ms | Scripting 50ms 초과 Task 수 | Task별 Rendering+Painting 최대 ms |
| --- | --- | --- | --- | --- |
| stack | S2 | 123.3 | 1 | 54.2 |
| stack | S4 | 108.7 | 1 | 68.6 |
| fiber-slice | S2 | 15.7 | 0 | 92.0 |
| fiber-slice | S4 | 35.8 | 0 | 123.0 |

S2는 두 엔진 모두 echo=`d`, S4는 두 엔진 모두 seed 43→44의 한 건이었다. 분할 엔진은 S2에서 JS가 짧은 여러 Task로 나뉘었지만, 프레임 렌더링 최대 구간은 92.0ms 남았다. S4는 JS 최대 35.8ms에 비해 Rendering+Painting 최대 123.0ms였다. 렌더 계산 분할과 브라우저의 최종 프레임 비용을 구분할 수 있다.

S4 trace 전체 구간은 217.5→352.1ms로 늘었고 Scripting 합계도 109.6→140.1ms로 늘었다. 원본에서는 stack/fiber-slice의 rAF 콜백이 10/30회, Layout이 4/8회, Paint가 6/16회였다. 양보 사이에 진행 바와 브라우저가 더 자주 움직이는 비용도 포함된다는 추론과 일치한다. 다만 프로파일링 오버헤드·단일 표본의 환경 차이도 있으므로 증가 전부를 한 원인으로 귀속하지 않는다. 이 표본을 반복 실행의 p95와 동일시하지 않는다.

## 재현과 정지 지점

1. 이 worktree에서 `npm ci` 후 `npm run dev -- --host 127.0.0.1 --port 5181`.
2. 별도 프로필의 headed Chrome을 `--remote-debugging-port=9331`로 실행.
3. `node lab/dev/measure-fiber-sync.mjs /private/tmp/fiber-b2-verified --b2`.
4. `node lab/dev/summarize-fiber-traces.mjs /private/tmp/fiber-b2-verified`.

판단은 [B17~B23](../decisions.md)에 기록했다. 원자료·trace·결과 해석을 보고하고 B-2에서 멈춘다. B-3 승인 전 레인·선점·재시작은 구현하지 않는다. 푸시와 PR은 하지 않았다.
