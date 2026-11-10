# B-3 · 레인과 중단·재시작

2026-11-10 · `feat/fiber-engine` · worktree `/private/tmp/mini-react-fiber-engine`

## 구현과 범위

사용자가 B-2를 승인한 뒤 같은 작업 위치에서 B-3을 진행했다. 구현은 `0c25b13`, 우선순위 host budget 보완은 `09eba68`이다. 최종 실측은 후자에서 수행했다. 푸시·PR은 하지 않는다.

stack 엔진(`src/core`, `src/runtime`), `lab/data.js`, 앱 컴포넌트는 **B-2 이후 변경하지 않았다**. 기준 태그 대비 앱의 기존 한 줄 차이는 B-0에서 승인한 startTransition 래퍼이며 이번 작업에서는 추가 변경이 없다. 인덱스 기반 자식 비교와 전체 트리 재조정을 유지한다. 새 memo·bailout은 넣지 않았다. 기존 루트 useMemo 호환 기능은 유지한다.

| 파일 | 변경 |
| --- | --- |
| `src/fiber/lanes.ts` | Sync=1, Default=2, Transition=4, NoLane=0, 우선순위 범위 복구 |
| `src/fiber/updateQueue.ts`, `hooks.ts`, `types.ts`, `commit.ts` | 레인별 선택, baseState/baseQueue, skip 뒤 NoLane 복제로 순서 복원, Commit 시에만 pending 소비 |
| `src/fiber/dom.ts` | 실제 native 핸들러를 Sync 범위로 실행. startTransition 안에서만 Transition으로 전환 |
| `src/fiber/root.ts` | 높은 레인 도착 시 WIP 폐기·최신 current에서 재시작, Sync 무양보, 폐기 계측과 레인별 idle |
| `src/fiber/scheduler.ts`, `index.ts` | 루트와 무관한 최고 레인 선택, Sync microtask 배칭, Default/Transition 5ms, fiber 모드 |
| `lab/engine-adapter.js` | fiber 연결. stack은 기존 경로 그대로 |
| `lab/latency.js`, `metrics.js`, `scenarios.js`, `runner.js` | 추가 지연 분해, Sync 비용, 폐기 비용, 최종 히트맵 지연과 UI 표 |
| `src/fiber/lanes.test.ts`, `lab/latency.test.js`, `metrics-integration.test.js`, `fiber-differential.test.js` | 큐·레인·중단·계측 회귀와 네 엔진 차등 검증 |
| `lab/dev/measure-fiber-sync.mjs` | `--b3` 세 엔진 측정, fiber S2/S4 trace, 진행 바 진단 |
| `lab/dev/summarize-layout-diagnostic.mjs` | diagnostic trace 구간·invalidation·Layout·Paint 집계 |
| `README.md`, `docs/decisions.md` | 추가 지표와 B24 이후 판단 기록 |

## 핵심 동작

이벤트 핸들러의 setter는 Sync, startTransition 안은 Transition, rAF·타이머 등은 Default로 enqueue한다. Setter에서 값을 바꾸지 않는다. 렌더는 자기 레인의 action만 적용하고 나머지는 baseQueue에 남긴다. 첫 skip 이후 적용한 action도 NoLane으로 재생해, 예를 들어 Transition set(10) 뒤 Sync set(1)의 최종 값이 10으로 되돌아가지 않게 했다. 함수형 action도 순서대로 보존한다.

자기 루트의 더 높은 레인이 오면 이전 Render의 WIP·효과 목록·DOM 작업 목록을 버린다. 공유 큐와 current는 그대로다. 높은 레인 Commit 후 낮은 레인을 최신 current에서 다시 시작한다. Default 렌더에 Sync가 오는 경우에도 같은 규칙을 적용한다. 무관한 다른 루트의 Default는 먼저 처리하되 히트맵 WIP까지 버리지는 않는다. 진행 바마다 전체 Transition을 폐기하는 방식은 사용하지 않는다.

Sync는 이벤트 이후 microtask로 배칭해 양보 없이 끝낸다. Default/Transition은 5ms host deadline 안에서 단위 작업 사이에 양보한다. 높은 레인의 짧은 루트가 끝나면 남은 예산을 다음 작업에 사용한다. 동일 레인은 FIFO다. fiber-slice의 기존 루트별 FIFO 정책은 유지한다.

