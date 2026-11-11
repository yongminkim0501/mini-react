# B-4 설계안 · fiber-bailout · rev2 (구현하지 않음)

2026-11-10 · B-3 이후 승인용 설계 · B-4용 앱 변경 예외는 아직 승인되지 않음

> 이 문서는 승인 전 설계 스냅샷이다. 이후 사용자가 rev2를 승인했으며 [B-4 구현·측정 결과](B4-fiber-bailout.md)에 실제 변경과 비용을 기록했다.

## 결론

별도 `fiber-bailout` 모드에서 **같은 위치의 순수 자식에 같은 VComponent 객체가 전달되면** 함수 실행과 하위 재조정을 건너뛰는 안을 제안한다. 루트는 Hook 업데이트가 있으므로 props가 같아도 항상 실행한다. 레인·큐·중단·재시작·인덱스 비교는 B-3과 동일하게 유지한다.

현재 앱에 모드 이름만 추가해서는 효과가 거의 없다. `h(Component, props)`가 매번 props와 children 배열을 새로 만들고, 현재 Fiber는 컴포넌트 경계를 보존하지 않는다. 따라서 엔진에 커밋된 자식 경계를 남기는 작업과, 앱에서 같은 VComponent를 재사용하는 최소 변경이 함께 필요하다. 이번에는 **기존 B-3의 전제 검증 테스트와 설계서만 보강**했으며 mode·bailout 코드·앱 변경은 적용하지 않았다.

## 현재 코드에서 확인한 사실

| 위치 | 확인 | 참조 비교에 미치는 영향 |
| --- | --- | --- |
| `src/runtime/h.ts:35` | 컴포넌트 props를 새 객체로 복사하고 children도 매번 정규화·동결한다. | 호출자에서 props 객체만 useMemo해도 h를 다시 호출하면 props 참조는 달라진다. 빈 children 배열도 새 참조다. |
| `src/fiber/workLoop.ts`의 expandOne | 자식 함수를 실행한 뒤 host 결과로 펼치고 확장 프레임은 버린다. | 현재 host Fiber만으로는 어느 자식 함수의 이전 props인지 알 수 없다. 단순 host pendingProps 비교만으로 함수 실행까지 생략할 수 없다. |
| `lab/app/heatmap-app.js:216` | data/matches/stats는 기존 useMemo를 사용한다. | Sync query 업데이트에서는 data와 matches가 이전 참조일 수 있다. |
| `lab/app/heatmap-app.js:228` | onSelect는 root 실행마다 새 함수다. | Heatmap의 prop 중 하나가 매번 바뀐다. |
| `lab/app/heatmap-app.js:253` | h(Heatmap, {...})를 root 실행마다 호출한다. | onSelect만 고정해도 최상위 props 참조가 달라 엄격한 참조 bailout은 실패한다. |
| `lab/app/heatmap-app.js:146` | Heatmap이 매번 data.servers.map으로 Row VComponent 배열을 만든다. | Row props/children도 매번 새 객체·배열이다. |
| `lab/app/heatmap-app.js:118` | Row가 server.cells.map으로 Cell VComponent 배열을 만든다. | Row가 실행되면 Cell들도 기본적으로 다시 실행한다. |

Heatmap에 주는 data/matches는 memo 의존성이 같을 때 안정적이고, slo/cellCost는 원시 값이다. selected는 클릭마다 새 객체다. Row의 server는 data가 같으면 안정적이고 matchRow는 matches가 같으면 안정적이다. selectedMinute는 문자열/null이다. 반면 props 컨테이너는 각 h 호출이 매번 새로 만든다. Heatmap 내부의 위임 onClick도 실행마다 새 함수지만, Heatmap 전체를 생략하는 경우에는 이전의 올바른 핸들러를 유지할 수 있다.

## 승인 전 전제 확인 결과

검증 대상은 B-3 엔진이며 실제 lab 앱은 바꾸지 않았다. [b4-prerequisites.test.ts](../../src/fiber/b4-prerequisites.test.ts)의 캐시 fixture는 제안한 Hook 배치를 재현하지만 bailout은 수행하지 않는다.

