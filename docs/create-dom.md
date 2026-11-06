# Core-React: VNode → DOM 생성 모듈(createDom) 개발 기획서

작성일: 2026-11-06

## 1. 개요

VNode 트리를 실제 DOM 노드로 만드는 `createDom`과, 그 결과로 컨테이너 내용을 교체하는 `mount`를 구현한다.

| 항목 | 내용 |
|------|------|
| 입력 | VNode (`fromDom` / `fromHtml` 결과의 `vnode`) |
| 출력 | DOM 노드 (요소 → Element, 텍스트 → Text, `#root` → DocumentFragment) |
| 사용처 | 정규화 마운트, 이후 Patch의 CREATE / REPLACE |
| 원칙 | `innerHTML`을 쓰지 않고 DOM API로만 생성. VNode는 수정하지 않음 |

## 2. 범위

| 구분 | 내용 |
|------|------|
| 포함 | `createDom(vnode)` |
| 포함 | `mount(container, vnode)` — 정규화 마운트 |
| 제외 | `serialize`, diff, patch, State History |

## 3. 처리 흐름

```
createDom(vnode, 네임스페이스)
 ├─ kind: 'text'            → [1 텍스트 생성]
 ├─ tag: '#root'            → [2 프래그먼트 생성] → 자식마다 createDom
 └─ kind: 'element'         → [3 네임스페이스 결정] → [4 요소 생성] → [5 속성 설정] → [6 자식 생성]

mount(container, vnode)     → [7 컨테이너 교체]
```

### 1단계. 텍스트 생성

`document.createTextNode(text)`로 만든다.

- 이유: 텍스트가 `<script>` 같은 문자열이어도 글자로만 들어가고 실행되지 않는다. 이스케이프 처리가 필요 없다.

### 2단계. 프래그먼트 생성

`#root`는 `document.createDocumentFragment()`로 만들고 자식을 그 안에 붙인다.

- 이유: 최상위 노드가 여러 개여도 한 번에 컨테이너에 넣을 수 있다.

### 3단계. 네임스페이스 결정

VNode에 네임스페이스 필드가 없으므로 부모로부터 물려받아 결정한다.

| 조건 | 네임스페이스 |
|------|--------------|
| 기본 | HTML |
| 태그가 `svg` | SVG (자식에게도 전달) |
| 태그가 `math` | MathML (자식에게도 전달) |
| SVG 안의 `foreignObject` 자식 | 다시 HTML |

- 이유: SVG 요소를 `createElement`로 만들면 화면에 그려지지 않는다. `createElementNS`가 필요하다.

### 4단계. 요소 생성

| 네임스페이스 | 사용 API |
|--------------|----------|
| HTML | `document.createElement(tag)` |
| SVG / MathML | `document.createElementNS(네임스페이스 URI, tag)` |

### 5단계. 속성 설정

`props`의 모든 항목을 `setAttribute(name, value)`로 설정한다.

- `value`, `checked` 같은 폼 속성도 새로 만든 요소에서는 `setAttribute`만으로 화면에 반영된다. (property 동기화는 Patch 단계에서 처리)
- `key`는 따로 출력하지 않는다. `props['data-key']`에 이미 들어 있다.
- 보안 필터는 다시 적용하지 않는다. 입력 VNode는 이미 `fromDom` / `fromHtml`에서 걸러졌다.

### 6단계. 자식 생성

자식마다 `createDom`을 재귀 호출해 `appendChild`로 붙인다.

- 이유: 화면에 붙지 않은 상태에서 서브트리를 완성하므로 레이아웃 계산이 마지막에 한 번만 일어난다.

### 7단계. 컨테이너 교체 (mount)

`container.replaceChildren(createDom(vnode))`로 컨테이너의 기존 내용을 한 번에 교체한다.

- 컨테이너 자신(속성 포함)은 건드리지 않는다.
- 교체 후 컨테이너의 DOM과 VNode가 1:1로 일치한다.

## 4. 함수 단위 설계

### 4.1 파일 구성

```
src/core/vnode-to-dom/
├─ createDom.ts   # createDom
├─ namespace.ts   # 네임스페이스 결정
└─ mount.ts       # mount
```

