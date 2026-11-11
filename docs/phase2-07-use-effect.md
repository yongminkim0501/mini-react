# Phase 2-7. `useEffect` 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

화면 반영이 끝난 뒤 실행되는 작업(제목 변경, 타이머, 로그 등)을 등록하는 `useEffect`를 구현한다. 의존성 배열이 바뀔 때만 다시 실행하고, 다시 실행하기 전과 unmount 때 정리 함수를 실행한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | effect 함수, 의존성 배열(선택) |
| 출력 | 없음 (DOM 반영 후 effect 실행) |
| 사용처 | 루트 컴포넌트의 생명주기 작업 |

---

## 2. 범위

| 구분 | 내용 |
| --- | --- |
| 포함 | `useEffect`, 실행 예약, 정리 함수, unmount 시 정리 |
| 포함 | `FunctionComponent.flushEffects` 구현 |
| 제외 | `useLayoutEffect` |

---

## 3. 실행 조건

| 의존성 배열 | 실행 시점 |
| --- | --- |
| 없음 (`useEffect(fn)`) | 매 렌더링 후 |
| 빈 배열 (`[]`) | 처음 mount 후 1회 |
| 값 있음 (`[a, b]`) | mount 후 + `a` 또는 `b`가 바뀐 렌더링 후 |

비교는 5단계의 `depsChanged`를 사용한다.

---

## 4. 처리 흐름

### 4.1 렌더링 중: `useEffect(fn, deps)`

```
slot = useHookSlot('effect')
첫 렌더링이면 hooks[index] = { kind: 'effect', deps: undefined, cleanup: undefined }
depsChanged(이전 deps, deps)가 참이면
  component.pendingEffects에 { index, fn, deps } 추가
```

- 렌더링 중에는 **실행하지 않고 예약만** 한다. 이 시점에는 화면이 아직 바뀌지 않았다.
- `deps`도 실행할 때 저장한다. 렌더링이 오류로 중단되면 저장되지 않아야 하기 때문이다.

### 4.2 반영 후: `flushEffects()` (4단계 `mount` / `update` 마지막)

```
목록 = pendingEffects, pendingEffects = []
목록의 각 항목마다 (등록 순서대로)
  [1] hooks[index].cleanup이 있으면 실행
  [2] ret = fn()
  [3] hooks[index].cleanup = ret가 함수면 ret, 아니면 undefined
  [4] hooks[index].deps = deps
```

- effect 안에서 `setState`를 부르면 다음 렌더링이 예약된다. (6단계 규칙)
- effect 하나에서 오류가 나도 나머지 effect는 실행하고 오류는 콘솔에 출력한다.

### 4.3 unmount

`hooks`에서 `kind === 'effect'`인 칸의 `cleanup`을 모두 실행한다.

---

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/runtime/hooks/useEffect.ts
src/runtime/FunctionComponent.ts   # flushEffects, unmount 정리 추가
```

### 5.2 함수 목록

| 함수 | 입력 → 출력 |
| --- | --- |
| `useEffect` | fn, deps → 없음 |
| `flushEffects` | 없음 → 없음 |
| `runCleanups` | 컴포넌트 → 없음 (unmount용) |

---

## 6. 기대 입출력

**컴포넌트**

```js
function App() {
  const [n, setN] = useState(0)
  useEffect(() => {
    console.log('effect', n)
    document.title = `클릭 ${n}회`
    return () => console.log('cleanup', n)
  }, [n])
  useEffect(() => { console.log('mount only') }, [])
  return h('button', { onClick: () => setN((p) => p + 1) }, n)
}
```

| 동작 | 콘솔 출력 (순서대로) | `document.title` |
| --- | --- | --- |
| mount | `effect 0`, `mount only` | 클릭 0회 |
| 클릭 | `cleanup 0`, `effect 1` | 클릭 1회 |
| 클릭 | `cleanup 1`, `effect 2` | 클릭 2회 |
| `setN(2)` (같은 값) | (없음, 렌더링 안 함) | 클릭 2회 |
| unmount | `cleanup 2` | 클릭 2회 |

**effect 실행 시점 확인**: `effect` 안에서 버튼의 `textContent`를 읽으면 이미 새 값이 들어 있다.

---

## 7. 테스트 계획

| 입력 | 기대 |
| --- | --- |
| 6장 | 표와 일치 |
| 의존성 없음 | 매 렌더링 후 실행 |
| `[]` | 1회만 실행 |
| effect 안에서 DOM 읽기 | 반영 후 값 |
| effect 안에서 `setState` | 다음 렌더링 1회 발생, 무한 반복 없음 (deps 사용 시) |
| effect 2개 중 첫 번째 오류 | 두 번째는 실행됨 |
| unmount | 모든 정리 함수 실행 |
| 렌더링 오류로 반영 안 됨 | effect 실행 안 됨, deps 저장 안 됨 |

---

## 8. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | `useEffect` 칸, 예약 | 렌더링 중 실행 안 됨 확인 |
| 2 | `flushEffects` 실행·정리·deps 저장 | 6장 mount·클릭 통과 |
| 3 | unmount 정리 | 6장 unmount 통과 |
| 4 | 오류 처리 | 7장 전부 통과 |

---

## 9. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | 실행 시점 — DOM 반영 직후 동기 실행 vs 화면 그린 뒤(`setTimeout`) (현재 안: 반영 직후. React의 `useLayoutEffect` 시점과 같음) |
| 리스크 | 의존성 배열을 빠뜨리고 effect 안에서 `setState`하면 무한 렌더링 → 렌더링 횟수가 한 번에 100회를 넘으면 중단하고 오류 출력 |
