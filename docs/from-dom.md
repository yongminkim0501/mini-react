# Core-React: DOM → VNode 변환 모듈(fromDom) 개발 기획서

작성일: 2026-11-06

## 1. 개요

페이지에 이미 렌더링된 실제 영역의 DOM을 읽어 VNode 트리로 바꾸는 `fromDom` 모듈을 구현한다. 페이지 로드 시 최초 상태(v0)를 만드는 데 사용한다.

`fromHtml`의 4~9단계(순회 ~ 결과 반환)를 `fromDom`으로 분리하고, `fromHtml`은 문자열을 DOM으로 만든 뒤 `fromDom`을 호출하도록 바꾼다. 두 경로가 같은 변환 로직을 쓰므로 결과 규칙이 어긋나지 않는다.

| 항목 | 내용 |
|------|------|
| 입력 | 실제 영역 컨테이너 요소, 또는 DocumentFragment |
| 출력 | `{ vnode, warnings, ok }` (`fromHtml`과 동일) |
| 사용 시점 | 페이지 로드 시 1회 |
| 원칙 | DOM을 읽기만 하고 절대 수정하지 않음 |

## 2. 범위

| 구분 | 내용 |
|------|------|
| 포함 | `fromDom` 구현 |
| 포함 | `fromHtml`이 `fromDom`을 사용하도록 리팩터링 |
| 후속 | 정규화 마운트 (5장) — `createDom` 구현 후 진행 |
| 제외 | `createDom`, `serialize`, diff, patch, State History |

## 3. 처리 흐름

```
fromHtml(문자열) ── 크기 검사 ── template 파싱 ──┐
                                                 ▼
fromDom(컨테이너) ──────────────────────────▶ [1 루트 설정] → [2 순회] → [3 요소 판정] → [4 속성 처리]
                                                                     → [5 텍스트 정리] → [6 동결] → [7 결과 반환]
```

### 1단계. 루트 설정

컨테이너 자신은 VNode에 넣지 않고, 컨테이너의 자식들을 `#root` VNode의 자식으로 만든다.

- 이유: 컨테이너(`<div id="real-area">`)는 페이지 UI이지 샘플 콘텐츠가 아니다. 테스트 영역의 코드에도 컨테이너는 없다.
- 입력이 DocumentFragment(`template.content`)이면 그대로 루트로 사용한다.

### 2~7단계

[fromHtml 기획서](./html-to-vnode.md) 4~9단계와 동일하다.

| 단계 | 내용 |
|------|------|
| 2 순회 | 깊이 우선. 요소 / 텍스트 / 기타(버림)로 분기 |
| 3 요소 판정 | 차단 목록 요소 제거, 태그명은 `localName` |
| 4 속성 처리 | 이벤트 속성·위험 링크 제거, class 정리, `data-key` 추출 |
| 5 텍스트 정리 | 모아서 정리. 줄바꿈 섞인 공백은 버림, 줄바꿈 없는 공백은 한 칸 유지 |
| 6 동결 | `Object.freeze` |
| 7 결과 반환 | `{ vnode, warnings, ok }` |

## 4. Live DOM에서만 생기는 차이

| 상황 | 처리 |
|------|------|
| 인접한 텍스트 노드가 여러 개 존재 (스크립트로 추가된 경우) | 5단계의 텍스트 모으기가 하나로 합침 |
| 사용자가 `<input>`에 직접 입력한 값 | 읽지 않음. VNode는 속성(마크업)만 표현 |
| 컨테이너 자신의 속성 (`id`, `class`) | 읽지 않음 |
| Shadow DOM | 순회하지 않음 |
| 크기 검사 | 하지 않음. 실제 영역 샘플은 개발자가 작성한 고정 HTML |

보안 필터는 실제 영역에도 똑같이 적용한다. 두 경로의 규칙이 같아야 같은 HTML이 같은 VNode가 된다.

## 5. 정규화 마운트 (후속 작업)