같은 레인의 연속 Transition은 현재 스냅샷을 마치고 남은 action으로 다음 렌더를 한다. 타이핑 도중에는 새 Sync가 진행 중인 Transition을 폐기하므로 중간 강조 결과가 건너뛰어질 수 있다. 함수형 action 자체를 버려서 최신 값 수렴을 흉내 내지는 않는다.

## 지표 정의

B-2의 `B1.5-fixed-pre-run-loaf-v2` 정의, 사전 고정 예산, LoAF 우세 원인 분류, 예정 시각 기준 총 지연, 완료 대기, 워밍업과 반복 수는 유지한다.

추가 지표는 다음과 같다.

- 이벤트 실행 시각은 스크립트 dispatch 직전 또는 native 캡처 시점의 performance.now다. 예정 시각→이벤트 실행→입력을 처리하는 렌더 시작→Commit→다음 rAF를 각각 기록한다. fiber는 Sync 렌더를, 다른 엔진은 해당 입력을 처리하는 렌더를 연결한다. 폐기된 attempt 연결은 무효화한다.
- 구간 p95는 각각의 분위수다. **구간 p95를 더한 값이 총 p95와 같다고 주장하지 않는다.** 원자료의 한 표본에서는 구간 합이 기존 main 지연과 일치하도록 검증했다.
- Sync Render 작업 시간은 루트 재실행+전체 트리 재조정이며 DOM Commit을 제외한다. Sync 전체 작업 시간도 별도 기록한다. OS CPU 시간이 아니라 작업 구간의 경과 시간 합계다.
- 폐기 Transition 횟수·작업 시간을 별도로 남긴다. activeTotalMs는 커밋된 작업, allActiveTotalMs는 폐기된 작업까지 합친 값이다.
- 마지막 입력/클릭 발사 직후를 종료 시점으로 잡고, 모든 heatmap 레인이 끝난 Commit 다음 rAF까지를 최종 히트맵 지연으로 기록한다. 시나리오에 원래 있던 1초 대기 끝부터 세는 값이 아니다. 실제 물리적 paint 완료는 근사한다.

## 검증

| 명령 | 실제 결과 |
| --- | --- |
| `npm run test:run` | 32개 파일, 331개 테스트 통과 |
| `npm run typecheck` (`tsc --noEmit`) | 종료 코드 0 |
| `npm run build` | 타입 검사·Vite 빌드 통과 |
| `git diff --check` | 통과 |

테스트는 native 이벤트에서 Sync/Transition 분리, Transition 도중 Sync의 폐기→Commit→재시작, 같은 Hook의 대입·함수형·NoLane 재생과 세 레인 혼합, 연속 Transition 수렴, 폐기 전후 DOM·핸들러·Hook·memo·effect 무변경, 다른 루트의 Default 우선 처리, Sync 한 번의 무양보 Render, host 예산 잔여분 사용을 포함한다. 히트맵의 DOM·document.title 차등 시나리오도 fiber에 확장했다. 추가 지연 분해와 폐기 연결 해제·최종 idle Commit 계측도 검증했다.

## 첫 실행에서 발견한 스케줄러 문제

첫 구현은 짧은 Default 작업에 host task 하나를 통째로 썼다. S4 진행 바 fps는 높았지만 낮은 Transition의 갱신 기회가 크게 줄었고, 한 실행의 커밋당 경과 평균이 5.66초였다. 이 수치를 개선으로 채택하지 않았다. 최고 레인부터 남은 5ms 예산을 함께 쓰도록 보완하고 가짜 시계 테스트와 세 엔진 실측을 다시 수행했다(B30). 보완 전 결과는 최종 표에 섞지 않았다.

## 측정 방법

20k, seed=42, cellCost=0에서 `?engines=stack,fiber-slice,fiber&runs=3&autorun=1`로 측정한다. 시나리오별 엔진당 워밍업 1회를 버린 뒤 3회 교차 실행한다. 코드 커밋·측정 시작 시 작업 트리·브라우저·전원·주사율·viewport를 원자료에 남긴다. 과거 B-2 숫자 대신 같은 세션의 세 엔진을 비교한다.

fiber S2 첫 글자와 S4 수신 한 건의 trace는 교차 측정과 별도로 수집한다. B-2와 같은 Scripting/Rendering/Painting 이벤트 합집합과 우선순위로 중복 없이 집계한다. 비율은 마커 전체 구간을 분모로 하며 DevTools UI Summary를 읽은 수치가 아니라 trace에서 계산한 값이다. Task별 Scripting도 함께 기록한다.

