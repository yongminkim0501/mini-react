# Core-React: HTML → VNode 변환 모듈 개발 기획서

작성일: 2026-11-06

## 1. 개요

테스트 영역의 HTML 문자열을 정규화된 VNode 트리로 바꾸는 `fromHtml` 모듈을 구현한다. Core-React(Virtual DOM + Diff) 프로젝트의 입력단이며, 이후 diff, patch, State History가 모두 이 결과를 전제로 동작한다.

| 항목 | 내용 |
|------|------|
| 목표 | 화면에 같게 보이는 HTML은 항상 같은 VNode로 변환되도록 정규화 |
| 안전 | 사용자 입력이 실제 영역에 들어가므로 스크립트가 실행될 경로를 변환 단계에서 차단 |
| 제약 | HTML, CSS, 바닐라 JS/TS만 사용. 외부 프레임워크와 라이브러리 사용 금지 |
| 산출물 | `fromHtml(html) → { vnode, warnings, ok }` |

## 2. 범위

| 구분 | 내용 |
|------|------|
| 포함 | textarea 읽기부터 결과 반환까지 9단계 (3장) |
| 제외 | 실제 영역(Live DOM) 읽기 `fromDom` — 다음 기획에서 다룸 |
| 제외 | VNode → DOM 생성 `createDom`, VNode → HTML 문자열 `serialize` |
| 제외 | diff, patch, State History |

다른 모듈과 맺는 약속은 두 가지다.

- **serialize와의 약속:** 인라인 요소와 텍스트가 섞인 자식은 한 줄로 출력해야 한다. 줄을 바꿔 들여쓰면 의미 있는 공백 `" "`이 줄바꿈 공백으로 바뀌어, 다시 변환할 때 버려진다.
- **컨트롤러와의 약속:** 결과의 `ok`가 `false`이면 Patch를 진행하지 않는다.

## 3. 처리 흐름

```
[1 입력 획득] → [2 크기 검사] ──(초과)──→ ok:false 로 종료
                     │
                     ▼
               [3 파싱] → [4 순회] ─┬─ 요소 → [5 요소 판정] → [6 속성 처리] → 자식으로 재귀
                                    ├─ 텍스트 → [7 텍스트 정리]
                                    └─ 주석 등 → 버림
                                    │
                                    ▼
                              [8 동결] → [9 결과 반환]
```

### 1단계. 입력 획득

테스트 영역 textarea의 내용을 `value`로 읽는다.

- 이유: `textContent`는 사용자가 수정한 내용이 아니라 초기값을 반환한다.

### 2단계. 크기 검사

문자열이 50만 자를 넘으면 파싱하지 않고 `ok: false`로 종료한다.

- 이유: 빈 결과를 그냥 반환하면 "사용자가 전부 지웠다"로 해석되어 실제 영역이 통째로 삭제된다.
- 문자열을 정규식으로 다듬는 작업은 하지 않는다. HTML은 정규식으로 정확히 다룰 수 없다.

### 3단계. 파싱

`<template>` 요소에 문자열을 넣어 브라우저가 DOM으로 해석하게 한다.

- 이유: 일반 `div`에 넣으면 `<img onerror>` 같은 코드가 파싱 순간 실행된다. template 내부는 비활성 상태라 아무것도 실행되지 않는다.
- 잘못된 HTML도 브라우저가 복구하므로 이 단계는 실패하지 않는다.

### 4단계. 순회

파싱 결과를 루트부터 깊이 우선으로 훑으며 노드 종류에 따라 처리한다.

| 노드 | 처리 |
|------|------|
| 요소 | 5~6단계 |
| 텍스트 | 7단계 |
| 주석 등 | 버림 |

여러 개의 최상위 노드를 담기 위해 루트는 `#root`라는 예약 태그의 VNode로 둔다.

### 5단계. 요소 판정

요소를 만나면 먼저 받아들일지 결정한다.

- `script`, `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base`, `template`는 하위까지 통째로 버리고 경고를 남긴다.
- 허용된 요소의 태그명은 `localName`으로 읽는다.
  - 이유: `tagName`은 대문자로 나오고, 소문자로 바꾸면 SVG의 `linearGradient` 같은 태그가 깨진다.

### 6단계. 속성 처리

| 처리 | 예시 |
|------|------|
| 이벤트 속성 제거 | `onclick`, `onerror` 등 `on`으로 시작하는 속성 |
| 위험 링크 제거 | `href`, `src` 등의 값이 `javascript:`로 시작 (대소문자, 탭 섞인 우회 포함) |
| class 공백 정리 | `"a   b"` → `"a b"` |
| key 추출 | `data-key` 값을 VNode의 `key`에도 복사 (속성에서는 지우지 않음) |

