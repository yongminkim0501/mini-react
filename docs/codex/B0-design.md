# B-0 · Fiber 엔진 설계 보고

2026-11-10 · 기준 `baseline-stack` (`ef087345d2c056646ca3fa193479eaae1195652a`)

## 범위와 결론

Claude Code의 lab 구현을 읽고 기존 테스트·타입 검사·빌드를 실행했다. 같은 앱을 두 엔진에 연결하는 기반은 이미 있다. stack 엔진을 변경하는 공통 Hook 디스패처를 추가할 필요는 없다.

이번 변경은 이 보고서와 `docs/decisions.md`의 B01 이후 기록뿐이다. Fiber 구현, 앱 변경, 푸시, PR은 하지 않았다. `feat/fiber-engine`은 지정 태그에서 만들었으며, Claude 작업 폴더와 분리한 `/private/tmp/mini-react-fiber-engine` worktree에서 작업했다. 승인 전 B-1에 착수하지 않는다.

아래에서 **확인**은 기준 커밋의 코드·실행 결과, **제안**은 아직 구현하거나 승인받지 않은 설계, **예상**은 측정으로 검증해야 할 가설이다.

## 1. Claude 구현 확인과 앱 연결

| 확인한 사실 | 근거 | B 작업에 주는 의미 |
| --- | --- | --- |
| 어댑터에 네 모드 이름이 있으나 구현된 것은 stack뿐이다. | `lab/engine-adapter.js:18`, `:33` | 현재 Fiber 선택을 성능 결과로 해석하면 안 된다. 미구현 모드는 러너가 건너뛴다. |
| stack Hooks·FunctionComponent는 어댑터가 runtime에서 import한다. | `lab/engine-adapter.js:9`, `:86` | stack 경로를 유지하고 Fiber 팩터리를 별도로 연결할 수 있다. |
| Heatmap App과 ProgressApp은 팩터리 인자로 받은 engine에서 h와 Hooks를 꺼낸다. | `lab/app/heatmap-app.js:34`, `:265` | 앱의 Hook import를 바꾸지 않아도 된다. 앱은 FunctionComponent를 직접 생성하지 않는다. |
| 앱이 직접 import하는 엔진 기능은 어댑터의 startTransition이다. | `lab/app/heatmap-app.js:7` | 기존 전달 함수를 Fiber의 우선순위 범위 함수로 연결한다. |
| 엔진 전환 시 기존 두 루트와 구독을 해제한다. | `lab/main.js`의 엔진 활성화 처리 | Fiber의 예약 작업·passive effect도 해제해야 한다. |

**제안:** `src/fiber/`에 독립 엔진을 만들고 어댑터가 모드별 팩터리를 선택한다. `h()`와 VNode 형식은 기존 구현을 읽기 전용으로 재사용한다. Fiber는 기존의 전역 `hookRuntime`을 사용하지 않고 자체 `currentlyRenderingFiber`와 Hook 큐를 둔다. 기존 Hook 컨텍스트는 동기 호출을 전제로 하므로 양보 중 유지하면 다른 루트와 섞인다.

공통 Hook 디스패처를 stack에 심는 변경은 필요 없다. 기존 `createStackEngine()`의 동작도 유지한다. 기존 Phase 2 데모 전체를 이 어댑터로 이전하는 작업은 이번 범위에 포함하지 않는다.

VNode와 props·children은 `src/runtime/h.ts`에서 동결된다. Fiber 메타데이터는 별도 노드에 저장한다. 앱의 `useMemo` 사용은 유지해야 하므로 API 호환 Hook은 구현하되, 새 subtree bailout·React.memo·key 기반 재정렬은 추가하지 않는 해석을 제안한다.

## 2. startTransition과 수정 금지 파일의 예외 제안

**확인:** `onQuery`는 입력 표시용 `setQuery`를 일반 호출하고 검색용 `setMatchQuery`만 startTransition으로 감싼다(`lab/app/heatmap-app.js:224`). 반면 새 데이터 버튼의 `onRegenerate`는 `setSeed`를 직접 호출한다(`:243`). S1·S3·S4의 재생성은 모두 `lab/scenarios.js`의 `regenerate()`가 이 버튼을 클릭해서 실행한다. 따라서 **S4의 연속 수신도 Transition 표시가 없다.**