| 전제 | 코드 확인 | 검증 및 남은 조건 |
| --- | --- | --- |
| setter 참조 안정성 | `hooks.ts`의 useState는 최초 칸에서 queue.set을 생성하고 이후 같은 queue.set을 반환한다. | 여러 Commit에서 setter·queue·onSelect 참조 동일, 같은 함수형 콜백 두 호출이 +2 누적되는 테스트 통과. |
| useMemo의 커밋 기준 소유권 | 이전 슬롯은 currentlyRenderingFiber.alternate에서 읽고 새 슬롯은 WIP의 hooks에 push한다. root.ts의 preemption은 WIP만 폐기하고 commit.ts에서 root.current를 교체한다. | Transition에서 새 matches로 만든 VNode가 미커밋 상태임을 확인. 폐기 후 Sync Commit은 마지막 커밋 VNode와 ===이고, 재시작 Transition은 별도 새 VNode를 만드는 테스트 통과. |
| Commit이 깨끗한 영역을 걷지 않음 | commitRoot는 deletions/placements/updates 목록과 루트 Hook만 처리하며 전체 트리 DFS가 없다. | 다른 영역의 텍스트를 바꾸는 Commit에서 깨끗한 Heatmap의 child 접근을 예외로 막아도 성공하는 테스트 통과. B-4 재사용 영역을 목록에 넣지 않는 조건은 향후 구현에서 검증한다. |
| return 의존 경로 | 아래 정적 조사에서 작업 루프 복귀·삽입 부모 접근을 확인했다. 이벤트는 DOM native listener이며 fiber 조상 수집은 없다. | B-4 경계 복제·부분 공유가 아직 없으므로, 공유된 깊은 노드의 오래된 return 안전성을 이미 검증했다고 주장하지 않는다. |

1·2번 전제는 확인됐다. 이 검증을 B-4 엔진/앱 변경의 사용자 승인으로 해석하지 않는다.

### return과 형제 포인터 조사

| 코드 경로 | 현재 사용 | B-4에서 지킬 조건 |
| --- | --- | --- |
| `workLoop.ts` performUnitOfWork | 완료한 WIP의 return으로 올라간다. | 생략한 공유 자손에는 진입하지 않는다. 복제한 단일 host 경계의 return은 새 WIP 부모다. |
| `workLoop.ts` reconcileNext | 방문한 자식에 return을 새로 지정한다. | 재사용을 해제하고 자손을 방문할 때는 WIP 헤더를 만들고 부모를 다시 연결한다. current를 Render에서 고치지 않는다. |
| `commit.ts` 삽입 | placement의 return.stateNode를 한 단계 읽고 sibling을 훑어 anchor를 찾는다. | 변경 목록에 든 노드와 경계의 부모·형제는 WIP 기준으로 유효해야 한다. 공유 구간의 깊은 노드는 목록에 들어가지 않는다. |
| `commit.ts` 삭제 | DOM parentNode로 제거한다. | fiber 조상 탐색으로 바꾸지 않는다. |
| `dom.ts` 이벤트 | Element별 WeakMap에 최신 핸들러를 보관하고 native DOM 이벤트 경로를 사용한다. | DOM→fiber→return 조상 수집 경로는 현재 없다. 이를 새로 넣으면 공유 포인터 가정을 재검토한다. |
| `workLoop.ts` completeWork | Placement인 detached 새 노드의 자식을 붙인다. | 재사용 경계의 Placement/Update/deletions를 초기화해 현재 DOM을 Render에서 다시 붙이지 않게 한다. |

현재 Commit의 형제 anchor 탐색은 별도 비용이고, DOM API 내부의 하위 트리 처리도 fiber 방문 수와 다르다. 따라서 Commit이 항상 변경 노드 수에만 비례한다고 일반화하지 않는다.

## 엔진 설계 제안