### 7단계. 텍스트 정리

텍스트는 바로 VNode로 만들지 않고 모아두었다가 요소를 만나거나 형제가 끝날 때 한 번에 정리한다.

- 이유: 주석이나 제거된 요소를 사이에 둔 텍스트(`안녕<!-- -->세상`)를 하나로 합쳐야 한다.

정리 기준은 하나다. 줄바꿈이 섞인 공백은 코드 들여쓰기이므로 버리고, 줄바꿈 없는 공백은 화면에 보이므로 한 칸으로 남긴다.

| 입력 | 결과 |
|------|------|
| `<ul>` 안의 `"\n    "` | 버림 |
| `<b>A</b> <i>B</i>` 사이의 `" "` | 공백 한 칸 유지 |
| `"\n  안녕   세상\n"` | `"안녕 세상"` |

- `<pre>`, `<textarea>` 안은 공백을 그대로 둔다.
- 공백 판별에 정규식 `\s`를 쓰지 않는다. `\s`는 `&nbsp;`까지 공백으로 취급한다.

### 8단계. 동결

만들어진 VNode를 `Object.freeze`로 고정한다.

- 이유: 히스토리에 저장된 과거 상태가 나중에 실수로 바뀌는 것을 막는다.
- 자식부터 만들어지므로 생성 직후 바로 동결하면 트리 전체가 한 번에 고정된다.

### 9단계. 결과 반환

`{ vnode, warnings, ok }`를 반환한다. 예외는 던지지 않는다.

## 4. 데이터 구조

### 4.1 VNode

| 종류 | 필드 | 설명 |
|------|------|------|
| 요소 | `kind: 'element'` | 구분값 |
| | `tag` | 태그명 (`localName`) |
| | `props` | 속성 객체 (이름 → 문자열 값) |
| | `children` | 자식 VNode 배열 |
| | `key` (선택) | `data-key` 값. 없으면 필드 자체를 생략 |
| 텍스트 | `kind: 'text'` | 구분값 |
| | `text` | 정리된 텍스트 |
| 루트 | 요소와 같은 형태 | `tag: '#root'`, `props`는 항상 비어 있음 |

### 4.2 결과 객체

| 필드 | 설명 |
|------|------|
| `vnode` | 동결된 루트 VNode |
| `warnings` | 경고 배열 |
| `ok` | error 경고가 없으면 `true`. 컨트롤러는 이 값만 보고 Patch 여부를 판단 |

### 4.3 경고

경고는 `severity`, `code`, `path`, `detail`로 구성한다. `path`는 루트로부터의 VNode 자식 인덱스 배열이다.

| 코드 | 심각도 | 발생 조건 |
|------|--------|-----------|
| `INPUT_TOO_LARGE` | error | 입력이 50만 자 초과 |
| `SANITIZED_ELEMENT` | warn | 차단 목록의 요소 제거 |
| `SANITIZED_ATTR` | warn | 이벤트 속성 또는 위험 링크 제거 |
| `DUPLICATE_KEY` | warn | 같은 부모 아래 중복 `data-key` |

## 5. 함수 단위 설계

### 5.1 파일 구성

```
src/core/html-to-vnode/
├─ index.ts      # fromHtml (전체 흐름 조립)
├─ types.ts      # VNode, 결과, 경고 타입
├─ parse.ts      # 크기 검사, template 파싱
├─ convert.ts    # 순회, 요소 변환, 텍스트 모으기
├─ sanitize.ts   # 차단 목록, 위험 URL 판별
├─ text.ts       # 텍스트 정리 규칙
└─ freeze.ts     # 동결
```

### 5.2 함수 목록

| 함수 | 단계 | 입력 → 출력 | 순수 함수 |
|------|------|-------------|-----------|
| `readSource` | 1 | textarea → 문자열 | X |
| `checkSize` | 2 | 문자열 → 통과 여부 | O |
| `parseToFragment` | 3 | 문자열 → DocumentFragment | X |
| `convertChildren` | 4, 7 | 부모 노드 → VNode 배열 | X |
| `isBlockedTag` | 5 | 태그명 → boolean | O |
| `convertElement` | 5 | Element → 요소 VNode | X |
| `collectProps` | 6 | Element → props, key | X |
| `isDangerousUrl` | 6 | 속성값 → boolean | O |
| `normalizeClass` | 6 | 문자열 → 문자열 | O |
| `normalizeText` | 7 | 원문, 공백 보존 여부 → 문자열 또는 없음 | O |
| `freezeNode` | 8 | VNode → 동결된 VNode | O |
| `fromHtml` | 9 | 문자열 → 결과 객체 | X |

