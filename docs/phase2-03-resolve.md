# Phase 2-3. 컴포넌트 펼치기 `resolve` 개발 기획서

작성일: 2026-11-09

---

## 1. 개요

컴포넌트 VNode가 섞인 트리를 요소·텍스트 VNode만 남은 트리로 바꾸는 `resolve`를 구현한다. 자식 컴포넌트 함수에 props를 넣어 실행하고, 그 결과로 컴포넌트 VNode를 대신한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 루트 컴포넌트가 반환한 VNode (자식 컴포넌트 VNode 포함 가능) |
| 출력 | `#root` 아래 요소·텍스트만 있는 VNode |
| 사용처 | `FunctionComponent`의 렌더링마다 |
| 원칙 | 출력은 Phase 1 VNode와 같은 구조 → Phase 1 diff를 그대로 사용 |

---

## 2. 범위

| 구분 | 내용 |
| --- | --- |
| 포함 | 컴포넌트 VNode 실행, 결과 정리, 재귀 펼치기 |
| 포함 | 자식 컴포넌트 실행 중 표시 (Hook 금지 판정용) |
| 포함 | `#root`로 감싸기 |
| 제외 | 루트 컴포넌트 실행 (4단계 `FunctionComponent`) |

---

## 3. 처리 흐름

```
resolve(루트 결과)
 └─ #root로 감싸기 → resolveNode(각 자식)
     ├─ 텍스트 → 그대로
     ├─ 요소   → 자식마다 resolveNode → 연속 텍스트 합치기 → 새 요소 VNode
     └─ 컴포넌트
          → [자식 실행 중 표시 켜기]
          → type(props) 실행
          → [표시 끄기]
          → 결과 정리 (h()의 children 정리 규칙과 동일)
          → key 이어받기
          → 결과마다 resolveNode (재귀)
```

### 1단계. 컴포넌트 실행

`type(props)`를 호출한다. `props.children`에는 `h()`에서 넣은 자식이 들어 있다.

실행하는 동안 "자식 컴포넌트 렌더링 중" 표시를 켠다. 이 상태에서 Hook을 호출하면 5단계(Hook 실행 환경)가 오류를 낸다.

### 2단계. 결과 정리

| 반환값 | 처리 |
| --- | --- |
| VNode | 그대로 |
| 문자열, 숫자 | 텍스트 VNode |
| `null`, `undefined`, `false`, `true` | 아무것도 그리지 않음 |
| 배열 | 펼쳐서 부모 자식 목록에 그대로 끼워 넣음 |

### 3단계. key 이어받기

컴포넌트 VNode에 `key`가 있고 결과가 요소 하나이면, 결과 요소에 같은 `key`와 `data-key`를 붙인다.

- **이유**: `list.map(item => h(TodoItem, { key: item.id, item }))`처럼 key는 컴포넌트에 붙이지만, diff가 보는 것은 펼쳐진 요소다.

### 4단계. 연속 텍스트 합치기

요소의 자식을 모두 펼친 뒤 연속된 텍스트를 하나로 합친다. 컴포넌트가 텍스트를 반환하면 펼친 뒤에 텍스트끼리 붙을 수 있기 때문이다.

### 5단계. 동결

새로 만든 요소 VNode를 동결한다.

---

## 4. 자식 컴포넌트 규칙

| 규칙 | 확인 방법 |
| --- | --- |
| Hook 사용 금지 | 실행 중 표시로 오류 발생 |
| 상태 없음, props만 사용 | 문서 규칙 (같은 props → 같은 결과) |
| props 수정 금지 | props 객체를 동결해서 전달 |

---

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/runtime/
└─ resolve.ts   # resolve, resolveNode
```

### 5.2 함수 목록

| 함수 | 입력 → 출력 |
| --- | --- |
| `resolve` | 루트 결과 → `#root` VNode |
| `resolveNode` | VNode → VNode 배열 (컴포넌트가 여러 개를 반환할 수 있으므로) |
| `renderChild` | 컴포넌트 VNode → 정리된 결과 배열 |

---

## 6. 기대 입출력

**컴포넌트**

```js
function TodoItem({ item }) {
  return h('li', { class: item.done ? 'done' : '' }, item.text)
}

function TodoList({ items }) {
  return h('ul', null, items.map((it) => h(TodoItem, { key: it.id, item: it })))
}
```

**입력**

```js
h('div', null,
  h('h1', null, '할 일'),
  h(TodoList, { items: [{ id: 'a', text: '우유', done: true }, { id: 'b', text: '빵', done: false }] })
)
```

**출력**

```js
{
  kind: 'element', tag: '#root', props: {},
  children: [{
    kind: 'element', tag: 'div', props: {},
    children: [
      { kind: 'element', tag: 'h1', props: {}, children: [{ kind: 'text', text: '할 일' }] },
      {
        kind: 'element', tag: 'ul', props: {},
        children: [
          { kind: 'element', tag: 'li', props: { class: 'done', 'data-key': 'a' }, key: 'a',
            children: [{ kind: 'text', text: '우유' }] },
          { kind: 'element', tag: 'li', props: { class: '', 'data-key': 'b' }, key: 'b',
            children: [{ kind: 'text', text: '빵' }] }
        ]
      }
    ]
  }]
}
```

---

## 7. 테스트 계획

| 입력 | 기대 |
| --- | --- |
| 6장 입력 | 6장 출력 |
| 컴포넌트가 `null` 반환 | 그 자리에 아무것도 없음 |
| 컴포넌트가 배열 반환 | 부모 자식 목록에 펼쳐짐 |
| `h('p', null, '총 ', h(Count, { n: 3 }), '개')` (Count는 숫자 반환) | 텍스트 하나 `'총 3개'` |
| 컴포넌트 안에 컴포넌트 3단계 중첩 | 모두 펼쳐짐 |
| 자식 컴포넌트에서 `useState` 호출 | 오류: "Hook은 루트 컴포넌트에서만 사용할 수 있습니다" |
| 자식에서 `props.item = …` 수정 | 동결되어 실패 |
| 출력 트리 | 컴포넌트 VNode가 하나도 없음 |

---

## 8. 작업 분해

| 순서 | 작업 | 완료 기준 |
| --- | --- | --- |
| 1 | `resolveNode` 텍스트·요소 | 컴포넌트 없는 트리 그대로 통과 |
| 2 | 컴포넌트 실행, 결과 정리 | null·배열·중첩 테스트 통과 |
| 3 | key 이어받기, 텍스트 합치기 | 6장 일치 |
| 4 | 자식 실행 중 표시 연결 | Hook 금지 테스트 통과 (5단계 완료 후) |

---

## 9. 결정 사항 및 리스크

| 항목 | 내용 |
| --- | --- |
| 결정 필요 | 컴포넌트가 여러 노드를 반환할 때 key 처리 (현재 안: key 무시) |
| 리스크 | 자식이 몰래 전역 변수를 써도 막을 수 없음 → 순수 함수 규칙은 문서로만 강제 |
| 리스크 | 무한 재귀(컴포넌트가 자신을 반환) → 깊이 1000 초과 시 오류 |
