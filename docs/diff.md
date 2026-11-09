# Core-React: Diff 모듈(diff) 개발 기획서

작성일: 2026-11-06

## 1. 개요

이전 VNode와 새 VNode를 비교해 바뀐 부분만 Patch 목록으로 만드는 `diff`를 구현한다. DOM을 전혀 건드리지 않는 순수 함수이며, 실제 반영은 다음 단계(`applyPatches`)가 맡는다.

| 항목 | 내용 |
|------|------|
| 입력 | 이전 VNode, 새 VNode (둘 다 `#root`) |
| 출력 | Patch 배열 |
| 사용처 | Patch 버튼 클릭 시, 뒤로가기/앞으로가기 시 |
| 복잡도 | O(n) — n은 두 트리 중 큰 쪽의 노드 수 |

## 2. 범위

| 구분 | 내용 |
|------|------|
| 포함 | 인덱스 기반 비교 (같은 위치의 자식끼리 비교) |
| 포함 | Patch 5종: `CREATE`, `REMOVE`, `REPLACE`, `TEXT`, `PROPS` |
| 후속 | key 기반 비교와 `MOVE` Patch (8장) |
| 제외 | DOM 반영(`applyPatches`), State History |

## 3. 비교 규칙

React와 같은 두 가지 가정으로 O(n³) 문제를 O(n)으로 줄인다.

1. 종류나 태그가 다르면 하위 트리 전체가 다르다고 본다. → 더 비교하지 않고 통째로 교체
2. 같은 부모 아래 같은 위치의 자식끼리만 비교한다. → 레벨을 넘나드는 이동은 찾지 않음

## 4. 처리 흐름

```
diff(old, new)
 └─ 루트의 자식 비교부터 시작
     diffNode(old, new, path)
      ├─ [1] 종류 다름 (텍스트 ↔ 요소)      → REPLACE, 종료
      ├─ [2] 둘 다 텍스트
      │      └─ 내용 다름                   → TEXT, 종료
      └─ [3] 둘 다 요소
             ├─ 태그 다름                    → REPLACE, 종료
             ├─ [4] 속성 비교  → 차이 있으면 PROPS
             └─ [5] 자식 비교
                  ├─ 이전에만 있음  → REMOVE
                  ├─ 새 쪽에만 있음 → CREATE
                  └─ 양쪽 다 있음   → diffNode 재귀
```

### 1단계. 종류 비교

텍스트와 요소처럼 `kind`가 다르면 `REPLACE`를 만들고 그 아래는 비교하지 않는다.

### 2단계. 텍스트 비교

`old.text !== new.text`이면 `TEXT`를 만든다. 텍스트 노드를 새로 만들지 않고 내용만 바꾸기 위함이다.

### 3단계. 태그 비교

`old.tag !== new.tag`이면 `REPLACE`를 만들고 그 아래는 비교하지 않는다. `<p>`를 `<div>`로 바꾸려면 어차피 요소를 새로 만들어야 한다.

### 4단계. 속성 비교

| 경우 | 결과 |
|------|------|
| 새 쪽에만 있음 | `set`에 추가 |
| 양쪽에 있고 값 다름 | `set`에 추가 |
| 이전에만 있음 | `remove`에 추가 |

`set`이나 `remove`가 하나라도 있으면 `PROPS` 하나를 만든다.

### 5단계. 자식 비교

0부터 `max(이전 자식 수, 새 자식 수) - 1`까지 같은 인덱스끼리 비교한다.

| 경우 | 결과 |
|------|------|
| 이전에만 있음 | `REMOVE` |
| 새 쪽에만 있음 | `CREATE` (하위 트리 통째로 포함) |
| 양쪽 다 있음 | 1단계부터 재귀 |

인덱스 기반이므로 `CREATE`는 항상 자식 목록의 끝에, `REMOVE`도 항상 끝에서만 생긴다.

### 빠른 종료

`old === new`(같은 객체)이면 비교 없이 빈 배열을 반환한다. VNode는 동결되어 있어 같은 객체면 내용도 같음이 보장된다.

## 5. 데이터 구조

### 5.1 경로(Path)

`#root`로부터의 자식 인덱스 배열. `[]`은 루트, `[1, 0]`은 루트의 두 번째 자식의 첫 번째 자식.

모든 경로는 **이전 트리 기준**이다. `applyPatches`가 바뀌기 전의 실제 DOM에서 대상을 찾기 때문이다.

### 5.2 Patch

| type | 필드 | 의미 |
|------|------|------|
| `CREATE` | `parentPath`, `index`, `node` | `parentPath` 요소의 `index` 위치에 `node` 하위 트리 추가 |
| `REMOVE` | `path` | `path` 노드 삭제 |
| `REPLACE` | `path`, `node` | `path` 노드를 `node` 하위 트리로 교체 |
| `TEXT` | `path`, `text` | `path` 텍스트 노드의 내용 변경 |
| `PROPS` | `path`, `set`, `remove` | `set`의 속성 설정, `remove`의 속성 삭제 |

### 5.3 출력 순서

깊이 우선(부모 먼저, 자식은 인덱스 순)으로 만들어진 순서 그대로 배열에 담는다.

## 6. 함수 단위 설계

### 6.1 파일 구성

```
src/core/diff/
├─ types.ts      # Path, Patch 타입
├─ diff.ts       # diff, diffNode, diffChildren
└─ diffProps.ts  # 속성 비교
```