`fromDom`은 들여쓰기 공백과 주석을 버리므로, 변환 직후에는 VNode의 자식 순서와 실제 DOM의 자식 순서가 어긋난다. 이 상태에서는 경로 기반 Patch가 엉뚱한 노드를 수정한다.

해결: 로드 시 v0을 만든 직후, 실제 영역의 내용을 `createDom(v0)` 결과로 한 번 교체한다. 화면에 보이는 차이는 없고(버려진 것은 공백과 주석뿐), 이후 실제 영역 DOM과 VNode가 1:1로 일치한다.

```
페이지 로드
 → v0 = fromDom(실제 영역)
 → 실제 영역 내용을 createDom(v0)로 교체     ← createDom 구현 후 연결
 → history.push(v0)
```

## 6. 함수 단위 설계

### 6.1 파일 구성

```
src/core/html-to-vnode/
├─ index.ts      # fromHtml (크기 검사 + 파싱 + fromDom 호출)
├─ fromDom.ts    # fromDom (신규)
├─ types.ts
├─ parse.ts
├─ convert.ts
├─ sanitize.ts
├─ text.ts
└─ freeze.ts
```

### 6.2 함수 목록

| 함수 | 입력 → 출력 | 변경 |
|------|-------------|------|
| `fromDom` | Element 또는 DocumentFragment → 결과 객체 | 신규 |
| `fromHtml` | 문자열 → 결과 객체 | 내부에서 `fromDom` 호출하도록 수정 |
| `convertChildren` 외 기존 함수 | — | 변경 없음 |

## 7. 기대 입출력

입력 (`index.html`에 작성된 실제 영역)

```html
<div id="real-area" class="area">
  <h1 class="title">장보기 목록</h1>
  <!-- 샘플 -->
  <ul>
    <li data-key="a">사과</li>
    <li data-key="b">바나나</li>
  </ul>
</div>
```

호출: `fromDom(document.getElementById('real-area'))`

출력

```js
{
  vnode: {
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
  },
  warnings: [],
  ok: true
}
```

## 8. 테스트 계획

| 입력 | 기대 |
|------|------|
| 7장 입력 | 7장 출력과 동일 |
| 컨테이너에 `id`, `class` 있음 | 루트 `props`는 비어 있음 |
| 들여쓰기·주석 포함 컨테이너 | 공백 텍스트와 주석 없음 |
| 변환 중 MutationObserver로 관찰 | DOM 변경 0건 |
| 같은 컨테이너에 대해 `fromHtml(container.innerHTML)` | `fromDom(container)`와 결과 동일 |
| `appendChild`로 텍스트 노드 `"안녕"`, `" 세상"` 연속 추가 | 텍스트 하나 `"안녕 세상"` |
| `<input value="a">`에 사용자가 `"b"` 입력 후 변환 | `props.value`는 `"a"` |
| 컨테이너에 `<img onerror>` 포함 | onerror 제거, 경고 1건 |
| 빈 컨테이너 | 자식 없는 `#root`, `ok: true` |
| `fromHtml` 기존 테스트 전체 | 리팩터링 후에도 전부 통과 |

## 9. 작업 분해

| 순서 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `fromDom.ts` 작성 (루트 설정 + 기존 변환 로직 호출) | 7장 입출력 일치 |
| 2 | `fromHtml`이 `fromDom`을 호출하도록 수정 | `fromHtml` 기존 테스트 전부 통과 |
| 3 | 8장 테스트 작성 및 통과 | 8장 전부 통과 |
| 4 | 정규화 마운트 연결 (`createDom` 구현 후) | 마운트 후 `fromDom(실제 영역)`이 v0과 동일 |

## 10. 결정 사항 및 리스크

| 항목 | 내용 |
|------|------|
| 결정 필요 | 실제 영역 샘플에도 보안 필터를 적용할지 (현재 안: 적용) |
| 리스크 | 정규화 마운트 전에는 Patch 불가 → `createDom` 완료 전까지 로드 흐름 미완성 |
| 리스크 | 실제 영역 샘플을 `div` 안에서 파싱하므로 최상위 `<tr>`, `<td>`는 사라짐 → 샘플 작성 규칙으로 금지 |
