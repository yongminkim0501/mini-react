# Core-React: VNode → HTML 문자열 모듈(serialize) 개발 기획서

작성일: 2026-11-06

## 1. 개요

VNode 트리를 사람이 읽기 좋은 들여쓰기 HTML 문자열로 바꾸는 `serialize`를 구현한다. 테스트 영역(textarea)에 코드를 보여주는 데 사용한다.

| 항목 | 내용 |
|------|------|
| 입력 | VNode |
| 출력 | HTML 문자열 |
| 사용처 | 페이지 로드 시, 뒤로가기/앞으로가기 시 테스트 영역 렌더링 |
| 핵심 조건 | `fromHtml(serialize(v)).vnode`가 `v`와 같아야 함 (왕복 불변식) |

## 2. 범위

| 구분 | 내용 |
|------|------|
| 포함 | `serialize(vnode)` |
| 포함 | 테스트 영역에 쓰기: `textarea.value = serialize(vnode)` |
| 제외 | diff, patch, State History |

## 3. 처리 흐름

```
serialize(vnode)
 └─ #root → [1 출력 방식 결정] → 자식마다 [2 노드 출력]
                                    ├─ 텍스트 → [3 텍스트 이스케이프]
                                    └─ 요소   → [4 여는 태그] → [5 자식 출력] → [6 닫는 태그]
```

### 1단계. 출력 방식 결정

요소마다 자식을 여러 줄(블록)로 쓸지 한 줄(인라인)로 쓸지 정한다.

| 조건 | 방식 |
|------|------|
| 자식이 모두 요소 | 블록: 자식마다 줄을 바꾸고 2칸 들여쓰기 |
| 자식 중 텍스트가 하나라도 있음 | 인라인: 자식 전체를 한 줄에 이어 씀 |
| 인라인 요소의 하위 | 모두 인라인 |
| `pre`, `textarea`, `listing`, `plaintext` | 인라인 + 들여쓰기 없음 |

- 이유: 변환 규칙에서 줄바꿈 섞인 공백은 버려진다. 텍스트 옆에 줄바꿈을 넣으면 `"사과 "`의 뒤 공백 같은 의미 있는 공백이 사라진다. 요소끼리만 있으면 사이의 줄바꿈은 버려지므로 안전하다.

`#root` 자신은 출력하지 않고 자식만 같은 규칙으로 출력한다.

### 2단계. 노드 출력

| 노드 | 출력 |
|------|------|
| 텍스트 | 3단계 결과 |
| 요소 | 4~6단계 결과 |

### 3단계. 텍스트 이스케이프

| 문자 | 출력 |
|------|------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| U+00A0 (nbsp) | `&nbsp;` |

- 이유: `<`를 그대로 쓰면 다시 읽을 때 태그로 해석된다. nbsp는 textarea에서 일반 공백과 구분되지 않으므로 보이게 바꾼다.

### 4단계. 여는 태그

`<태그 속성1="값" 속성2="값">` 형태로 쓴다.

| 항목 | 규칙 |
|------|------|
| 속성 순서 | `props` 순서 그대로 |
| 따옴표 | 항상 큰따옴표 |
| 값 이스케이프 | `&` → `&amp;`, `"` → `&quot;` |
| 값이 빈 문자열 | 이름만 출력 (`disabled`) |

### 5단계. 자식 출력

1단계에서 정한 방식으로 자식을 출력한다.

공백 보존 요소(`pre`, `textarea`)의 첫 글자가 줄바꿈이면 여는 태그 뒤에 줄바꿈을 하나 더 넣는다.

- 이유: 브라우저 파서는 `<pre>`, `<textarea>` 바로 뒤의 첫 줄바꿈 하나를 버린다.

### 6단계. 닫는 태그

`</태그>`를 쓴다. 단 void 요소는 닫는 태그를 쓰지 않는다.

