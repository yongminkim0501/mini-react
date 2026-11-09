# Phase 2-6. `useState` 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

상태 값을 `hooks` 배열에 저장하고, 값이 바뀌면 화면을 자동으로 다시 그리는 `useState`를 구현한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 초기값 (또는 초기값을 만드는 함수) |
| 출력 | `[현재 값, setState]` |
| 사용처 | 루트 컴포넌트의 모든 상태 |
| 핵심 | `setState` → 값 저장 → `update()` 예약 → 화면 자동 갱신 |

---

## 2. 범위

| 구분 | 내용 |
| --- | --- |
| 포함 | `useState`, `setState`, 업데이트 예약(묶어서 1회 렌더링) |
| 제외 | 자식 컴포넌트 상태 (금지) |

---

## 3. 처리 흐름

### 3.1 `useState(initial)`

```
slot = useHookSlot('state')
첫 렌더링이면
  value = initial이 함수면 initial() 결과, 아니면 initial
  setState 함수 생성
  hooks[index] = { kind: 'state', value, setState }
return [hooks[index].value, hooks[index].setState]
```

- `setState`는 첫 렌더링에서 한 번만 만든다. 이후 렌더링에서도 **같은 함수**를 돌려준다.

### 3.2 `setState(next)`

```
[1] 컴포넌트가 unmount 상태      → 무시
[2] 렌더링 중(isRendering)       → 오류 "렌더링 중에는 setState를 호출할 수 없습니다"
[3] newValue = next가 함수면 next(현재 값), 아니면 next
[4] Object.is(newValue, 현재 값) → 무시 (렌더링 안 함)
[5] hooks[index].value = newValue
[6] scheduleUpdate(component)
```

- **2번 이유**: 렌더링 중 상태를 바꾸면 다시 렌더링 → 다시 변경 → 무한 반복이 된다.
- **4번 이유**: 같은 값이면 화면도 같으므로 렌더링할 필요가 없다.

### 3.3 업데이트 예약 (`scheduleUpdate`)

```
이미 예약됨 → 아무것도 안 함
예약 안 됨  → 예약 표시, queueMicrotask(() => { 예약 해제; component.update() })
```

- **이유**: 한 번의 클릭에서 `setState`를 여러 번 불러도 렌더링은 한 번만 한다. 마이크로태스크는 현재 이벤트 처리가 끝난 직후, 화면을 그리기 전에 실행된다.

---

## 4. 함수형 업데이트

```js
// 값으로 넣기: 렌더링 시점의 n을 기억하므로 3번 불러도 +1
setN(n + 1); setN(n + 1); setN(n + 1)

// 함수로 넣기: 매번 최신 값을 받으므로 +3
setN((prev) => prev + 1); setN((prev) => prev + 1); setN((prev) => prev + 1)
```

이전 값에 의존하는 변경은 함수형을 쓰도록 데모와 문서에서 안내한다.

---

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/runtime/hooks/
├─ useState.ts
└─ scheduler.ts   # scheduleUpdate
```

### 5.2 함수 목록

| 함수 | 입력 → 출력 |
| --- | --- |
| `useState` | 초기값 → `[값, setState]` |
| `setState` (칸마다 하나) | 새 값 또는 함수 → 없음 |
| `scheduleUpdate` | 컴포넌트 → 없음 |

---

## 6. 기대 입출력

**컴포넌트**

```js
function App() {
  const [n, setN] = useState(0)
  const [text, setText] = useState(() => '시작')
  return h('div', null,
    h('p', null, text, ': ', n),
    h('button', { onClick: () => { setN((p) => p + 1); setN((p) => p + 1); setText('변경') } }, '+2')
  )
}
```

| 시점 | 화면 `p` | `hooks` | `App` 실행 횟수 |
| --- | --- | --- | --- |
| mount 후 | `시작: 0` | `[{value:0}, {value:'시작'}]` | 1 |
| 버튼 1회 클릭 후 | `변경: 2` | `[{value:2}, {value:'변경'}]` | 2 (setState 3번에 렌더링 1번) |
| 다시 클릭 | `변경: 4` | `[{value:4}, {value:'변경'}]` | 3 |

**Patch** (두 번째 클릭): `TEXT [0,0,0] '변경: 4'` + 버튼 `onClick` 교체

---

## 7. 테스트 계획

| 입력 | 기대 |
| --- | --- |
| 6장 | 6장 표와 일치 |
| `setN(n)` (같은 값) | 렌더링 안 함 |
| `setN(n + 1)` 3회 | 결과 +1 |
| `setN(p => p + 1)` 3회 | 결과 +3, 렌더링 1회 |
| 렌더링 중 `setN` 호출 | 오류 |
| `unmount` 후 `setN` | 무시, 오류 없음 |
| 렌더링 2회 후 `setState` 비교 | 같은 함수 (`===`) |
| 초기값 함수 | 첫 렌더링에서만 1회 실행 |

---

## 8. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | `useState` 칸 생성·읽기 | 렌더링 2회에도 값 유지 |
| 2 | `setState` 값 계산, 같은 값 무시 | 관련 테스트 통과 |
| 3 | `scheduleUpdate` 묶음 처리 | 렌더링 1회 테스트 통과 |
| 4 | 렌더링 중·unmount 후 처리 | 7장 전부 통과 |

---

## 9. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | 예약 방식 — `queueMicrotask` vs `requestAnimationFrame` (현재 안: `queueMicrotask`, 즉시 반응) |
| 리스크 | 객체·배열 상태를 직접 수정하고 `setState(같은 객체)` 하면 같은 값으로 보고 무시됨 → 항상 새 객체를 만들도록 안내 (`[...todos, newTodo]`) |