## 최종 교차 측정

**입력·클릭 지연은 fiber-slice보다 크게 줄었고, S4 진행 바도 개선됐다.** 대신 Sync 전체 트리 재조정과 폐기 비용, 낮은 레인의 최종 반영 지연은 남았다. 이 결과를 모든 작업의 완료 시간 개선으로 일반화하지 않는다.

[세 엔진 원자료](../results/fiber-b3/fiber-cross.json). 코드 `09eba68d8dc3db4ce95bbb460cb027d3f9dbdcb4`, 측정 시작 시 작업 트리 깨끗함. 초기 `0c25b13` 측정은 최종 표에 섞지 않았다.

| 환경 | 값 |
| --- | --- |
| 브라우저 | Chromium 153.0.8010.12, Not_A Brand 8.0.0.0 |
| 전원 | 충전 중, 100% |
| viewport / DPR | 1280x720 / 2 |
| 논리 코어 | 10 |
| 실행 | headed Chrome, CPU throttling 1배, Vite 개발 서버 |
| 사전 예산 | 전체 실행 60Hz, 16.67ms로 고정; 끊김 기준 34.33ms |
| LoAF / Long Task 지원 | True / True |
| 시나리오 시작 (UTC) | 2026-11-10T08:14:05.073Z ~ 2026-11-10T08:18:14.984Z |

건당 경과/작업 시간·프레임 수·fps·지연 p95는 실행별 요약의 **3회 평균**이다. 지연은 S2 입력/S3 클릭의 예정 시각 기준이다. 최장 Long Task는 **세 실행 전체 최댓값**이다. 모든 실행의 preRunHz와 refreshHzObserved는 60/60/60이고 경고가 없었다.

| 시나리오 | 엔진 | 건당 Render+Commit 경과 ms | 건당 작업 ms | 최장 Long Task ms | 지연 p95 ms | 끊긴 프레임 | 진행 바 fps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | stack | 108.8 | 108.8 | 124.0 | N/A | 3.0 | 55.4 |
| S1 | fiber-slice | 186.9 | 126.4 | 70.0 | N/A | 3.0 | 55.7 |
| S1 | fiber | 331.2 | 127.1 | 73.0 | N/A | 3.3 | 57.1 |
| S2 | stack | 67.0 | 67.0 | 97.0 | 143.4 | 19.0 | 31.5 |
| S2 | fiber-slice | 184.4 | 91.8 | 87.0 | 416.2 | 3.0 | 36.4 |
| S2 | fiber | 73.0 | 62.1 | 94.0 | 93.2 | 20.0 | 33.4 |
| S3 | stack | 66.9 | 66.9 | 175.0 | 185.8 | 10.0 | 44.5 |
| S3 | fiber-slice | 152.8 | 90.5 | 71.0 | 402.0 | 1.0 | 40.1 |
| S3 | fiber | 88.1 | 65.9 | 86.0 | 88.9 | 11.7 | 41.5 |
| S4 | stack | 104.6 | 104.6 | 192.0 | N/A | 27.0 | 10.9 |
| S4 | fiber-slice | 198.2 | 125.4 | 81.0 | N/A | 19.7 | 22.5 |
| S4 | fiber | 400.2 | 127.1 | 83.0 | N/A | 13.0 | 42.4 |

### 지연 분해 p95

fiber에서는 Sync 시작, 다른 엔진에서는 해당 입력을 처리하는 렌더 시작을 사용한다. 각 실행의 구간 p95를 3회 평균했다. 원자료에서 S2는 매 실행 19건, S3는 10건 전부 분해됐고 미완료 입력·클릭은 모든 실행 0건이었다. **아래 네 p95를 더해 총 p95로 읽지 않는다.**

| 시나리오 | 엔진 | 예정→이벤트 ms | 이벤트→렌더 시작 ms | 렌더 시작→커밋 ms | 커밋→다음 rAF ms | 총 지연 p95 ms |
| --- | --- | --- | --- | --- | --- | --- |
| S2 | stack | 78.9 | 0.1 | 80.4 | 2.0 | 143.4 |
| S2 | fiber-slice | 44.5 | 201.3 | 219.0 | 8.8 | 416.2 |
| S2 | fiber | 25.9 | 0.1 | 63.0 | 6.4 | 93.2 |
| S3 | stack | 121.8 | 0.1 | 64.0 | 0.4 | 185.8 |
| S3 | fiber-slice | 48.0 | 198.5 | 164.6 | 11.8 | 402.0 |
| S3 | fiber | 22.7 | 0.2 | 66.1 | 1.9 | 88.9 |