1. `fiber-bailout` 모드 하나만 추가한다. 기존 fiber·레인·큐·인덱스 비교는 유지한다. 루트는 상태 업데이트를 처리해야 하므로 생략하지 않는다.
2. 커밋된 순수 자식 경계에 입력 VComponent와 단일 host 출력 구간을 보관한다. 캐시는 루트의 current/WIP 소유이며 Commit 때만 채택한다. mutable 전역 Map을 쓰지 않는다.
3. 동일 부모의 동일 인덱스/출력 위치에서 **nextVComponent === committedVComponent**를 생략 조건으로 삼는다. type/props만 따로 비교하지 않는다. 현재 children은 props 안에 있지만 구조가 바뀌어도 VNode 동일성 계약이 명확하다. 다른 위치의 같은 VNode를 찾아 이동시키거나 key 매칭을 도입하지 않는다.
4. 초기에는 단일 host 반환 경계만 지원한다. 경계 헤더 하나를 WIP로 복제해 새 return/sibling에 연결하고, 그 아래의 커밋된 자손은 불변으로 공유하며 방문하지 않는 안이다. flags/deletions/임시 커서는 새 attempt 기준으로 초기화한다. 여러 반환·빈 출력·텍스트 병합 경계는 기존 경로로 fallback한다. 중첩 경계도 같은 규칙이 성립해야 한다.
5. Render에서 캐시 적중한 하위의 함수 실행·재조정·props diff를 생략하고, 그 영역에서 Commit 변경 목록도 생성하지 않는다. 현재 Commit은 변경 목록 방식이므로 subtreeFlags를 흉내 내는 새 전체 DFS를 넣을 이유가 없다. 공유 자손의 return을 따라 올라가야 하는 경로가 생기면 먼저 설계를 고친다.

이 조건은 React.memo의 prop별 얕은 비교보다 좁다. 자식 Hooks와 컨텍스트가 없는 과제 제약 아래에서만 적용하며, 자식 상태/컨텍스트가 추가되면 레인·컨텍스트·descendant work 조건을 함께 설계해야 한다.

## 불변성·순수성·핸들러 계약

- 기존 h는 VComponent·props·children 배열을 이미 얕게 동결한다. 전제 테스트에서도 확인했다. data.servers[i].cells 같은 중첩 데이터는 깊게 동결하지 않는다.
- **같은 VNode 참조의 중첩 데이터를 제자리 수정하면 갱신되지 않을 수 있으며 이는 의도된 불변성 계약 위반이다.** 변경하려면 필요한 상위 데이터 참조도 새로 만들어 캐시 의존성을 갱신한다. B-4 구현 시 제자리 수정+동일 VNode에서 이전 화면이 유지되는 계약 테스트와, 새 데이터/VNode를 주면 갱신되는 정상 테스트를 짝으로 둔다. 현재는 shallow freeze와 중첩 값이 실제로 mutable하다는 사실만 검증했다.
- 자식은 props만으로 결과를 정하는 순수 함수다. 시간·난수·mutable 모듈 전역을 읽는 자식을 생략해도 같은 결과라고 보장하지 않는다. 이 역시 성능 옵션의 명시적 계약이다.
- 생략된 Heatmap의 이전 위임 핸들러는 캐시된 VNode 자신의 props와 일관된다. onSelect는 안정적인 setter와 함수형 업데이트(prev => ...)를 쓰므로 오래된 selected를 캡처해 읽지 않는다. 전제 테스트는 같은 onSelect를 두 번 호출해 +2 누적을 확인한다.

## 승인받을 앱 최소 변경안

우선 **입력 에코의 Sync 렌더에서 Heatmap 전체를 생략**하는 데 범위를 둔다. 아래는 예시이며 적용하지 않았다.

```js
const onSelect = useMemo(
  () => (server, minute) => setSelected((prev) => ({
    server, minute, seq: (prev ? prev.seq : 0) + 1,
  })),
  [setSelected],
);
const heatmapVNode = useMemo(
  () => h(Heatmap, { data, matches, slo, selected, cellCost: props.cellCost, onSelect }),
  [data, matches, slo, selected, props.cellCost, onSelect],
);
// 기존 return의 h(Heatmap, ...) 자리에 heatmapVNode
```

핵심은 props 객체만이 아니라 **h의 결과 VComponent**를 캐시하는 것이다. query만 바뀌고 matchQuery가 아직 이전 값이면 같은 VComponent와 props를 재사용한다. Transition에서 matches가 바뀌면 정상적으로 Heatmap을 다시 계산한다. 기존 h나 stack runtime을 수정할 필요는 없다.

