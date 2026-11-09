# Phase 2-4. `FunctionComponent` 클래스 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

루트 함수형 컴포넌트를 감싸고 상태(`hooks` 배열)를 보관하며, 처음 렌더링(`mount`)과 상태 변경 후 재렌더링(`update`)을 담당하는 클래스를 구현한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 루트 컴포넌트 함수, 컨테이너 요소, (선택) props |
| 출력 | 컨테이너에 렌더링된 화면, 상태가 바뀌면 바뀐 부분만 갱신 |
| 핵심 | 함수는 매번 새로 실행되지만 `hooks` 배열은 인스턴스에 남는다 |

---

## 2. 범위

| 구분 | 내용 |
| --- | --- |
| 포함 | `hooks` 배열, `mount()`, `update()`, `unmount()` |
| 포함 | 렌더링 1회의 전체 순서 (실행 → 펼치기 → 비교 → 반영 → effect) |
| 포함 | 디버그용 `onCommit` 콜백 (Patch 목록 전달) |
| 제외 | Hook 내부 동작 (5~8단계) |

---

## 3. 필드

| 필드 | 설명 |
| --- | --- |
| `fn` | 루트 컴포넌트 함수 |
| `container` | 렌더링할 DOM 요소 |
| `props` | 루트에 넘길 props (기본 `{}`) |
| `hooks` | Hook 상태 배열. 칸 하나 = Hook 호출 하나 |
| `vnode` | 마지막으로 화면에 반영된 VNode (`#root`) |
| `pendingEffects` | 이번 렌더링 후 실행할 effect 목록 |
| `isMounted` | 마운트 여부 |
| `isRendering` | 렌더링 중 여부 (렌더링 중 `setState` 차단용) |
| `onCommit` | 반영 직후 호출되는 콜백 (선택) |

---

## 4. 처리 흐름

### 4.1 렌더링 1회 (`render`, 내부 함수)

```
[1] Hook 실행 환경 시작 (현재 컴포넌트 = this, hookIndex = 0)
[2] result = fn(props)
[3] Hook 실행 환경 종료
[4] Hook 개수 확인 (두 번째 렌더링부터)
[5] return resolve(result)
```

4번: 이전 렌더링과 Hook 호출 개수가 다르면 오류. 조건문 안에서 Hook을 호출한 경우다.

### 4.2 `mount()`

```
newV = render()
Phase 1 mount(container, newV)          ← 컨테이너 내용 교체
this.vnode = newV
isMounted = true
onCommit?.([], newV)
effect 실행 (pendingEffects)
```

### 4.3 `update()`

```
isMounted가 아니면 종료
newV = render()
patches = diff(this.vnode, newV)
applyPatches(container, patches)        ← 실패하면 mount(container, newV)로 복구
this.vnode = newV
onCommit?.(patches, newV)
effect 실행 (pendingEffects)
```

### 4.4 `unmount()`

```
모든 effect 정리 함수 실행
container 비우기
hooks = [], isMounted = false
```

### 4.5 렌더링 중 오류

`fn` 또는 자식 컴포넌트에서 오류가 나면 화면을 바꾸지 않고 이전 화면을 유지한 채 오류를 콘솔에 출력한다. `hooks` 배열은 오류 이전 상태로 남는다.

---

## 5. 전체 흐름 그림

```
           setState()
               │ (예약, 6단계)
               ▼
mount() ─▶ render() ─▶ fn(props) ─▶ resolve() ─▶ diff() ─▶ applyPatches() ─▶ effect 실행
            │            │
            │            └─ useState / useEffect / useMemo 가 hooks[0], hooks[1]… 를 읽고 씀
            └─ hookIndex = 0 으로 초기화
```

---

## 6. 함수 단위 설계

### 6.1 파일 구성

```
src/runtime/
└─ FunctionComponent.ts
```

### 6.2 메서드 목록

| 메서드 | 입력 → 출력 | 공개 |
| --- | --- | --- |
| `constructor` | fn, container, props → 인스턴스 | O |
| `mount` | 없음 → 없음 | O |
| `update` | 없음 → 없음 | O |
| `unmount` | 없음 → 없음 | O |
| `render` | 없음 → `#root` VNode | X |
| `flushEffects` | 없음 → 없음 | X (7단계에서 구현) |

---

## 7. 기대 입출력

**컴포넌트**

```js
function Counter() {
  const [n, setN] = useState(0)
  return h('button', { onClick: () => setN(n + 1) }, '클릭 ', n)
}

const app = new FunctionComponent(Counter, document.getElementById('app'))
app.mount()
```

**mount 후**

| 대상 | 값 |
| --- | --- |
| 화면 | `<button>클릭 0</button>` |
| `app.hooks` | `[{ kind: 'state', value: 0, setState }]` |
| `onCommit` 인자 | `[]` |

**버튼 클릭 → update 후**

| 대상 | 값 |
| --- | --- |
| 화면 | `<button>클릭 1</button>` |
| `app.hooks` | `[{ kind: 'state', value: 1, setState }]` (같은 `setState`) |
| `onCommit` 인자 | `[PROPS [0] onClick 교체, TEXT [0,0] '클릭 1']` |
| DOM | `button` 요소는 같은 객체 유지 |

---

## 8. 테스트 계획

| 입력 | 기대 |
| --- | --- |
| 7장 | 7장 결과와 일치 |
| `mount` 전 `update` | 아무 일도 안 함 |
| 클릭 5회 | 화면 `클릭 5`, `fn` 실행 총 6회, `hooks` 길이 1 유지 |
| 조건에 따라 Hook 호출 개수가 바뀌는 컴포넌트 | 두 번째 렌더링에서 오류, 화면 유지 |
| 렌더링 중 오류 발생 | 이전 화면 유지 |
| `unmount` | 컨테이너 비어 있음, 정리 함수 실행 |
| 같은 페이지에 인스턴스 2개 | 서로의 `hooks`가 섞이지 않음 |

---

## 9. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | 필드, `render` (Hook 없는 컴포넌트) | 고정 화면 mount |
| 2 | `mount` / `update` (Phase 1 모듈 연결) | 수동 `update()` 호출로 화면 갱신 |
| 3 | Hook 실행 환경 연결 (5단계) | Hook 개수 확인 동작 |
| 4 | `unmount`, 오류 처리, `onCommit` | 8장 전부 통과 (6~7단계 완료 후) |

---

## 10. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | 렌더링 오류 시 화면 유지 vs 오류 화면 표시 (현재 안: 유지 + 콘솔) |
| 리스크 | 매 렌더링 전체 트리를 다시 만들고 비교 → 이번 과제 규모에서는 문제없음 |
| 리스크 | 컨테이너를 다른 코드가 수정하면 DOM과 `vnode`가 어긋남 → 컨테이너는 `FunctionComponent`만 수정 |