S2의 이벤트→렌더 대기 201.2→0.1ms, 렌더→Commit 219.0→63.0ms가 줄었다. S3도 각각 198.5→0.1ms, 164.6→66.1ms로 줄었다. 현재 렌더 완료 후 한 바퀴 더 기다리던 경로를 벗어나고, Sync 경로의 양보가 없어졌다. 하지만 약 60ms의 순수한 전체 트리 재조정은 남아 1~2프레임 응답에는 이르지 못했다.

### Sync 비용·폐기·최종 히트맵

작업 시간과 최종 반영 지연은 실행별 평균, 폐기 수·시간은 먼저 **3회 합계**로 표시했다. Sync Render는 Commit을 제외한다. 마지막 이벤트 발사 직후→최종 heatmap idle Commit 다음 rAF의 지연이다.

| 시나리오 | fiber Sync 수/실행 | Sync Render 작업 평균 ms | Sync 전체 작업 평균 ms | 폐기 Transition 총수 (3회) | 폐기 작업 총 ms (3회) | 마지막 이벤트 후 최종 히트맵 ms (stack / slice / fiber) |
| --- | --- | --- | --- | --- | --- | --- |
| S2 | 19.0 | 60.0 | 60.1 | 54 | 607.5 | 64.1 / 272.9 / 391.0 |
| S3 | 10.0 | 60.4 | 60.4 | 30 | 1028.8 | 63.2 / 169.6 / 445.8 |

| 시나리오 | fiber 커밋된 작업 ms/실행 | 폐기 작업 ms/실행 | 합계 ms/실행 | fiber-slice 합계 ms/실행 |
| --- | --- | --- | --- | --- |
| S2 | 1242.4 | 202.5 | 1444.9 | 918.5 |
| S3 | 724.5 | 342.9 | 1067.4 | 935.3 |

입력에 빨리 응답하는 대신 낮은 레인 결과가 더 늦고, 재시작 때문에 전체 작업도 늘었다. S2의 최종 히트맵은 272.9→391.0ms, S3는 169.6→445.8ms로 늦어졌다. Sync를 통과한 최신 query/선택과 Transition의 최신 데이터/강조 결과를 같은 시각에 완성하려 한 설계가 아니다. 폐기 비용을 커밋 평균에 숨기지 않았다.

### 긴 프레임 분류

조건별 **3회 합계**다. 우세 분류별 시간은 해당 프레임의 전체 duration 합계이고, 별도 구간 합계와 구별한다. 이는 LoAF 기반 진단 분류이며 모든 원인의 확정 분해가 아니다.

| 시나리오 | 엔진 | JS 우세 수 | JS 우세 프레임 총 ms | 렌더링 우세 수 | 렌더링 우세 프레임 총 ms | JS 구간 총 ms | 렌더링 구간 총 ms | 미확인 수 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | stack | 9 | 1311.8 | 0 | 0.0 | 980.4 | 319.8 | 0 |
| S1 | fiber-slice | 3 | 213.2 | 6 | 392.7 | 291.0 | 303.8 | 0 |
| S1 | fiber | 3 | 213.5 | 6 | 407.8 | 309.5 | 305.1 | 0 |
| S2 | stack | 57 | 4312.6 | 0 | 0.0 | 3826.8 | 451.4 | 0 |
| S2 | fiber-slice | 0 | 0.0 | 5 | 294.7 | 57.1 | 222.0 | 0 |
| S2 | fiber | 57 | 3837.8 | 0 | 0.0 | 3615.9 | 75.1 | 0 |
| S3 | stack | 33 | 2444.9 | 0 | 0.0 | 2215.4 | 200.5 | 0 |
| S3 | fiber-slice | 2 | 148.7 | 1 | 64.6 | 102.2 | 105.8 | 0 |
| S3 | fiber | 30 | 2078.1 | 3 | 202.9 | 1986.6 | 208.8 | 0 |
| S4 | stack | 84 | 11856.9 | 0 | 0.0 | 8834.8 | 2853.4 | 0 |
| S4 | fiber-slice | 12 | 877.4 | 47 | 3182.7 | 1870.6 | 2005.0 | 0 |
| S4 | fiber | 4 | 268.4 | 32 | 2111.2 | 1127.0 | 1242.7 | 0 |