이는 D-A27 앱 예외이므로 B-4 착수 승인과 함께 별도로 확인해야 한다. useMemo는 루트에서만 사용한다. 새 useCallback/useRef API나 자식 Hook은 필요 없다.

## 클릭 시 다시 그려야 할 범위

선택 표시가 히트맵 **안**에 있다. Cell은 selected 값으로 `.sel`을 만들고 Row는 selectedMinute를 전달한다(`heatmap-app.js:97`, `:113`, `:152`). 클릭은 DetailPanel·ClickCounter·document.title도 바꾼다.

- 다른 셀을 선택하면 이전 셀의 선택 해제와 새 셀의 선택 표시가 필요하다. 같은 행이면 한 행, 다른 행이면 두 행이 시각적으로 바뀐다. 첫 선택이면 새 행 하나다.
- 하지만 위 최소안에서는 selected 객체가 바뀌므로 Heatmap 캐시가 깨지고, map이 모든 Row props를 새로 만든다. **엄격한 props 참조 비교만으로 클릭을 한두 행 계산으로 줄일 수 없다.** DOM 변경 범위가 작다는 것과 함수 재실행 범위가 작다는 것을 구분한다.
- 같은 셀을 다시 눌러 seq만 늘어나는 경우에도 selected 객체는 새 참조다. 추가 최소안으로 Heatmap용 선택 좌표를 `useMemo`의 server/minute 의존성으로 고정하고 seq는 외부 상세·카운터에만 사용하면 이 경우에는 전체 Heatmap을 생략할 수 있다. 이것도 별도 앱 변경 승인 항목이다.
- 서로 다른 셀 클릭의 한두 행 실행은 아래의 rowsBase/선택 행 배열 방식으로 후속 설계할 수 있다. Heatmap 인터페이스와 루트 Hook 구성이 넓어지므로 **이번 최소안의 승인 범위에서 분리**한다. prop별 비교로 조건을 바꾸거나 mutable Map을 추가하지 않는다.

검색 결과·SLO·새 데이터가 달라지면 많은/전체 행이 실제로 바뀔 수 있다. 그 경우 bailout이 전체 작업을 없애 준다고 기대하지 않는다. Row가 다시 실행되면 Cell VNode들도 새로 만들어지는 한계도 남는다.

## stack 비교 공정성

앱의 useMemo/onSelect 고정은 stack의 루트 할당·VNode 생성 비용에도 영향을 준다. 다만 현재 Heatmap이 실행되면 위임 onClick 래퍼는 다시 만들어지므로, onSelect 고정만으로 stack의 그 핸들러 교체까지 없어지지는 않는다. 따라서 B-3의 기존 앱 결과와 B-4 캐시 앱 결과를 단순 비교하지 않는다.

권장 비교는 다음 2×2이며 stack도 각 앱 변형에서 같은 세션에 다시 측정한다.

| 앱 | fiber | fiber-bailout |
| --- | --- | --- |
| 현재 앱 | B-3 동작 재측정 | VComponent 참조가 계속 바뀌어 생략 효과가 작은 대조군 |
| 승인된 최소 캐시 앱 | 앱 캐시만의 효과 | 앱 캐시+bailout 효과 |

모든 엔진에 같은 앱 변형·입력·크기·비용을 사용하고 앱 변형과 커밋을 원자료에 기록한다. 과거 기준선은 보존한다. key 비교·가상 목록·CSS 변경·배치 크기 조정은 별개 변수로 섞지 않는다.

## 실제 React와의 대응 — 문서·소스 직접 확인