### 4.2 함수 목록

| 함수 | 입력 → 출력 | 순수 함수 |
|------|-------------|-----------|
| `createDom` | VNode, 네임스페이스 → DOM 노드 | X |
| `childNamespace` | 부모 네임스페이스, 태그 → 자식 네임스페이스 | O |
| `mount` | 컨테이너, VNode → 없음 (컨테이너 내용 교체) | X |

## 5. 기대 입출력

입력 ([fromDom 기획서](./from-dom.md) 기대 출력의 `vnode`)

```js
{
  kind: 'element',
  tag: '#root',
  props: {},
  children: [
    {
      kind: 'element',
      tag: 'h1',
      props: { class: 'title' },
      children: [{ kind: 'text', text: '장보기 목록' }]
    },
    {
      kind: 'element',
      tag: 'ul',
      props: {},
      children: [
        {
          kind: 'element',
          tag: 'li',
          props: { 'data-key': 'a' },
          key: 'a',
          children: [{ kind: 'text', text: '사과' }]
        },
        {
          kind: 'element',
          tag: 'li',
          props: { 'data-key': 'b' },
          key: 'b',
          children: [{ kind: 'text', text: '바나나' }]
        }
      ]
    }
  ]
}
```

```js
mount(document.getElementById('real-area'), vnode)
```

출력 (실제 영역 DOM)

```html
<div id="real-area" class="area"><h1 class="title">장보기 목록</h1><ul><li data-key="a">사과</li><li data-key="b">바나나</li></ul></div>
```

- 컨테이너의 `id`, `class`는 그대로 유지
- 들여쓰기 공백과 주석은 사라짐
- `realArea.childNodes.length === 2`, `ul.childNodes.length === 2`

## 6. 테스트 계획

| 입력 | 기대 |
|------|------|
| 5장 입력 | 5장 출력과 동일 |
| `{ kind: 'text', text: '<script>alert(1)</script>' }` | Text 노드 하나, 글자 그대로 표시, 실행 안 됨 |
| svg 안의 circle | `circle.namespaceURI`가 SVG 네임스페이스 |
| svg > foreignObject > div | `div.namespaceURI`가 HTML 네임스페이스 |
| `<input>` VNode, `props: { value: 'a' }` | 화면 입력칸에 a 표시 |
| 속성 여러 개 | `setAttribute` 순서가 `props` 순서와 같음 |
| 자식 없는 `#root` | 빈 DocumentFragment, mount 후 컨테이너 비어 있음 |
| 동결된 VNode로 호출 | 오류 없이 생성, VNode 변경 없음 |
| mount 후 `fromDom(컨테이너)` | 입력 VNode와 구조 동일 (왕복 검증) |
| mount 후 fromDom 기획서의 경로 `[1, 0]` | ul의 첫 번째 li를 가리킴 (DOM·VNode 1:1 확인) |

## 7. 작업 분해

| 순서 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `childNamespace` 순수 함수 | SVG / foreignObject / MathML 테스트 통과 |
| 2 | `createDom` 텍스트·요소·프래그먼트 생성 | 5장 입출력 일치 |
| 3 | `mount` | 컨테이너 속성 유지, 내용 교체 확인 |
| 4 | 페이지 로드 흐름 연결: `fromDom` → `mount` | 왕복 검증 테스트 통과 |

## 8. 결정 사항 및 리스크

| 항목 | 내용 |
|------|------|
| 결정 필요 | `createDom`에서 보안 필터를 한 번 더 적용할지 (현재 안: 적용 안 함, VNode 신뢰) |
| 결정 필요 | 네임스페이스를 부모에서 추론하는 방식 유지 vs VNode에 `ns` 필드 추가 (현재 안: 추론) |
| 리스크 | DocumentFragment는 붙이는 순간 비워짐 → 같은 결과를 두 번 붙일 수 없음. 필요하면 `createDom`을 다시 호출 |
| 리스크 | 손으로 만든 VNode(테스트 코드 등)는 보안 필터를 거치지 않음 → 테스트 외 경로에서는 반드시 `fromDom` / `fromHtml` 결과만 사용 |