fiber의 S2/S3에서 JS 우세 긴 프레임이 다시 많아진 것은 Sync를 무양보로 전체 재조정하는 선택의 비용이다. 입력 지연 감소와 긴 프레임 수 감소는 같은 목표가 아니다. S4는 렌더링 우세 긴 프레임이 남는다.

### S4 전체 실행과 처리량

아래는 **실행별 3회 평균**이다. 수신 수와 커밋 수가 다르므로 화면 갱신 처리량과 수신 처리량을 동일시하지 않는다.

| 엔진 | 전체 실행 ms | 수신 수 | 커밋 수 | 커밋/초 | 전체 작업 합계 ms | 커밋 1건 경과 ms | 커밋 1건 작업 ms | 진행 바 fps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stack | 5566.9 | 28.0 | 28.0 | 5.0 | 2929.1 | 104.6 | 104.6 | 10.9 |
| fiber-slice | 5560.9 | 207.3 | 19.7 | 3.5 | 2465.6 | 198.2 | 125.4 | 22.5 |
| fiber | 5745.0 | 174.3 | 12.0 | 2.1 | 1525.3 | 400.2 | 127.1 | 42.4 |

S4 진행 바는 22.5→42.4fps로 좋아졌지만 커밋 수는 19.7→12.0회로 줄고 커밋당 경과 시간은 198.2→400.2ms로 늘었다. 낮은 레인 작업이 더 늦어지고 더 많은 수신을 합친 효과도 있다. **같은 횟수의 히트맵 갱신을 더 빠르게 끝냈다고 해석하지 않는다.** S1도 작업 시간은 비슷한 126.4/127.1ms이나 경과 시간은 186.9→331.2ms로 늘었다. 진행 바 우선 처리의 trade-off를 그대로 보고한다.

## 최종 fiber trace

[fiber S2 원본](../results/fiber-b3/fiber-20k-S2-key.trace.json.gz), [fiber S4 원본](../results/fiber-b3/fiber-20k-S4-receive.trace.json.gz), [집계·이벤트 정의](../results/fiber-b3/trace-summary.json), [trace 환경·입력 상태](../results/fiber-b3/trace-info.json). S2 echo는 `d`, S4는 seed 43→44 한 건이었다. 진행 바와 CDP·계측 오버헤드도 같은 페이지의 비용이다.

| 시나리오 | 전체 구간 ms | Scripting ms (%) | Rendering ms (%) | Painting ms (%) | Other/Idle ms (%) | Task Scripting 최대 ms | JS 50ms 초과 Task 수 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S2 | 506.3 | 171.4 (33.9%) | 170.2 (33.6%) | 148.1 (29.2%) | 16.7 (3.3%) | 64.3 | 1 |
| S4 | 452.6 | 131.8 (29.1%) | 155.8 (34.4%) | 145.5 (32.1%) | 19.5 (4.3%) | 34.4 | 0 |

S2의 한 Task Scripting 64.3ms는 무양보 Sync 전체 재조정의 하한과 일치한다. S4는 Task Scripting 최대 34.4ms였지만 Task별 Rendering+Painting 최대 67.4ms가 남았다. 마커 범위는 최종 Transition까지 끝난 구간이라, S2 trace의 506.3ms를 입력 에코 지연 p95 93.2ms와 동일시하지 않는다. 단일 trace의 비율을 반복 실행 전체의 인과 기여율로 일반화하지 않는다.

## S4 진단 방법 (수정하지 않음)

기존 B-2 S4 trace의 Rendering+Painting 최대 68.6/123.0ms를 출발점으로 삼았다. 추가로 20k 페이지에서 progress-only 구간(fiber-slice/fiber)과 fiber-slice의 수신 한 건을 invalidation 추적과 함께 녹화한다. heatmap/progress DOM mutation, backend node 지도, StyleRecalc/레이아웃 invalidation, Layout의 dirtyObjects/totalObjects 및 root, Paint 대상·clip을 보존한다.

이 실험은 원인 진단용이므로 앱·CSS를 고치지 않는다. 문서 root Layout과 totalObjects 값만으로 모든 셀을 다시 배치했다고 단정하지 않는다. document Paint도 모든 셀의 재래스터화 증명과 구분한다. invalidation 추적 자체의 오버헤드가 있어 성능 표본으로 섞지 않는다.