순수 함수는 브라우저 없이 단위 테스트한다.

## 6. 변환 예시

입력:

```html
<ul class="list   main">
  <li data-key="a" onclick="x()">사과 <b>빨강</b></li>
</ul>
<script>alert(1)</script>
```

결과:

```
#root
└─ ul  { class: "list main" }
   └─ li  { data-key: "a" }  key=a      ← onclick 제거됨
      ├─ "사과 "
      └─ b
         └─ "빨강"
                                         ← script 제거됨
```

경고 2건 (`SANITIZED_ATTR`, `SANITIZED_ELEMENT`), `ok: true`

## 7. 테스트 계획

### 7.1 순수 함수

| 대상 | 입력 | 기대 |
|------|------|------|
| `normalizeText` | `"\n   "` | 없음 (버림) |
| `normalizeText` | `"   "` | `" "` |
| `normalizeText` | `"\n  안녕   세상  \n"` | `"안녕 세상"` |
| `normalizeText` | `" 안녕 "` | `" 안녕 "` |
| `normalizeText` | `"a  b"` (nbsp) | 변경 없음 |
| `normalizeClass` | `"  a   b "` | `"a b"` |
| `isDangerousUrl` | `" JaVaScRiPt:alert(1)"` | true |
| `isDangerousUrl` | `"java\tscript:x"` | true |
| `isDangerousUrl` | `"/javascript/guide"` | false |
| `isBlockedTag` | `"script"` | true |

### 7.2 통합 (fromHtml)

| 입력 | 기대 |
|------|------|
| `<img src=x onerror="window.__hit=1">` | 파싱 후에도 `window.__hit` 미설정 (template 비활성 확인) |
| 들여쓰기된 `<ul>` + `<li>` 3개 | ul의 자식은 li 3개뿐 |
| `<b>A</b> <i>B</i>` | 자식 b, `" "`, i |
| `안녕<!-- -->\n  세상` | 텍스트 하나 `"안녕 세상"` |
| `a<script>x</script>b` | 텍스트 하나 `"ab"`, 경고 1건 |
| `<pre>  a\n  b</pre>` | 공백 그대로 보존 |
| `<DIV CLASS="x">` | 태그 `div`, 속성 `class` |
| `<svg><linearGradient/></svg>` | 태그 `linearGradient` 대소문자 보존 |
| 중복 `data-key` 형제 | `DUPLICATE_KEY` 경고 |
| 빈 문자열 | 자식 없는 `#root`, `ok: true` |
| 50만 1자 문자열 | 파싱 안 함, `ok: false` |
| 결과 VNode 수정 시도 | 동결되어 변경되지 않음 |
| 6장 예시 입력 | 6장 결과와 동일 |

## 8. 작업 분해

순서대로 진행하며, 각 작업은 완료 기준을 통과해야 다음으로 넘어간다.

| 순서 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `types.ts` 타입 정의 | VNode, 결과, 경고 타입 확정 |
| 2 | `text.ts`, `sanitize.ts`, `normalizeClass` 순수 함수 | 7.1 테스트 전부 통과 |
| 3 | `parse.ts` 크기 검사와 template 파싱 | onerror 미실행 테스트 통과 |
| 4 | `convert.ts` 순회, 요소 판정, 속성 처리 | 태그·속성·보안 관련 통합 테스트 통과 |
| 5 | `convert.ts` 텍스트 모으기와 정리 연결 | 공백·주석 관련 통합 테스트 통과 |
| 6 | `freeze.ts`, `index.ts` 조립 | 7.2 테스트 전부 통과, 6장 예시 결과 일치 |

## 9. 결정 사항 및 리스크

### 9.1 확정이 필요한 사항

| 항목 | 현재 안 |
|------|---------|
| 입력 크기 한도 | 50만 자 |
| 루트 표현 방식 | `tag: '#root'` 예약 태그 |
| style 요소 허용 여부 | 차단 (페이지 전체 스타일 오염 방지) |
| Patch 후 테스트 영역을 정리된 코드로 다시 채울지 여부 | 미정 |

### 9.2 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| CSS `white-space: pre`가 적용된 일반 요소는 감지 불가 | 해당 요소의 공백이 정리됨 | 한계로 문서화. `pre` 태그 사용 권장 |
| 브라우저 파서의 자동 보정 (`<p>` 안의 `<div>` 등) | 사용자가 쓴 코드와 결과 구조가 다름 | 파서 결과를 정답으로 간주 |
| 단축키로 Patch 실행 시 한글 IME 조합 중인 글자 누락 | 마지막 글자 미반영 | 조합 중(`isComposing`)이면 실행 보류 |