- void 요소: `area`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`
- SVG 요소도 `<circle></circle>`처럼 닫는 태그를 쓴다. (SVG 안에서는 유효한 문법)

## 4. 함수 단위 설계

### 4.1 파일 구성

```
src/core/vnode-to-html/
├─ serialize.ts   # serialize, 노드 출력
├─ escape.ts      # 텍스트·속성값 이스케이프
└─ rules.ts       # void 요소, 공백 보존 요소, 출력 방식 판정
```

### 4.2 함수 목록

| 함수 | 입력 → 출력 | 순수 함수 |
|------|-------------|-----------|
| `serialize` | VNode → 문자열 | O |
| `serializeNode` | VNode, 깊이, 인라인 여부 → 문자열 | O |
| `escapeText` | 문자열 → 문자열 | O |
| `escapeAttr` | 문자열 → 문자열 | O |
| `isVoid` | 태그 → boolean | O |
| `isPreserve` | 태그 → boolean | O |
| `isInlineLayout` | 요소 VNode → boolean (텍스트 자식 유무) | O |

모든 함수가 DOM 없이 동작하므로 브라우저 없이 테스트한다.

## 5. 기대 입출력

### 5.1 fromDom 결과

입력

```js
{
  kind: 'element', tag: '#root', props: {},
  children: [
    { kind: 'element', tag: 'h1', props: { class: 'title' },
      children: [{ kind: 'text', text: '장보기 목록' }] },
    { kind: 'element', tag: 'ul', props: {},
      children: [
        { kind: 'element', tag: 'li', props: { 'data-key': 'a' }, key: 'a',
          children: [{ kind: 'text', text: '사과' }] },
        { kind: 'element', tag: 'li', props: { 'data-key': 'b' }, key: 'b',
          children: [{ kind: 'text', text: '바나나' }] }
      ] }
  ]
}
```

출력

```html
<h1 class="title">장보기 목록</h1>
<ul>
  <li data-key="a">사과</li>
  <li data-key="b">바나나</li>
</ul>
```

### 5.2 fromHtml 결과

입력

```js
{
  kind: 'element', tag: '#root', props: {},
  children: [
    { kind: 'element', tag: 'ul', props: { class: 'list main' },
      children: [
        { kind: 'element', tag: 'li', props: { 'data-key': 'a' }, key: 'a',
          children: [
            { kind: 'text', text: '사과 ' },
            { kind: 'element', tag: 'b', props: {},
              children: [{ kind: 'text', text: '빨강' }] }
          ] }
      ] }
  ]
}
```

출력

```html
<ul class="list main">
  <li data-key="a">사과 <b>빨강</b></li>
</ul>
```

## 6. 테스트 계획

| 입력 VNode | 기대 출력 |
|------------|-----------|
| 5.1 입력 | 5.1 출력 |
| 5.2 입력 | 5.2 출력 |
| p > b, `" "`, i | `<p><b>A</b> <i>B</i></p>` (한 줄) |
| 텍스트 `a < b & c` | `a &lt; b &amp; c` |
| 텍스트 `a b` | `a&nbsp;b` |
| 속성 `title: 'say "hi"'` | `title="say &quot;hi&quot;"` |
| 속성 `disabled: ''` | `<input disabled>` |
| br | `<br>` (닫는 태그 없음) |
| pre > 텍스트 `"\n  a"` | `<pre>\n\n  a</pre>` |
| 자식 없는 `#root` | 빈 문자열 |
| fromHtml 기획서 통합 테스트의 모든 결과 v | `fromHtml(serialize(v)).vnode`가 v와 같음 |

## 7. 작업 분해

| 순서 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `escape.ts`, `rules.ts` 순수 함수 | 이스케이프·void·보존 테스트 통과 |
| 2 | `serialize.ts` 블록/인라인 출력 | 5장 입출력 일치 |
| 3 | 왕복 테스트 | fromHtml 결과 전체에 대해 왕복 불변식 통과 |
| 4 | 페이지 로드 흐름 연결: `fromDom` → `mount` → `textarea.value = serialize(v0)` | 테스트 영역에 5.1 출력 표시 |

## 8. 결정 사항 및 리스크

| 항목 | 내용 |
|------|------|
| 결정 필요 | 들여쓰기 칸 수 (현재 안: 2칸) |
| 결정 필요 | 텍스트가 섞인 긴 요소도 한 줄로 쓰는 것 허용 (현재 안: 허용, 왕복 정확성 우선) |
| 리스크 | 인라인 규칙 때문에 긴 문단은 한 줄이 매우 길어짐 → textarea 자동 줄바꿈(wrap)으로 보완 |
| 리스크 | 출력 방식 규칙과 fromHtml 텍스트 정리 규칙이 어긋나면 왕복이 깨짐 → 7장 3번 테스트로 상시 검증 |
