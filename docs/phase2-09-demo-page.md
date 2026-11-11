# Phase 2-9. 데모 페이지 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

Phase 2에서 만든 `FunctionComponent`, `useState`, `useEffect`, `useMemo`로 동작하는 Todo 리스트 페이지를 만든다. 상태는 루트 컴포넌트에만 두고, 자식 컴포넌트는 props만 받는 순수 함수로 만든다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 사용자 동작 (할 일 입력·추가, 완료 체크, 삭제, 필터 변경) |
| 출력 | 자동으로 갱신되는 화면, 디버그 패널 (hooks 상태, 렌더링 횟수, Patch 목록) |
| 제약 | HTML, CSS, 바닐라 JS/TS만 사용 |

---

## 2. 화면 구성

```
┌────────────────────────────────────────────┐
│  할 일 (남은 일 2개)                 Header  │
│  [ 입력칸                    ] [추가]  Input │
│  (전체) (진행 중) (완료)          FilterBar │
│  ☑ 우유                           [삭제]    │
│  ☐ 빵                             [삭제]    │  TodoList / TodoItem
│  ☐ 쌀                             [삭제]    │
│  완료 1개 / 전체 3개                 Footer  │
├────────────────────────────────────────────┤
│  디버그: 렌더링 5회 | hooks | 마지막 Patch    │  (앱 밖, onCommit으로 갱신)
└────────────────────────────────────────────┘
```

---

## 3. 컴포넌트 구조

```
App (루트, 상태·Hook 전부 보유)
 ├─ Header      { remaining }
 ├─ TodoInput   { value, onInput, onAdd }
 ├─ FilterBar   { filter, onChange }
 ├─ TodoList    { items, onToggle, onRemove }
 │   └─ TodoItem { item, onToggle, onRemove }   (key = item.id)
 └─ Footer      { doneCount, total }
```

### 3.1 App의 상태와 Hook

| Hook | 이름 | 내용 |
| --- | --- | --- |
| `useState` | `todos` | `{ id, text, done }` 배열 |
| `useState` | `input` | 입력칸 값 |
| `useState` | `filter` | `'all'` / `'active'` / `'done'` |
| `useMemo` | `visible` | `filter`에 맞는 목록 — deps `[todos, filter]` |
| `useMemo` | `counts` | `{ remaining, done, total }` — deps `[todos]` |
| `useEffect` | 제목 변경 | `document.title = '할 일 ' + remaining + '개'` — deps `[counts.remaining]` |
| `useEffect` | 시작 로그 | mount 시 1회 콘솔 출력 — deps `[]` |

### 3.2 App의 이벤트 함수 (자식에게 props로 전달)

| 함수 | 동작 |
| --- | --- |
| `onInput(e)` | `setInput(e.target.value)` |
| `onAdd()` | 입력이 공백이면 무시, 아니면 `setTodos(prev => [...prev, 새 할 일])`, `setInput('')` |
| `onToggle(id)` | `setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))` |
| `onRemove(id)` | `setTodos(prev => prev.filter(t => t.id !== id))` |
| `onChange(f)` | `setFilter(f)` |

### 3.3 자식 컴포넌트 규칙

- Hook을 호출하지 않는다. (호출하면 오류)
- props만 읽어 `h()`로 VNode를 반환한다.
- 상태를 바꿀 때는 props로 받은 함수만 호출한다. (Lifting State Up)

---

## 4. 디버그 패널

`FunctionComponent`의 `onCommit` 콜백으로 앱 바깥에 표시한다.

| 항목 | 내용 |
| --- | --- |
| 렌더링 횟수 | `onCommit` 호출 수 |
| hooks | `app.hooks`의 `kind`와 `value` / `deps` 요약 |
| 마지막 Patch | Phase 1 Patch 로그 형식, 이벤트 교체는 `이벤트 교체 n건`으로 묶어 표시 |

**목적**: 상태가 바뀌어도 바뀐 부분만 Patch되는 것, 같은 칸에서 상태가 유지되는 것을 화면에서 확인한다.

---

## 5. 파일 구성

```
phase2/
├─ index.html          # #app, #debug 영역
├─ styles.css
└─ src/
   ├─ main.ts          # new FunctionComponent(App, #app), onCommit → 디버그 패널
   ├─ App.ts
   ├─ components/
   │  ├─ Header.ts
   │  ├─ TodoInput.ts
   │  ├─ FilterBar.ts
   │  ├─ TodoList.ts
   │  ├─ TodoItem.ts
   │  └─ Footer.ts
   └─ debug.ts         # 디버그 패널 표시
```

---

## 6. 기대 입출력 (사용 시나리오)