**승인 요청 — 아직 적용하지 않음:** `lab/app/heatmap-app.js`의 한 줄만 다음과 같이 바꾼다.

```js
// 현재
onRegenerate: () => setSeed((s) => s + 1),
// 제안
onRegenerate: () => startTransition(() => setSeed((s) => s + 1)),
```

React의 startTransition은 콜백 안에서 예약한 업데이트를 Transition으로 표시한다. 이 앱에서도 개발자가 늦춰도 되는 seed 갱신을 명시해야 한다. 클릭 안의 업데이트를 모두 자동으로 낮은 우선순위로 취급하면 입력·선택까지 늦어진다. 참고: [React startTransition 공식 문서](https://react.dev/reference/react/startTransition).

이 한 줄은 D-A27의 예외이므로 승인 전 수정하지 않는다. stack의 startTransition은 콜백을 바로 실행하므로 상태 의미는 유지되지만, 코드가 바뀐 만큼 승인 후 동일 세션에서 stack도 다시 측정한다. 기존 태그와 과거 기준선은 보존한다. 버튼 ID를 보고 엔진에서 우선순위를 낮추거나 시나리오 바깥에서 클릭 전체를 감싸는 우회는 하지 않는다.

## 3. 이벤트와 레인 경계

**확인:** `src/core/vnode-to-dom/events.ts:16`의 공통 native listener가 WeakMap에 저장된 최신 핸들러를 `handler.call(element, event)`로 호출한다. 업데이트는 저장된 핸들러만 바꾸며, 이벤트 종류별 native listener를 중복 등록하지 않는다. 이 경로에는 우선순위 처리가 없다.

**제안:** Fiber 전용 DOM 이벤트 연결을 `src/fiber/`에 둔다. 실제 사용자 핸들러 호출 직전 `runWithPriority(SyncLane, ...)`로 감싸고 `finally`에서 이전 레인을 복구한다. 그 안의 startTransition은 TransitionLane으로 잠시 덮어쓴다. 타이머와 rAF는 DefaultLane이다. B-1·B-2는 이 우선순위를 구분하지 않는다.

기존 stack 이벤트 파일은 수정하지 않는다. 기존 DOM 생성기를 그대로 호출하면 stack용 listener를 연결하므로, Fiber의 이벤트 부착은 독립 구현한다. 기존 노드의 속성·이벤트 테이블은 Commit에서만 바꾼다. 폐기한 Render가 화면의 핸들러를 바꾸면 안 된다. 핸들러 교체·삭제·this 바인딩·중복 listener 방지를 테스트한다.

## 4. 두 번째 루트와 ProgressApp

**확인:** ProgressApp은 별도 루트이고 effect 안에서 rAF를 반복하며 경과 시간으로 progress를 갱신한다. cleanup에서 마지막 rAF를 취소한다(`lab/app/heatmap-app.js:265`).

**제안:** B-3에서는 이 setState를 DefaultLane으로 처리한다. DOM 이벤트 핸들러 밖이기 때문이다. 진행 바를 좋게 보이게 하려고 Sync나 Transition으로 특별 취급하지 않는다.

B-2는 루트별 WIP를 보관하고 시간 조각 경계에서 라운드 로빈으로 선택한다. 진행 중 Render에 새 업데이트가 들어오면 현재 스냅샷을 끝내고 다음 렌더에 반영한다. 이 관문에는 우선순위 중단·재시작을 넣지 않는다. B-3부터는 모든 루트의 대기 레인 중 가장 높은 우선순위를 먼저 고른다. 루트 해제 시 예약 콜백과 effect를 무효화해 이전 실행의 rAF가 다음 측정을 오염시키지 않게 한다.

## 5. 기존 엔진 의미와 구현 주의점

| 확인 | 설계 제안 |
| --- | --- |
| stack은 컴포넌트를 resolve한 뒤 host 자식을 인덱스로 diff한다. 경로 기반 CREATE/REMOVE/REPLACE/TEXT/PROPS 패치를 사용한다. | Fiber도 인덱스 비교를 쓴다. key 필드는 보관하되 key 매칭·MOVE는 구현하지 않는다. 순수 함수 경계 때문에 host DOM이 불필요하게 교체되지 않는지도 비교한다. |
| stack setState는 값을 즉시 바꾸고 microtask 예약을 합친다(`src/runtime/hooks/useState.ts`, `scheduler.ts`). | Fiber는 action 큐에 넣고 예약만 한다. 이벤트 내 여러 호출은 한 렌더로 합친다. setter가 닫아 둔 큐는 WIP 폐기로 사라지면 안 된다. |
| stack effect는 commit 직후 동기 실행된다(`src/runtime/FunctionComponent.ts`). | 요구대로 Fiber effect는 paint 이후 실행 기회에 예약한다. rAF 내부에서 즉시 실행하지 않고 후속 task로 넘긴다. 실제 물리적 paint 완료 보장으로 표현하지 않는다. 의존성 변경 cleanup→새 effect, unmount 취소를 검증한다. |
| 기존 Hooks 테스트는 stack 클래스를 직접 import하고 일부는 즉시 effect 실행·내부 hooks 배열을 단언한다. | 원본 테스트는 유지하고 Fiber용 동등 행동 테스트를 추가한다. passive effect drain 후 단언하는 차이를 명시한다. 원본 파일을 그대로 Fiber에도 실행했다고 보고하지 않는다. |
| h·resolve·자식 정규화는 텍스트 병합과 컴포넌트 반환값 정리를 수행한다. | fragment·배열·null·인접 텍스트·같은 host를 반환하는 서로 다른 순수 함수·form 속성·SVG를 차등 fixture에 포함한다. |

Render는 detached DOM 생성까지만 허용한다. 살아 있는 DOM과 이벤트 핸들러 갱신은 Commit에 둔다. Commit은 삭제→삽입→속성·텍스트→current 교체 순서로 동기 실행한다. 다중 host 출력을 가진 순수 함수의 삽입 기준점·삭제 범위를 별도로 검증한다. 기존 재귀 resolve/diff를 하나의 작업 단위로 호출하는 방식은 시간 분할이 되지 않으므로 사용하지 않는다.

B-3의 Hook 큐는 baseState/baseQueue와 건너뛴 레인을 보존해야 한다. 예를 들어 초기 0에 `Transition: set(10)` 후 `Sync: set(1)`이면 Sync 커밋은 1이고, 이후 Transition을 재생해도 최종 값은 1이어야 한다. 첫 skip 뒤 이미 적용한 업데이트도 순서 복원용으로 남겨야 한다. `+10`, `+1` 사례만 통과해서는 충분하지 않다. 중단 시 WIP만 폐기하고 미커밋 action은 보존한다.

## 6. 계측 비교에서 먼저 합의할 사항

**확인:** stack의 onRenderEnd는 resolve 뒤, diff 앞에 있다(`src/runtime/FunctionComponent.ts:77`). 따라서 기존 Render는 root 함수+resolve이고 Commit 수치는 **diff+DOM 반영**을 포함한다. Fiber의 정상 구조는 reconciliation을 Render에서 수행한다. 같은 이름의 이벤트를 호출해도 내부 단계의 작업은 같지 않다.

**제안 — 승인 대기:** frozen stack 계측은 유지하고 두 엔진의 **Render+Commit 합계**를 공통 비교값으로 삼는다. 각 단계는 엔진별 구간임을 표에 명시한다. Fiber는 이 합계의 경과 시간과 실제 작업한 CPU 구간 합계를 함께 기록한다. 시간 조각 사이의 양보 시간을 CPU 비용으로 보고하지 않는다. 중단한 Render의 CPU 비용도 누락하지 않는다. 정확히 같은 단계별 분해가 필수라면 stack의 diff 경계 계측을 추가하는 별도 D-A27 예외 승인이 필요하다.

`lab/metrics.js`는 현재 한 쌍의 시작/끝 시각으로 heatmap 렌더를 추적한다. Fiber에는 root·attempt ID와 취소 상태가 필요하다. 이전 시도의 늦은 이벤트가 새 시도와 짝지어지지 않게 한다. 기존 input/click 지연은 예정 시각을 기준으로 유지한다. rAF 기반 관측은 실제 화면 표시 시각의 근사치이며 브라우저 INP와 동일한 수치로 부르지 않는다.

시나리오와 reset의 고정 대기는 Fiber 완료를 보장하지 않는다. 후속 관문에서 idle 대기와 미완료·입력 누락 수를 명시적으로 기록하는 방안을 제안한다. 측정 창의 정의가 바뀌면 결정과 stack 재측정을 함께 남긴다. S4는 같은 5초 동안 엔진마다 수신 횟수가 달라질 수 있으므로 전송·큐 등록·커밋·재시작 횟수와 최종 seed도 함께 보고한다. 함수형 updater를 버려서 마지막 값 수렴을 흉내 내지 않는다.

## 7. 파일 구조와 관문

다음은 예정 책임이며 아직 파일을 만들지 않았다. 구현 중 책임이 겹치면 합치되 관문 범위를 늘리지 않는다.

| 위치 | 책임 | 최초 관문 |
| --- | --- | --- |
| `src/fiber/index.ts`, `types.ts`, `root.ts` | 공개 팩터리, FiberNode/FiberRoot, 루트 수명 | B-1 |
| `src/fiber/workLoop.ts`, `reconcile.ts` | begin/complete, 반복 단위 작업, 인덱스 비교, alternate | B-1 |
| `src/fiber/dom.ts`, `events.ts`, `commit.ts` | detached DOM, 이벤트, 동기 Commit | B-1 |
| `src/fiber/hooks.ts`, `updateQueue.ts` | 루트 전용 Hooks, action 큐, passive effect, useMemo 호환 | B-1, B-3에서 레인 rebase 확장 |
| `src/fiber/instrument.ts` | 루트·시도별 계측 | B-1 |
| `src/fiber/scheduler.ts` | MessageChannel, shouldYield, 5ms, 다중 루트 순환 | B-2 |
| `src/fiber/lanes.ts` | Sync/Default/Transition 선택, 우선순위 범위 | B-3 |
| `src/fiber/*.test.ts` | 차등·Hooks·Commit·scheduler·rebase 검증 | 각 관문 |
| `lab/engine-adapter.js` | 새 엔진 연결, 구현 모드 공개 | 각 관문 |
| `lab/metrics.js`, `main.js`, `runner.js` 등 | 시도·완료 상태와 비교 결과 기록, 필요할 때만 수정 | 각 관문 |

FiberNode에는 요구한 tag/type/key/pendingProps/memoizedProps/stateNode/return/child/sibling/alternate/flags/deletions/hooks를 둔다. 현재 버퍼를 Render 중 변경하지 않고 Commit 성공 후 current를 교체한다.

| 관문 | 구현과 검증 | 다음 관문 진입 조건 |
| --- | --- | --- |
| B-1 fiber-sync | 양보 없는 반복 Render, double buffer, 큐·배칭, 동기 Commit, passive effect. DOM·이벤트·노드 재사용·Hooks 차등 테스트. 20k S1~S4 stack과 교차 측정, S2 키 입력 양쪽 Chrome Performance trace. | 차이·비용을 보고하고 승인 대기 |
| B-2 fiber-slice | 단일 레인, MessageChannel 5ms, 가짜 시계 양보·다중 루트 공정성 테스트. 20k S1~S4 stack과 교차 측정. | Long Task의 원인과 총 시간 증가를 보고하고 승인 대기 |
| B-3 fiber | 비트마스크 레인, 큐 rebase, 전역 우선순위, 높은 레인 도착 시 폐기·재시작. 혼합 Hook·연속 Transition·루트 간 선점 테스트. 20k 세 모드와 10k 동일 방식 1회 측정. | 완료 보고 |

## 8. 성능 목표의 위험과 판정

- 5ms는 작업 단위 사이의 협력적 양보 기준이다. `lab/data.js`의 데이터 생성·검색·통계, root 함수의 useMemo 계산은 한 번 들어가면 중간에 양보할 수 없다. Commit·layout·paint·GC도 남는다. **B-2에서 모든 50ms 초과 Long Task 제거를 보장할 수 없다.** 남으면 구간과 원인을 보고하며 금지 파일을 임의로 쪼개지 않는다.
- bailout을 제외하면 긴급한 입력·선택도 전체 App의 자식 생성을 수행할 수 있다. **B-3의 지연 p95 1~2프레임은 검증 목표이며 달성 보장이 아니다.** 실패하면 수치를 그대로 보고하고, memo나 별도 UI 루트로 몰래 우회하지 않는다.
- B-1도 stack과 동일한 내부 구현은 아니다. 상태 큐, effect 시점, Fiber 객체·double buffer, diff 구간의 차이가 있다. 따라서 비슷한 수치를 기대하되 차이가 크면 원인을 분해한다. 스케줄링 하나만 바뀐 엄밀한 실험이라고 단정하지 않는다.
- 앱 전환·reset·effect 대기·중단 복구가 잘못되면 이전 루트 작업이 결과에 섞인다. 해제된 setter, 예약 callback, 폐기된 effect가 실행되지 않는 것을 별도 검증한다.
- 주사율이 변동한 실행은 기존 `refreshUnstable`과 실행 중 주사율을 함께 보고한다. 과거 기준선과 새 Fiber만 나란히 두지 않고 동일 환경에서 stack을 교차 재측정한다.

## 9. 현재 검증 결과와 후속 보고 형식

기준 커밋에서 2026-11-10 실행:

| 명령 | 실제 결과 |
| --- | --- |
| `npm run test:run` | 25개 파일, 286개 테스트 통과 |
| `npm run typecheck` (`tsc --noEmit`) | 종료 코드 0 |
| `npm run build` | 타입 검사와 Vite 빌드 통과, 종료 코드 0 |

이는 기존 stack/lab의 상태 확인이며 Fiber의 검증 결과가 아니다. 테스트 실행 시간은 약 2.13초였다. 의존성은 lockfile 기준 설치했다.

기존 브라우저 측정은 [stack 기준선](../results/stack-baseline.md)과 [원자료](../results/stack-baseline.json)에 있다. 이 보고서에서는 브라우저 측정과 Chrome trace를 새로 실행하지 않았다. B-0 시점에 모든 Fiber 모드는 미구현·미측정이다. 전원·주사율·브라우저 조건을 새 측정 환경으로 추정해 기입하지 않는다.

관문마다 아래 표를 실제 데이터로 채우며, S2는 입력, S3는 클릭 p95, 해당 없는 항목은 N/A로 적는다. Render+Commit의 집계 통계와 반복 횟수도 원자료와 일치시킨다.

| 모드 / 크기 / 시나리오 | Render+Commit 경과 / CPU ms | 최장 Long Task ms | 예정 시각 기준 지연 p95 ms | 끊긴 프레임 수 | 진행 바 fps | 실행 중 Hz |
| --- | --- | --- | --- | --- | --- | --- |
| B-0: 모든 Fiber 모드 | 미구현 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |

각 관문은 변경 파일·D-A27 예외 승인 근거·새 B 결정·세 검사 결과·측정 환경(전원, 브라우저, 주사율, viewport 등)을 포함한다. B-1 trace는 stack과 fiber-sync 각각 20k S2 키 입력 한 건에 대해 같은 범위의 Scripting/Rendering/Painting 시간과 비율을 보고한다.

## 10. 승인 요청과 정지 지점

1. 새 데이터 `onRegenerate` 한 줄을 Transition으로 감싸는 D-A27 예외와 stack 재측정.
2. 기존 앱에 필요한 useMemo Hook은 호환 구현하되 새로운 memo/bailout 최적화는 제외하는 해석.
3. frozen stack 계측 유지, 합계 중심 비교, 단계별 비동일성 표시 및 Fiber CPU/경과 시간 병기.

승인받기 전에는 위 제안을 적용하거나 B-1 코드를 작성하지 않는다. 현재 수정 금지 파일은 모두 기준 태그와 동일하다.
