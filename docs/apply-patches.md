# Core-React: Patch 반영 모듈(applyPatches) 개발 기획서

작성일: 2026-11-06

## 1. 개요

diff가 만든 Patch 목록을 실제 영역 DOM에 반영하는 `applyPatches`를 구현한다. 바뀐 노드만 수정하고 나머지 DOM은 건드리지 않는다.

| 항목 | 내용 |
|------|------|
| 입력 | 실제 영역 컨테이너, Patch 배열 |
| 출력 | `{ ok, changed }` — 성공 여부, 변경된 요소 목록 |
| 사용처 | Patch 버튼 클릭 시, 뒤로가기/앞으로가기 시 |
| 전제 | 실제 영역 DOM과 이전 VNode가 1:1로 일치 (정규화 마운트 완료 상태) |

## 2. 범위

| 구분 | 내용 |
|------|------|
| 포함 | Patch 5종 반영: `CREATE`, `REMOVE`, `REPLACE`, `TEXT`, `PROPS` |
| 포함 | 폼 요소의 property 동기화 (`value`, `checked`, `selected`) |
| 후속 | `MOVE` 반영 (key 기반 diff 이후) |
| 제외 | State History, 화면 하이라이트 |

## 3. 핵심 문제: 인덱스 밀림

Patch의 경로는 모두 바뀌기 전 트리 기준이다. 순서대로 바로 적용하면 앞에서 노드를 지우거나 추가하는 순간 뒤 형제들의 인덱스가 바뀌어, 다음 Patch가 엉뚱한 노드를 수정한다.

해결: 두 단계로 나눈다.

```
[1단계 찾기]  DOM을 건드리기 전에 모든 Patch의 경로를 실제 노드로 바꿔 둔다
[2단계 적용]  찾아 둔 노드를 대상으로 순서대로 수정한다
```

노드를 먼저 확보해 두었으므로 수정 순서와 상관없이 대상이 바뀌지 않는다.

## 4. 처리 흐름

```
applyPatches(container, patches)
 ├─ [1 찾기]  Patch마다 경로 → 노드
 │             └─ 하나라도 실패 → 아무것도 수정하지 않고 { ok: false } 반환
 └─ [2 적용]  Patch마다 type별 수정
               ├─ CREATE  → [3]
               ├─ REMOVE  → [4]
               ├─ REPLACE → [5]
               ├─ TEXT    → [6]
               └─ PROPS   → [7]
```

### 1단계. 찾기

컨테이너에서 시작해 경로의 인덱스를 따라 `childNodes[i]`로 내려간다.

| Patch | 찾는 대상 |
|-------|-----------|
| `CREATE` | `parentPath`의 요소 |
| 그 외 | `path`의 노드 |

- 경로가 존재하지 않으면 DOM과 VNode가 어긋난 상태(버그)다. 이 경우 아무것도 수정하지 않고 `ok: false`를 반환한다.
- 이유: 찾기를 모두 마친 뒤 수정하므로 반쯤 바뀐 화면이 남지 않는다.

### 2단계. 적용

Patch 배열 순서대로 3~7단계를 수행한다. 수정한 요소는 `changed`에 모은다.

### 3단계. CREATE

`parent.appendChild(createDom(node, 부모의 네임스페이스))`

- 인덱스 기반 diff에서 `CREATE`는 항상 자식 목록 끝에 생기므로 `appendChild`로 충분하다.
- 네임스페이스는 부모 요소의 `namespaceURI`에서 정한다. SVG 안에 추가되는 요소가 제대로 그려지게 하기 위함이다.

### 4단계. REMOVE

`node.remove()`

### 5단계. REPLACE

`node.replaceWith(createDom(vnode, 부모의 네임스페이스))`

### 6단계. TEXT

`textNode.nodeValue = text`

- 이유: 텍스트 노드를 새로 만들지 않고 내용만 바꾼다. 가장 가벼운 변경이다.

### 7단계. PROPS

| 대상 | 처리 |
|------|------|
| `set`의 각 속성 | `setAttribute(name, value)` |
| `remove`의 각 속성 | `removeAttribute(name)` |

폼 요소는 속성만 바꾸면 화면에 반영되지 않는 경우가 있어 property도 함께 맞춘다.

| 속성 | 함께 수행 |
|------|-----------|
| `value` 설정 / 삭제 | `el.value = 값` / `el.value = ''` |
| `checked` 설정 / 삭제 | `el.checked = true` / `false` |
| `selected` 설정 / 삭제 | `el.selected = true` / `false` |