### 6.2 함수 목록

| 함수 | 입력 → 출력 | 순수 함수 |
|------|-------------|-----------|
| `diff` | 이전 VNode, 새 VNode → Patch 배열 | O |
| `diffNode` | 이전 노드, 새 노드, 경로, Patch 배열 → 없음 (배열에 추가) | O (외부 상태 없음) |
| `diffChildren` | 이전 자식들, 새 자식들, 부모 경로, Patch 배열 → 없음 | O |
| `diffProps` | 이전 props, 새 props → `{ set, remove }` 또는 없음 | O |

DOM을 쓰지 않으므로 브라우저 없이 테스트한다.

## 7. 기대 입출력

### 7.1 텍스트·속성 변경 + 항목 추가

이전 VNode (fromDom 결과)

```html
<h1 class="title">장보기 목록</h1>
<ul>
  <li data-key="a">사과</li>
  <li data-key="b">바나나</li>
</ul>
```

새 VNode (테스트 영역 수정 후 fromHtml 결과)

```html
<h1 class="title big">오늘 장보기</h1>
<ul>
  <li data-key="a">사과</li>
  <li data-key="b">배</li>
  <li data-key="c">우유</li>
</ul>
```

출력

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
      kind: 'element',
      tag: 'li',
      props: { 'data-key': 'c' },
      key: 'c',
      children: [{ kind: 'text', text: '우유' }]
    }
  }
]
```

### 7.2 첫 항목 삭제 (인덱스 기반의 한계)

이전

```html
<ul>
  <li data-key="a">사과</li>
  <li data-key="b">바나나</li>
</ul>
```

새

```html
<ul>
  <li data-key="b">바나나</li>
</ul>
```

출력

```js
[
  { type: 'PROPS', path: [0, 0], set: { 'data-key': 'b' }, remove: [] },
  { type: 'TEXT', path: [0, 0, 0], text: '바나나' },
  { type: 'REMOVE', path: [0, 1] }
]
```

첫 번째를 지웠지만 "첫 번째를 두 번째 내용으로 고치고 두 번째를 지움"으로 나온다. 결과 화면은 맞지만 Patch 수가 많다. key 기반 비교(8장)로 `REMOVE` 1건이 된다.

### 7.3 변경 없음

이전과 새 VNode가 같으면 `[]`

## 8. 후속: key 기반 비교

형제 전체가 `data-key`를 가지고 중복이 없을 때만 적용한다.

| 순서 | 내용 |
|------|------|
| 1 | 이전 자식의 key → 인덱스 표 생성 |
| 2 | 새 자식마다 같은 key의 이전 자식을 찾아 재귀 비교, 없으면 `CREATE` |
| 3 | 짝이 없는 이전 자식은 `REMOVE` |
| 4 | 짝지어진 이전 인덱스 수열에서 LIS(최장 증가 부분 수열)를 구해, 여기에 속하지 않는 노드만 `MOVE` |

이 경우 7.2의 출력은 `[{ type: 'REMOVE', path: [0, 0] }]`이 된다. 인덱스 기반 구현과 `applyPatches`가 완성된 뒤 진행한다.

## 9. 테스트 계획

| 이전 → 새 | 기대 Patch |
|-----------|------------|
| 7.1 | 7.1 출력 |
| 7.2 | 7.2 출력 |
| 같은 VNode | `[]` |
| 같은 객체 (`diff(v, v)`) | `[]`, 하위 비교 없음 |
| 텍스트 한 글자 변경 | `TEXT` 1건 |
| class 값 변경 | `PROPS` 1건 (set) |
| 속성 삭제 | `PROPS` 1건 (remove) |
| 끝에 항목 추가 | `CREATE` 1건 |
| 끝 항목 삭제 | `REMOVE` 1건 |
| `<p>x</p>` → `<div>x</div>` | `REPLACE` 1건, 하위 Patch 없음 |
| 텍스트 → 요소 | `REPLACE` 1건 |
| 루트 자식 전부 삭제 | 자식 수만큼 `REMOVE` |
| 모든 Patch의 경로 | 이전 VNode에서 실제로 존재하는 위치 (`CREATE`는 `parentPath`) |
| 입력 VNode | diff 후에도 변경 없음 |

## 10. 작업 분해

| 순서 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `types.ts` Path, Patch 타입 | 5장 구조 확정 |
| 2 | `diffProps` | 속성 테스트 통과 |
| 3 | `diffNode` (종류·텍스트·태그 비교) | `TEXT` / `REPLACE` 테스트 통과 |
| 4 | `diffChildren` (인덱스 기반) | `CREATE` / `REMOVE` 테스트 통과 |
| 5 | `diff` 조립 + 빠른 종료 | 9장 전부 통과, 7장 입출력 일치 |

## 11. 결정 사항 및 리스크

| 항목 | 내용 |
|------|------|
| 결정 필요 | Patch가 `[]`일 때 히스토리에 저장할지 (현재 안: 저장 안 함) |
| 결정 필요 | key 기반 비교를 이번 범위에 넣을지 (현재 안: 후속) |
| 리스크 | 리스트 앞쪽 삽입·삭제 시 Patch가 많아짐 → 8장으로 해결 |
| 리스크 | 경로가 이전 트리 기준이라 Patch를 순서대로 바로 적용하면 인덱스가 밀림 → `applyPatches`에서 대상 노드를 먼저 모두 찾은 뒤 적용 |