이 안은 **React의 기본 props 동일성 bailout + JSX 노드 메모이제이션**에 대응한다. 같은 element 객체를 다시 전달하면 memo 래퍼 없이도 자식 실행을 생략할 수 있다. 공식 useMemo 문서의 “Memoizing individual JSX nodes” 절에서 JSX 노드 자체를 useMemo하는 대안과, 직접 감싸는 방식이 불편해 보통 memo를 선택한다는 설명을 확인했다. [useMemo 공식 문서](https://react.dev/reference/react/useMemo#memoizing-individual-jsx-nodes)

소스 예시는 React v19.2.0에 고정해 확인했다. beginWork는 props 참조가 같을 때도 업데이트 레인과 컨텍스트를 검사하며, 하위 작업이 있으면 자식 처리를 계속한다. 이번 프로젝트는 순수 자식에 상태·컨텍스트가 없어서 그 조건이 단순해진다. 다만 루트는 예외다. [ReactFiberBeginWork](https://github.com/facebook/react/blob/v19.2.0/packages/react-reconciler/src/ReactFiberBeginWork.js)

React가 모든 bailout에서 반드시 경계 자식 하나를 복제하는 것은 아니다. 하위 작업이 없으면 바로 생략할 수 있고, cloneChildFibers를 호출하는 경로는 필요한 직계 자식과 형제들을 복제한다. **이번 단일 host 경계의 한 헤더 복제는 본 프로젝트의 설계 선택**이며 React 전체 동작의 동일 구현이라고 하지 않는다. [ReactChildFiber](https://github.com/facebook/react/blob/v19.2.0/packages/react-reconciler/src/ReactChildFiber.js)

React.memo의 기본 조건은 prop별 Object.is 비교다. 이번 같은 VComponent 참조 조건은 그보다 좁다. useDeferredValue의 느린 자식 최적화도 이전 deferred prop의 자식을 긴급 경로에서 생략할 수 있어야 효과가 있고, useTransition API 자체가 memo 래퍼를 필수로 요구하는 것은 아니다. [memo](https://react.dev/reference/react/memo), [useDeferredValue](https://react.dev/reference/react/useDeferredValue#deferring-re-rendering-for-a-part-of-the-ui), [useTransition](https://react.dev/reference/react/useTransition)

## 측정·검증 조건 (B-4 구현 승인 후)

2×2의 각 실행·레인·attempt마다 시간 지표와 아래 카운터를 함께 기록한다. 폐기 attempt도 따로 보존한다. 카운터는 아직 구현하지 않았다.

| 카운터 | 정의 |
| --- | --- |
| rootCalls / childCalls | 루트와 순수 자식 함수 호출 수를 분리 |
| renderFiberVisits | beginWork/생략 경계 진입 수. 단위 작업 반복 횟수(renderWorkUnits)와 구분 |
| commitFiberVisits | commitEffectVisits+commitAnchorSiblingVisits. 중복 방문도 포함한 횟수 |
| commitEffectVisits | 변경 목록의 fiber 처리 횟수 |
| commitAnchorSiblingVisits | 삽입 anchor를 찾기 위해 확인한 형제 수. Commit 방문 비용에서 숨기지 않음 |
| commitHookVisits | 루트 Hook 큐 반영·레인 재계산 방문 수 |
| liveDomWrites | 연결된 DOM에 엔진이 실제 수행한 속성·텍스트·삽입·삭제 호출 수(입력 주입 등 외부 변경 제외). 유일 노드 수가 아님 |
| detachedDomOps / eventHandlerWrites | detached 구성과 핸들러 표 갱신을 실제 화면 DOM 변경과 분리 |

Render/Commit 전체 합계와 대상 Heatmap 경계 내부의 방문 수를 모두 보고한다. 적중한 Heatmap은 자식 호출·하위 Render 방문·하위 Commit 방문·내부 DOM 변경이 0이어야 한다. 경계 헤더 자체와 외부 SearchBar 등 작업은 제외하지 말고 별도 집계한다. DOM API 내부 비용과 브라우저 Layout/Paint는 이 카운터에 포함되지 않는다.

정확성 테스트는 다음으로 고정한다.

- 이번 전제 테스트의 setter 안정성과 **중단된 Transition 뒤 Sync의 커밋 VNode 참조 === 직전 커밋 값**을 B-4에서도 유지한다.
- 같은 VComponent면 실제로 생략하고, 새 VComponent·다른 위치·다른 출력 형태면 정상 실행/fallback한다. 같은 셀 재클릭, 이전/새 선택, 핸들러·document.title도 확인한다.
- 공유 경계 안에서 Commit이 내려가지 않는지와, 생략 해제 후 깊은 자손 삽입/삭제 시 올바른 부모·형제에 반영되는지를 검증한다. 배열·텍스트·인접 텍스트 병합·빈 출력·여러 반환 fallback도 포함한다.
- 입력·클릭·같은 셀 재클릭·수신·Transition 도중 Sync를 섞은 **고정 seed 무작위 스크립트**를 fiber/fiber-bailout에 같은 입력으로 재생한다. document.title과 전역 activeEngine 간섭을 피하기 위해 별도 페이지/격리 환경을 쓴다.
- 엔진마다 허용되는 중간 Commit 수와 타이밍이 다를 수 있으므로 단순 n번째 Commit끼리는 비교하지 않는다. 매 Commit의 적용 action/레인/커밋 상태 버전을 기록해 그 상태의 순수 렌더 oracle과 DOM 직렬화를 비교하고, passive effect drain 후 document.title을 비교한다. 같은 상태 버전이 양쪽에 있으면 직접 짝지어 비교하고, 마지막 수렴 상태도 비교한다. 모든 Commit을 검사하되 합법적인 중간 스냅샷 차이를 오류로 보지 않는다.

## 별도 후속안 — 두 useMemo로 행 단위 클릭 처리

다음은 최소 B-4와 **별도 승인할 항목**이다. 루트에서 선택 없는 기본 행 VNode 배열과 선택 행만 바꾼 배열을 고정된 두 useMemo로 만든다. mutable Map과 자식 Hook은 필요 없다. 현재 앱의 matches는 null일 수 있고 slo/cellCost도 Row 출력에 영향을 주므로 의존성에 포함한다.

```js
const rowsBase = useMemo(
  () => data.servers.map((server, i) => h(Row, {
    server, matchRow: matches ? matches[i] : null,
    slo, selectedMinute: null, cellCost: props.cellCost,
  })),
  [data, matches, slo, props.cellCost],
);
const selRow = selected
  ? data.servers.findIndex((server) => server.id === selected.server)
  : -1;
const selMinute = selected ? selected.minute : null;
const rows = useMemo(
  () => selRow < 0 ? rowsBase : rowsBase.map((v, i) =>
    i === selRow ? h(Row, {
      server: v.props.server, matchRow: v.props.matchRow,
      slo: v.props.slo, selectedMinute: selMinute,
      cellCost: v.props.cellCost,
    }) : v),
  [rowsBase, selRow, selMinute],
);
// Heatmap은 rows와 안정적인 onSelect를 받아 기존 #heatmap 위임 컨테이너로 감싼다.
```

Row가 기존처럼 server.id의 host key를 만들게 하며 key 매칭 알고리즘은 추가하지 않는다. A→B 행 선택에서는 A가 기본 VNode로 복귀하고 B가 새 선택 VNode가 되어 두 행이 실행된다. 같은 행 안의 이동은 한 행, 같은 셀 재클릭은 좌표가 같아 rows 참조를 유지할 수 있다. seq는 외부 카운터/상세에만 영향을 준다. 배열 생성·행 검색은 여전히 O(행 수)이고, 선택 행은 100개 Cell을 다시 계산할 수 있으므로 O(1) 클릭이라고 주장하지 않는다.

값은 deps에서 순수하게 계산하므로 WIP 폐기 시 커밋 캐시가 오염되지 않는다. 다만 Heatmap 인터페이스, 루트 Hook 수, 중첩 Row 경계 보존이 추가로 필요하고 Row가 단일 host를 반환하는 조건도 검증해야 한다. 이 안까지 승인된 것처럼 구현하지 않는다.

## 이번 검증 결과

- `npm run test:run`: 33개 파일, 335개 테스트 통과(전제 테스트 4개 추가).
- `npm run typecheck`: 통과.
- `npm run build`: 통과.
- `git diff --check`: 통과. 실제 앱과 런타임 구현 파일은 변경하지 않았다. 성능 재측정은 하지 않았다.

## 현재 상태

기존 B-3 전제 확인 테스트와 설계 수정만 수행했다. fiber-bailout·경계 보존·카운터·실제 앱 캐시·행 단위 클릭 최적화는 구현하지 않았다. 엔진 경계 보존과 최소 앱 캐시의 착수 승인을 받은 뒤 진행하며, 행 단위 후속안은 별도로 승인받는다.
