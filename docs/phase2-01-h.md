# Phase 2-1. VNode 생성 함수 `h()` 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

컴포넌트가 화면을 VNode로 반환할 수 있도록 VNode를 만드는 함수 `h()`를 구현한다. JSX를 쓸 수 없으므로 `h()`가 JSX의 역할을 대신한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 태그 문자열 또는 컴포넌트 함수, props, children |
| 출력 | 요소 VNode 또는 컴포넌트 VNode |
| 사용처 | 모든 컴포넌트의 반환값 |
| 원칙 | Phase 1 VNode 구조와 호환. Phase 1의 diff / applyPatches를 그대로 쓸 수 있어야 함 |

---

## 2. 범위

| 구분 | 내용 |
| --- | --- |
| 포함 | `h(type, props, ...children)` |
| 포함 | VNode 종류 추가: 컴포넌트 VNode |
| 포함 | props 값 정리, children 정리 |
| 제외 | 이벤트 연결 (2단계), 컴포넌트 실행 (3단계) |

---

## 3. VNode 구조 (Phase 1 대비 변경)

| 종류 | 필드 | 변경 |
| --- | --- | --- |
| 요소 | `kind: 'element'`, `tag`, `props`, `children`, `key?` | `props` 값에 함수 허용 (이벤트) |
| 텍스트 | `kind: 'text'`, `text` | 없음 |
| 컴포넌트 | `kind: 'component'`, `type`, `props`, `key?` | **신규**. `type`은 컴포넌트 함수 |

컴포넌트 VNode는 3단계(`resolve`)에서 모두 요소·텍스트로 바뀐다. diff는 컴포넌트 VNode를 보지 않는다.

---

## 4. 처리 흐름

```
h(type, props, ...children)
 ├─ [1 children 정리]
 ├─ [2 key 분리]
 ├─ type이 문자열 → [3 props 정리] → 요소 VNode
 └─ type이 함수   → props에 children 넣기 → 컴포넌트 VNode
 └─ [4 동결]
```

### 1단계. children 정리

| 값 | 처리 |
| --- | --- |
| 배열 | 펼쳐서 이어 붙임 (중첩 배열도 모두 펼침) — `list.map(...)` 지원 |
| 문자열, 숫자 | 텍스트 VNode |
| `null`, `undefined`, `true`, `false` | 버림 — `조건 && h(...)` 지원 |
| 빈 문자열 | 버림 |
| VNode | 그대로 |
| 연속된 텍스트 | 하나로 합침 |

- **이유**: `h('p', null, '남은 일: ', 3, '개')`는 텍스트 3개가 되는데, Phase 1 규칙은 인접 텍스트를 허용하지 않는다. 합치지 않으면 diff 경로가 실제 DOM과 어긋난다.

### 2단계. key 분리

`props.key`가 있으면 VNode의 `key`로 옮기고 `props`에서 지운다. 요소라면 `props['data-key']`에도 넣는다.

- **이유**: Phase 1은 `data-key` 속성으로 key를 다룬다. 같은 규칙을 유지한다.

### 3단계. props 정리 (요소만)

| 값 | 처리 |
| --- | --- |
| 문자열 | 그대로 |
| 숫자 | 문자열로 변환 |
| `true` | `''` (불리언 속성: `disabled`, `checked`) |
| `false`, `null`, `undefined` | 속성 제외 |
| 함수 | 이름이 `on`으로 시작할 때만 유지, 아니면 제외 |
| `on`으로 시작하는데 문자열 | 제외 (인라인 스크립트 차단) |
| 그 외 (객체 등) | 제외 |

### 4단계. 동결

Phase 1과 같이 만든 즉시 `Object.freeze`로 고정한다.

---

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/runtime/
├─ h.ts            # h
└─ normalize.ts    # children 정리, props 정리
```

### 5.2 함수 목록

| 함수 | 입력 → 출력 | 순수 함수 |
| --- | --- | --- |
| `h` | type, props, children → VNode | O |
| `normalizeChildren` | 임의 값 배열 → VNode 배열 | O |
| `normalizeProps` | props 객체 → 정리된 props | O |

---

## 6. 기대 입출력

### 6.1 요소

```js
h('p', { class: 'count', id: 7, hidden: false }, '남은 일: ', 3, '개', false && h('b'))
```

```js
{
  kind: 'element',
  tag: 'p',
  props: { class: 'count', id: '7' },
  children: [{ kind: 'text', text: '남은 일: 3개' }]
}
```

### 6.2 리스트와 key

```js
h('ul', null, ['우유', '빵'].map((t) => h('li', { key: t }, t)))
```

```js
{
  kind: 'element',
  tag: 'ul',
  props: {},
  children: [
    { kind: 'element', tag: 'li', props: { 'data-key': '우유' }, key: '우유',
      children: [{ kind: 'text', text: '우유' }] },
    { kind: 'element', tag: 'li', props: { 'data-key': '빵' }, key: '빵',
      children: [{ kind: 'text', text: '빵' }] }
  ]
}
```

### 6.3 이벤트와 불리언

```js
h('button', { onClick: add, disabled: true }, '추가')
```

```js
{
  kind: 'element',
  tag: 'button',
  props: { onClick: add, disabled: '' },
  children: [{ kind: 'text', text: '추가' }]
}
```

### 6.4 컴포넌트

```js
h(TodoItem, { key: 'a', item: { text: '우유' } })
```

```js
{
  kind: 'component',
  type: TodoItem,
  props: { item: { text: '우유' }, children: [] },
  key: 'a'
}
```

---

## 7. 테스트 계획

| 입력 | 기대 |
| --- | --- |
| 6.1 ~ 6.4 | 각 출력과 일치 |
| `h('div', null, [[1, [2]], 3])` | 텍스트 하나 `'123'` |
| `h('div', null, null, undefined, true)` | 자식 없음 |
| `h('a', { onclick: 'alert(1)' })` | `props`에 `onclick` 없음 |
| `h('input', { checked: true })` | `props.checked === ''` |
| `h('div', { style: { color: 'red' } })` | `style` 제외 |
| 반환된 VNode 수정 시도 | 동결되어 변경 안 됨 |

---

## 8. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | VNode 타입에 컴포넌트 종류 추가 | 타입 확정 |
| 2 | `normalizeChildren` | 배열·null·텍스트 병합 테스트 통과 |
| 3 | `normalizeProps` | props 값 테스트 통과 |
| 4 | `h` 조립 + 동결 | 6장 전부 일치 |

---

## 9. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | `style` 객체 지원 여부 (현재 안: 문자열만) |
| 결정 필요 | 속성 이름 `class` 그대로 사용 (현재 안: `className` 변환 없음) |
| 리스크 | key가 모든 요소에 `data-key` 속성으로 출력됨 → 화면에는 영향 없음, DOM에만 보임 |
