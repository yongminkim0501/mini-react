# Phase 2-8. `useMemo` 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

계산 결과를 `hooks` 배열에 저장해 두고, 의존성 배열이 같으면 다시 계산하지 않고 저장된 값을 돌려주는 `useMemo`를 구현한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 계산 함수, 의존성 배열 |
| 출력 | 계산 결과 (의존성이 같으면 이전 값) |
| 사용처 | 필터링된 목록, 개수 집계 등 비용이 드는 계산 |

---

## 2. 범위

| 구분 | 내용 |
| --- | --- |
| 포함 | `useMemo` |
| 제외 | `useCallback` (필요하면 `useMemo(() => fn, deps)`로 대체 가능) |

---

## 3. 처리 흐름

```
slot = useHookSlot('memo')
첫 렌더링이거나 depsChanged(이전 deps, deps)가 참이면
  value = compute()
  hooks[index] = { kind: 'memo', deps, value }
return hooks[index].value
```

| 의존성 배열 | 동작 |
| --- | --- |
| 없음 | 매 렌더링 다시 계산 |
| `[]` | 첫 렌더링에만 계산 |
| 값 있음 | 값이 바뀐 렌더링에만 계산 |

- 계산은 **렌더링 중에 즉시** 한다. (effect와 다름)
- 계산 함수 안에서 `setState`를 부르면 6단계 규칙에 따라 오류가 난다.

---

## 4. useEffect와의 차이

| 항목 | `useMemo` | `useEffect` |
| --- | --- | --- |
| 실행 시점 | 렌더링 중 | DOM 반영 후 |
| 반환값 | 계산 결과를 돌려줌 | 없음 |
| 용도 | 값 계산 | 바깥 작업 (제목, 타이머 등) |
| 정리 함수 | 없음 | 있음 |

---

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/runtime/hooks/useMemo.ts
```

### 5.2 함수 목록

| 함수 | 입력 → 출력 |
| --- | --- |
| `useMemo` | compute, deps → 값 |

---

## 6. 기대 입출력

**컴포넌트**

```js
let computeCount = 0

function App() {
  const [todos, setTodos] = useState([
    { id: 'a', text: '우유', done: true },
    { id: 'b', text: '빵', done: false }
  ])
  const [input, setInput] = useState('')

  const remaining = useMemo(() => {
    computeCount++
    return todos.filter((t) => !t.done).length
  }, [todos])

  return h('div', null,
    h('input', { value: input, onInput: (e) => setInput(e.target.value) }),
    h('p', null, '남은 일: ', remaining)
  )
}
```

| 동작 | `remaining` | `computeCount` |
| --- | --- | --- |
| mount | 1 | 1 |
| 입력칸에 `a` 입력 (`input`만 변경) | 1 | 1 (다시 계산 안 함) |
| 입력칸에 `b` 입력 | 1 | 1 |
| `setTodos([...todos, { id: 'c', text: '쌀', done: false }])` | 2 | 2 |

---

## 7. 테스트 계획

| 입력 | 기대 |
| --- | --- |
| 6장 | 표와 일치 |
| 의존성 없음 | 매 렌더링 계산 |
| `[]` | 1회만 계산 |
| 객체 의존성, 같은 객체 | 다시 계산 안 함 |
| 객체 의존성, 내용 같은 새 객체 | 다시 계산 |
| 반환된 값 | 의존성이 같으면 이전과 같은 객체 (`===`) |
| 계산 함수 안에서 `setState` | 오류 |

---

## 8. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | `useMemo` 칸 생성·재사용 | 6장 표 일치 |
| 2 | 테스트 전체 | 7장 전부 통과 |

---

## 9. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | `useCallback` 추가 여부 (현재 안: 추가 안 함) |
| 리스크 | 의존성에 쓰는 값을 빠뜨리면 오래된 값이 계속 나옴 → 데모에서 의존성 작성 규칙 안내 |