## S4 진단 결과 — 변경하지 않음

[진단 정보·노드 지도](../results/fiber-b3/diagnostic-info.json), [진단 집계](../results/fiber-b3/layout-diagnostic-summary.json). 원본: [slice progress-only](../results/fiber-b3/diagnostic-fiber-slice-progress-only.trace.json.gz), [fiber progress-only](../results/fiber-b3/diagnostic-fiber-progress-only.trace.json.gz), [slice 수신 한 건](../results/fiber-b3/diagnostic-fiber-slice-one-receive.trace.json.gz).

| 엔진 / 실험 | 구간 ms | heatmap DOM 변경 수 | progress DOM 변경 수 | Layout 수 | 최대 dirtyObjects / totalObjects | 최대 Layout ms | heatmap/row/cell 명명 invalidation | progress 명명 invalidation | document Paint 수 / 총 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fiber-slice / progress-only | 611.9 | 0 | 68 | 36 | 6 / 20696 | 1.5 | 0 | 37 | 37 / 235.0 |
| fiber / progress-only | 602.8 | 0 | 66 | 36 | 6 / 20696 | 0.9 | 0 | 36 | 36 / 251.6 |
| fiber-slice / one-receive | 879.1 | 24176 | 14 | 7 | 4875 / 20696 | 12.6 | 38363 | 7 | 7 / 64.1 |

확인한 사실:

- 진행 바만 갱신해도 문서 root의 Layout과 document Paint가 반복됐다. style recalc의 elementCount는 매번 1이고 invalidation 대상은 progress-thumb였다. heatmap DOM mutation은 0, heatmap/row/cell로 명명된 invalidation도 0이었다.
- Layout의 totalObjects=20,696은 트리 크기이며, 실제 더러워진 대상은 최대 6이었다. 이 숫자를 근거로 20k 셀을 매 프레임 전부 재배치했다고 주장할 수 없다. progress-only Layout 최댓값도 약 0.9~1.5ms였다.
- document Paint clip은 `[0,0]~[2560,1643]`으로, DPR 2에서 기록된 heatmap box(CSS px x=16~992, y≈175.6~679.6) 영역을 포함했다. 따라서 **문서 범위의 paint 기록 비용이 히트맵을 포함하는 영역에서 반복되는 것**은 확인됐다. 다만 Paint 기록·캐시 재사용·실제 GPU 래스터화는 다르므로 모든 셀 픽셀이 다시 그려졌다는 증거로 확대하지 않는다.
- 수신 한 건에서는 heatmap DOM mutation 24,176건과 셀 관련 invalidation 38,363건이 발생했다. 최대 dirtyObjects=4,875와 style recalc elementCount=19,448로 progress-only와 크게 달랐다. 이 변화는 데이터 Commit에 연결된다.

결론은 부분적으로 확인됐다. 진행 바의 left 갱신은 문서 범위 Layout/Paint 작업을 계속 만들고 비용을 더한다. 하지만 B-2의 Rendering+Painting 최대 123.0ms **전부**를 진행 바가 히트맵 전체를 재배치·재래스터화한 비용으로 귀속할 근거는 없다. 큰 데이터 Commit의 셀 변경, 문서 paint 기록과 프레임 타이밍이 함께 작용한다. invalidation 추적의 추가 오버헤드가 있어 위 진단 시간은 일반 성능 표와 직접 비교하지 않는다. 앱·CSS·stack은 수정하지 않았다.

## 재현과 정지 지점

1. 이 worktree에서 `npm ci` 후 `npm run dev -- --host 127.0.0.1 --port 5181`.
2. 별도 프로필 headed Chrome을 `--remote-debugging-port=9331`로 실행.
3. `node lab/dev/measure-fiber-sync.mjs /private/tmp/fiber-b3-verified --b3`.
4. `node lab/dev/summarize-fiber-traces.mjs /private/tmp/fiber-b3-verified`와 `node lab/dev/summarize-layout-diagnostic.mjs /private/tmp/fiber-b3-verified`로 집계.

결정은 [B24~B32](../decisions.md)에 기록했다. B-3 결과와 [B-4 설계안](B4-design.md)을 보고하고 멈춘다. B-4 mode·bailout·앱 변경은 구현하지 않았다. 푸시와 PR은 하지 않았다.