초기 데이터: `우유(완료)`, `빵(진행 중)`

| # | 사용자 동작 | 화면 | `document.title` | 렌더링 | 마지막 Patch (이벤트 교체 제외) |
| --- | --- | --- | --- | --- | --- |
| 1 | 페이지 로드 | 남은 일 1개, 우유 ☑, 빵 ☐ | 할 일 1개 | 1회 | 없음 (mount) |
| 2 | 입력칸에 `쌀` 입력 | 입력칸에 `쌀` | 할 일 1개 | 2~3회 (글자마다) | `PROPS input value` |
| 3 | 추가 클릭 | 쌀 ☐ 추가, 입력칸 비움, 남은 일 2개 | 할 일 2개 | +1회 | `TEXT` (제목), `PROPS` (입력칸), `CREATE` (쌀), `TEXT` (Footer) |
| 4 | 빵 체크 | 빵 ☑, 남은 일 1개 | 할 일 1개 | +1회 | `TEXT` (제목), `PROPS` (빵 체크·class), `TEXT` (Footer) |
| 5 | 필터 "진행 중" | 쌀만 표시 | 할 일 1개 | +1회 | 필터 버튼 `PROPS`, 목록 변경 |
| 6 | 필터 "전체" | 3개 표시 | 할 일 1개 | +1회 | 목록 변경 |
| 7 | 우유 삭제 | 빵, 쌀 표시 | 할 일 1개 | +1회 | 목록 변경 |
| 8 | 공백만 입력 후 추가 | 변화 없음 | 할 일 1개 | 입력 렌더링만 | — |

확인 포인트:

- 2번: `useMemo`의 `counts`가 다시 계산되지 않음 (`todos` 그대로)
- 2번: 입력 중 커서가 튀지 않음
- 3번: 이벤트 함수 2번(`setTodos`, `setInput`) → 렌더링 1회
- 4번: 제목 `useEffect`만 다시 실행, 시작 로그 effect는 실행 안 됨

---

## 7. 요구사항 대응표

| 요구사항 | 구현 위치 |
| --- | --- |
| 함수형 컴포넌트 | `App`, `components/*` |
| `FunctionComponent` 클래스: `hooks` 배열 | 4단계 |
| `mount()` 처음 렌더링 | 4단계 |
| `update()` 상태 변경 후 재렌더링 | 4단계 + 6단계 예약 |
| Hook은 최상위 컴포넌트에서만 | 5단계 `useHookSlot` 오류 |
| State는 루트에서만, 자식은 props만 (Lifting State Up) | 3.1 ~ 3.3 |
| State 변경 → 화면 자동 갱신 | 6단계 `setState` → `update()` |
| `useState` | 6단계 |
| `useEffect` | 7단계 |
| `useMemo` | 8단계 |
| 함수는 매번 새로 실행되는데 상태 유지 | 5단계 (인스턴스의 `hooks` 배열 + 호출 순서) |
| 외부 프레임워크 금지 | 전체 바닐라 TS |

---

## 8. 테스트 계획

| 항목 | 확인 방법 |
| --- | --- |
| 6장 시나리오 1~8 | 직접 조작하여 표와 일치 확인 |
| 상태 유지 | 디버그 패널에서 렌더링마다 `hooks` 길이 7 유지 |
| 바뀐 부분만 반영 | 4번에서 우유·쌀 `li`는 같은 DOM 객체 유지 |
| 자식 Hook 금지 | `TodoItem`에 `useState`를 임시로 넣으면 오류 표시 |
| 묶음 렌더링 | 3번에서 렌더링 1회 증가 |

---

## 9. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | `index.html`, `styles.css` | 빈 화면 구조 |
| 2 | 자식 컴포넌트 6개 (고정 props로 확인) | 정적 화면 표시 |
| 3 | `App` 상태·이벤트 함수 | 시나리오 1~4, 7, 8 통과 |
| 4 | `useMemo` 필터·집계 | 시나리오 5, 6 통과 |
| 5 | `useEffect` 제목·로그 | 제목 변경 확인 |
| 6 | 디버그 패널 | 8장 전부 통과 |

---

## 10. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | 할 일 `id` 생성 방식 (현재 안: 증가하는 숫자를 문자열로) |
| 결정 필요 | 데모를 Phase 1 검증 페이지와 별도 페이지로 둘지 (현재 안: 별도 `phase2/`) |
| 리스크 | Phase 1 diff는 인덱스 기반이라 목록 중간 삭제 시 Patch가 많음 → 동작은 정상, key 기반 diff 도입 시 개선 |
| 리스크 | ES Module은 `file://`에서 로드 안 됨 → 로컬 서버로 실행 |
