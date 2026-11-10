# B-4 설계안 · fiber-bailout (구현하지 않음)

2026-11-10 · B-3 이후 승인용 설계 · B-4용 앱 변경 예외는 아직 승인되지 않음

## 결론

별도 `fiber-bailout` 모드에서 **같은 위치·같은 순수 자식 함수·같은 props 참조**이면 함수 실행과 하위 재조정을 건너뛰는 안을 제안한다. 루트는 Hook 업데이트가 있으므로 props가 같아도 항상 실행한다. 레인·큐·중단·재시작·인덱스 비교는 B-3과 동일하게 유지한다.

현재 앱에 모드 이름만 추가해서는 효과가 거의 없다. `h(Component, props)`가 매번 props와 children 배열을 새로 만들고, 현재 Fiber는 컴포넌트 경계를 보존하지 않는다. 따라서 엔진에 커밋된 자식 경계를 남기는 작업과, 앱에서 같은 VComponent를 재사용하는 최소 변경이 함께 필요하다. 이번에는 **문서만 작성**했으며 mode·bailout 코드·앱 변경은 적용하지 않았다.

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

## 엔진 설계 제안

1. 모드는 `fiber-bailout` 하나를 추가한다. 기존 `fiber` 결과와 동작은 변경하지 않는다. 스케줄러·레인·Hook 큐·Commit 구현은 공유한다.
2. 커밋된 순수 컴포넌트 경계에 type, 원래 props 참조, 원래 VComponent, host 출력 구간을 보관한다. 전역 함수 캐시가 아니라 루트별 current/WIP 기록이다. Render에서 만든 기록은 Commit 때만 채택하고 폐기 시 버린다.
3. 같은 부모의 같은 인덱스/출력 위치에서 type과 props 참조가 같으면 이전 출력 구간을 재사용한다. 다른 위치에서 찾은 같은 VNode를 이동시키면 인덱스 비교 조건이 깨지므로 하지 않는다. key 매칭도 도입하지 않는다.
4. 단순히 함수 결과만 캐시하고 host 하위를 전부 걷는 것은 목표를 만족하지 않는다. 해당 구간의 child 함수 실행·host 재조정·불필요한 props diff까지 건너뛰어야 한다. 반대로 재사용 subtree를 전체 복사하면 비용이 다시 생긴다. immutable committed subtree와 WIP의 parent/return 관계를 안전하게 다루는 구조가 필요하다. 공유된 current의 return 포인터를 Render 중 고치지 않는다.
5. 초기 적용 범위는 Heatmap/Row처럼 **단일 host 요소를 반환한 순수 자식**을 제안한다. 텍스트·빈 출력·복수 출력은 기존 경로로 처리한다. 인접 텍스트 병합과 투명 함수 경계를 잘못 바꾸면 기존 차등 테스트가 깨지기 때문이다. 모든 형태를 지원하려면 출력 span·텍스트 병합 경계 설계를 추가 승인한다.

props 참조 비교는 `===`이며 React.memo 같은 prop별 얕은 비교를 몰래 넣지 않는다. 루트 상태 변경을 props 참조만 보고 무시하지 않는다. 자식 Hooks 금지 조건이 있어 자식 내부 상태 레인을 검사하는 확장은 이번 설계에서 제외한다.

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
- 서로 다른 셀 클릭까지 줄이려면 변경 없는 Row의 **VNode 참조**를 보존할 계획이 더 필요하다. Heatmap/Row는 순수 자식이므로 거기에 Hook을 추가하지 않는다. 루트의 커밋 안전한 행 캐시/출력 구성을 설계하거나 prop별 비교로 조건을 바꾸는 별도 안을 검토해야 한다. mutable 전역 Map을 Render에서 갱신하는 우회는 중단 안전성을 깨뜨릴 수 있어 제안하지 않는다.

검색 결과·SLO·새 데이터가 달라지면 많은/전체 행이 실제로 바뀔 수 있다. 그 경우 bailout이 전체 작업을 없애 준다고 기대하지 않는다. Row가 다시 실행되면 Cell VNode들도 새로 만들어지는 한계도 남는다.

## stack 비교 공정성

앱의 useMemo/onSelect 고정은 stack의 루트 할당·VNode 생성 비용에도 영향을 준다. 다만 현재 Heatmap이 실행되면 위임 onClick 래퍼는 다시 만들어지므로, onSelect 고정만으로 stack의 그 핸들러 교체까지 없어지지는 않는다. 따라서 B-3의 기존 앱 결과와 B-4 캐시 앱 결과를 단순 비교하지 않는다.

권장 비교는 다음 2×2이며 stack도 각 앱 변형에서 같은 세션에 다시 측정한다.

| 앱 | fiber | fiber-bailout |
| --- | --- | --- |
| 현재 앱 | B-3 동작 재측정 | props 참조가 계속 바뀌어 생략 효과가 작은 대조군 |
| 승인된 최소 캐시 앱 | 앱 캐시만의 효과 | 앱 캐시+bailout 효과 |

모든 엔진에 같은 앱 변형·입력·크기·비용을 사용하고 앱 변형과 커밋을 원자료에 기록한다. 과거 기준선은 보존한다. key 비교·가상 목록·CSS 변경·배치 크기 조정은 별개 변수로 섞지 않는다.

## 실제 React와의 대응

React의 useDeferredValue 문서는 느린 자식에 이전 deferred prop을 전달하는 빠른 부모 렌더를 위해 memo로 그 자식 재렌더를 생략하도록 설명한다. deferred 값만 이전 값이어도 부모가 자식을 다시 실행하면 긴급 경로가 여전히 비싸다. 이번 앱의 Sync query/Transition matchQuery와 같은 문제다. [useDeferredValue 공식 문서](https://react.dev/reference/react/useDeferredValue#deferring-re-rendering-for-a-part-of-the-ui)

다만 **useTransition API 자체가 memo를 필수 요건으로 요구하는 것은 아니다.** Transition은 우선순위·중단 가능한 갱신을 제공한다. memo는 변하지 않은 무거운 자식을 긴급 경로에서 생략할 때 결합하는 최적화다. React.memo는 기본적으로 prop별 Object.is 비교이고 이번 안의 props 객체 전체 참조 비교보다 넓은 조건이다. 이 차이를 동일한 구현이라고 부르지 않는다. [useTransition](https://react.dev/reference/react/useTransition), [memo](https://react.dev/reference/react/memo)

## B-4 승인 후 검증할 것

- 같은 props/VNode 참조에서 자식 함수 호출과 host 방문 수가 실제로 줄어드는지, 새 참조에서는 정상 재계산하는지.
- 루트의 레인별 상태와 effect는 생략되지 않는지, 폐기한 WIP의 캐시가 다음 Commit에 새지 않는지.
- 이벤트 핸들러·DOM identity·선택 표시·문서 제목과 텍스트/다중 반환 fallback이 기존 차등 결과와 같은지.
- 입력 p95와 Sync 작업 시간, 폐기 비용, 최종 히트맵 지연을 함께 측정하는지. 클릭 한두 행 최적화는 최소안만으로 달성했다고 주장하지 않는지.

B-4는 아직 구현하지 않았다. 앱 예외와 엔진의 경계 보존 범위를 승인받은 뒤 별도 작업으로 진행한다.
