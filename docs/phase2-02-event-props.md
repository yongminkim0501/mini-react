# Phase 2-2. 이벤트 props 지원 (Phase 1 확장) 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

`onClick: 함수` 같은 이벤트 props가 실제 DOM에서 동작하도록 Phase 1의 `createDom`, `diff`, `applyPatches`를 확장한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 함수 props가 들어 있는 VNode |
| 출력 | 이벤트가 연결된 DOM, 렌더링마다 최신 함수로 교체되는 이벤트 |
| 사용처 | 버튼 클릭, 입력, 체크 등 모든 사용자 동작 |
| 원칙 | 이벤트 등록(`addEventListener`)은 요소당 이벤트 종류별 1회만 |

---

## 2. 범위

| 구분 | 내용 |
| --- | --- |
| 포함 | `createDom`: 함수 props → 이벤트 연결 |
| 포함 | `diffProps`: 함수 props 비교 |
| 포함 | `applyPatches`: 이벤트 교체·삭제 |
| 포함 | 입력칸 `value` 동기화 보완 (커서 튐 방지) |
| 포함 | `serialize`: 함수 props 출력 제외 |
| 제외 | 이벤트 위임(document 한 곳에서 처리) |

---

## 3. 핵심 문제: 렌더링마다 함수가 새로 만들어짐

컴포넌트는 렌더링할 때마다 `() => setN(n + 1)` 같은 함수를 새로 만든다. 이전 함수를 그대로 두면 이전 상태 값을 기억한 채 동작한다(오래된 클로저). 반대로 매번 `removeEventListener` / `addEventListener`를 하면 비용이 크다.

**해결: 요소마다 "이벤트 표"를 두고, 실제 리스너는 표를 보고 호출만 한다.**

```
이벤트 표[요소] = { click: 최신 함수, input: 최신 함수 }

addEventListener('click', 대리 함수)   ← 처음 1회만
대리 함수 = (e) => 이벤트 표[요소].click(e)
```

렌더링마다 표의 함수만 바꾸면 되므로 리스너 등록은 다시 하지 않는다.

---

## 4. 처리 규칙

### 4.1 이벤트 이름

props 이름이 `on`으로 시작하고 값이 함수이면 이벤트로 본다. 이벤트 종류는 `on` 뒤를 소문자로 바꾼 값이다.

| props | 이벤트 종류 |
| --- | --- |
| `onClick` | `click` |
| `onInput` | `input` |
| `onChange` | `change` |
| `onKeyDown` | `keydown` |

### 4.2 createDom

| props 값 | 처리 |
| --- | --- |
| 문자열 | `setAttribute` (기존) |
| 이벤트 함수 | 이벤트 표에 넣고, 그 종류의 대리 함수가 없으면 `addEventListener` |

### 4.3 diffProps

함수도 다른 값처럼 `!==`로 비교한다. 바뀌면 `PROPS`의 `set`에, 사라지면 `remove`에 넣는다.

### 4.4 applyPatches (PROPS)

| 경우 | 처리 |
| --- | --- |
| `set`의 이벤트 함수 | 이벤트 표의 함수만 교체 (대리 함수 없으면 등록) |
| `remove`의 이벤트 이름 | 이벤트 표에서 삭제 (대리 함수는 표가 비어 있으면 아무것도 안 함) |
| `value` 설정 | `el.value !== 값`일 때만 `el.value = 값` |

- **`value` 조건 이유**: 사용자가 입력한 값과 같은 값을 다시 넣으면 일부 브라우저에서 커서가 끝으로 튄다.

### 4.5 serialize

함수 props는 출력하지 않는다. (디버깅 출력용)

---

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/core/vnode-to-dom/events.ts   # 신규: 이벤트 표, 대리 함수
src/core/vnode-to-dom/createDom.ts  # 수정
src/core/diff/diffProps.ts          # 수정 없음 (확인만)
src/core/patch/commit.ts            # 수정
src/core/patch/formProps.ts         # 수정
src/core/vnode-to-html/serialize.ts # 수정
```

### 5.2 함수 목록

| 함수 | 입력 → 출력 | 변경 |
| --- | --- | --- |
| `isEventProp` | 이름, 값 → boolean | 신규 |
| `toEventType` | `onClick` → `click` | 신규 |
| `setEvent` | 요소, 종류, 함수 → 없음 | 신규 |
| `removeEvent` | 요소, 종류 → 없음 | 신규 |
| `createDom` | VNode → DOM | 이벤트 처리 추가 |
| `commit` (PROPS) | 요소, set, remove → 없음 | 이벤트 처리 추가 |
| `syncFormProp` | 요소, 속성, 값 → 없음 | `value` 비교 추가 |

---

## 6. 기대 입출력

### 6.1 최초 생성

**입력**

```js
{ kind: 'element', tag: 'button', props: { class: 'btn', onClick: f1 },
  children: [{ kind: 'text', text: '추가' }] }
```

**출력**

```html
<button class="btn">추가</button>
```

- 이벤트 표: `{ click: f1 }`
- `addEventListener('click', …)` 호출 1회
- 클릭 시 `f1` 실행

### 6.2 재렌더링 (함수만 바뀜)

**이전 props**: `{ class: 'btn', onClick: f1 }`
**새 props**: `{ class: 'btn', onClick: f2 }`

**diff 출력**

```js
[{ type: 'PROPS', path: [0], set: { onClick: f2 }, remove: [] }]
```

**applyPatches 후**

- 이벤트 표: `{ click: f2 }`
- `addEventListener` 추가 호출 0회
- 클릭 시 `f2`만 실행

### 6.3 이벤트 삭제

**이전**: `{ onClick: f2 }` → **새**: `{}`

**diff 출력**: `[{ type: 'PROPS', path: [0], set: {}, remove: ['onClick'] }]`

**적용 후**: 클릭해도 아무 함수도 실행 안 됨

---

## 7. 테스트 계획

| 입력 | 기대 |
| --- | --- |
| 6.1 ~ 6.3 | 각 결과와 일치 |
| 같은 요소에 렌더링 10회 (매번 새 함수) | `addEventListener` 총 1회, 클릭 시 마지막 함수 실행 |
| `onClick`, `onInput` 함께 | 종류별로 각각 1회 등록 |
| 사용자가 `abc` 입력 후 `value: 'abc'`로 PROPS | `el.value` 대입 안 함 (커서 유지) |
| `value: ''`로 PROPS (입력칸 비우기) | 입력칸 비워짐 |
| 함수 props가 있는 VNode를 `serialize` | 함수 props 없이 출력 |
| Phase 1 전체 테스트 | 전부 통과 (기존 동작 유지) |

---

## 8. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | `events.ts` 이벤트 표, 대리 함수 | 등록 1회 테스트 통과 |
| 2 | `createDom` 확장 | 6.1 통과 |
| 3 | `commit` PROPS 확장 | 6.2, 6.3 통과 |
| 4 | `syncFormProp` 보완 | 커서 유지 테스트 통과 |
| 5 | `serialize` 수정, Phase 1 회귀 테스트 | 7장 전부 통과 |

---

## 9. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | 이벤트 표 저장 위치 — 요소 속성(`__events`) vs `WeakMap` (현재 안: `WeakMap`, 요소 객체를 오염시키지 않음) |
| 리스크 | 매 렌더링마다 이벤트 PROPS Patch가 생겨 Patch 로그가 길어짐 → 로그에서 이벤트 교체는 따로 묶어 표시 |
| 리스크 | 요소가 삭제되면 이벤트 표도 함께 사라져야 함 → `WeakMap`이면 자동 정리 |