- 이유: 사용자가 한 번이라도 입력한 `<input>`은 `value` 속성을 바꿔도 화면 값이 바뀌지 않는다.

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/core/patch/
├─ applyPatches.ts  # 전체 흐름 (찾기 → 적용)
├─ resolve.ts       # 경로 → 노드
├─ commit.ts        # type별 DOM 수정
└─ formProps.ts     # value / checked / selected 동기화
```

### 5.2 함수 목록

| 함수 | 입력 → 출력 | 순수 함수 |
|------|-------------|-----------|
| `applyPatches` | 컨테이너, Patch 배열 → `{ ok, changed }` | X |
| `resolvePath` | 컨테이너, 경로 → 노드 또는 없음 | X (읽기만) |
| `resolveAll` | 컨테이너, Patch 배열 → 찾은 대상 목록 또는 실패 | X (읽기만) |
| `commit` | 찾은 대상, Patch → 변경된 요소 | X |
| `syncFormProp` | 요소, 속성명, 값 또는 삭제 → 없음 | X |

## 6. 기대 입출력

### 6.1 텍스트·속성 변경 + 항목 추가

입력: 실제 영역 (적용 전)

```html
<div id="real-area" class="area"><h1 class="title">장보기 목록</h1><ul><li data-key="a">사과</li><li data-key="b">바나나</li></ul></div>
```

입력: Patch 배열 ([diff 기획서](./diff.md) 7.1 출력)

```js
[
  { type: 'PROPS', path: [0], set: { class: 'title big' }, remove: [] },
  { type: 'TEXT', path: [0, 0], text: '오늘 장보기' },
  { type: 'TEXT', path: [1, 1, 0], text: '배' },
  {
    type: 'CREATE',
    parentPath: [1],
    index: 2,
    node: {
      kind: 'element', tag: 'li', props: { 'data-key': 'c' }, key: 'c',
      children: [{ kind: 'text', text: '우유' }]
    }
  }
]
```

출력: 반환값

```js
{ ok: true, changed: [h1, h1, li(배), li(우유)] }
```

출력: 실제 영역 (적용 후)

```html
<div id="real-area" class="area"><h1 class="title big">오늘 장보기</h1><ul><li data-key="a">사과</li><li data-key="b">배</li><li data-key="c">우유</li></ul></div>
```

DOM 변경 기록 (MutationObserver)

| 종류 | 대상 | 건수 |
|------|------|------|
| attributes | h1의 class | 1 |
| characterData | "장보기 목록" 텍스트 노드 | 1 |
| characterData | "바나나" 텍스트 노드 | 1 |
| childList | ul에 li 추가 | 1 |

합계 4건. 첫 번째 li와 그 텍스트는 변경 0건이다.

### 6.2 첫 항목 삭제

입력: 실제 영역

```html
<ul><li data-key="a">사과</li><li data-key="b">바나나</li></ul>
```

입력: Patch 배열 (diff 기획서 7.2 출력)

```js
[
  { type: 'PROPS', path: [0, 0], set: { 'data-key': 'b' }, remove: [] },
  { type: 'TEXT', path: [0, 0, 0], text: '바나나' },
  { type: 'REMOVE', path: [0, 1] }
]
```

출력: 실제 영역

```html
<ul><li data-key="b">바나나</li></ul>
```

### 6.3 경로 불일치

입력: 존재하지 않는 경로 `[5]`를 가진 Patch가 포함된 배열

출력: `{ ok: false, changed: [] }`, 실제 영역 DOM 변경 0건

## 7. 테스트 계획

| 입력 | 기대 |
|------|------|
| 6.1 | 6.1 출력, 변경 기록 4건 |
| 6.2 | 6.2 출력 |
| 6.3 | `ok: false`, 변경 0건 |
| 빈 Patch 배열 | `ok: true`, 변경 0건 |
| `REMOVE [0]`과 `TEXT [1, 0]`이 함께 있음 | 두 번째 요소의 텍스트가 바뀜 (인덱스 밀림 없음) |
| `REPLACE`로 p → div | 해당 위치만 div로 바뀌고 형제는 같은 객체 유지 |
| SVG 안에 `CREATE` | 추가된 요소의 `namespaceURI`가 SVG |
| 사용자가 입력한 `<input>`에 `value` PROPS | 화면 입력칸 값이 새 값으로 바뀜 |
| `checked` 삭제 PROPS | 체크 해제 |
| 적용 후 `fromDom(실제 영역).vnode` | 새 VNode와 구조 동일 (diff 결과 검증) |
| 적용 전후 바뀌지 않은 노드 | 같은 DOM 객체 그대로 (`===`) |

## 8. 작업 분해

| 순서 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `resolve.ts` 경로 → 노드, 전체 찾기 | 6.3 통과 (실패 시 변경 0건) |
| 2 | `commit.ts` TEXT / PROPS / REMOVE | 6.2 통과 |
| 3 | `commit.ts` CREATE / REPLACE (`createDom` 연결) | 6.1 통과 |
| 4 | `formProps.ts` 폼 property 동기화 | input / checkbox 테스트 통과 |
| 5 | diff → applyPatches → fromDom 왕복 검증 | 7장 전부 통과 |

## 9. 결정 사항 및 리스크

| 항목 | 내용 |
|------|------|
| 결정 필요 | 경로 불일치 시 `ok: false` 후 컨트롤러 처리 (현재 안: 실제 영역을 현재 VNode로 다시 mount해 복구) |
| 결정 필요 | `changed`를 화면 하이라이트에 사용할지 (현재 안: 사용, `Element.animate`로 속성 변경 없이 표시) |
| 리스크 | 정규화 마운트 없이 호출하면 경로가 공백 노드를 가리켜 오동작 → 로드 흐름에서 mount를 반드시 먼저 실행 |
| 리스크 | key 기반 diff 도입 시 `CREATE`가 목록 중간에 생김 → 찾기 단계에서 삽입 기준 노드(anchor)도 함께 확보하도록 확장 필요 |
