# Core-React: 검증 페이지 조립 개발 기획서

작성일: 2026-11-06

## 1. 개요

지금까지 만든 모듈을 하나의 웹 페이지에 연결한다. 실제 영역, 테스트 영역, 버튼 3개(Patch, 뒤로가기, 앞으로가기)로 Virtual DOM과 Diff 알고리즘을 직접 검증할 수 있게 한다.

| 항목 | 내용 |
|------|------|
| 입력 | 사용자 동작 (페이지 로드, 테스트 영역 수정, 버튼 클릭) |
| 출력 | 실제 영역·테스트 영역 갱신, 버튼 활성화 상태, 위치 표시, Patch 로그 |
| 사용 모듈 | `fromDom`, `mount`, `serialize`, `fromHtml`, `diff`, `applyPatches`, `StateHistory` |
| 제약 | HTML, CSS, 바닐라 JS/TS만 사용 |

## 2. 범위

| 구분 | 내용 |
|------|------|
| 포함 | `index.html` 화면 구조와 실제 영역 샘플 HTML |
| 포함 | `styles.css` 레이아웃 |
| 포함 | 컨트롤러: 로드 / Patch / 뒤로가기 / 앞으로가기 흐름 |
| 포함 | 위치 표시, 버튼 활성화, Patch 로그, 경고 표시, 변경 하이라이트 |
| 제외 | key 기반 diff, 특정 위치로 바로 이동 |

## 3. 화면 구성

```
┌──────────────────────────────────────────────────────────────┐
│  [◀ 뒤로가기]   [Patch]   [앞으로가기 ▶]         2 / 3         │
├───────────────────────────────┬──────────────────────────────┤
│  실제 영역                     │  테스트 영역                    │
│  (샘플 HTML 렌더링 결과)        │  (textarea, HTML 코드 편집)     │
│                               │                              │
├───────────────────────────────┴──────────────────────────────┤
│  상태 메시지 / 경고                                             │
│  Patch 로그                                                    │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 요소 목록

| id | 요소 | 역할 |
|----|------|------|
| `real-area` | div | 실제 영역 |
| `test-area` | textarea | 테스트 영역 (`spellcheck="false"`, `wrap="soft"`) |
| `btn-back` | button | 뒤로가기 |
| `btn-patch` | button | Patch |
| `btn-forward` | button | 앞으로가기 |
| `history-pos` | span | 위치 표시 n / 전체 |
| `status` | div | 상태 메시지, 경고 |
| `patch-log` | ol | 마지막 동작의 Patch 목록 |

### 3.2 레이아웃

- 두 영역은 CSS Grid로 좌우 배치, 화면 폭 768px 미만에서는 위아래 배치
- 실제 영역 샘플용 스타일은 `#real-area` 하위 선택자로만 작성해 페이지 UI에 영향이 없게 함
- textarea는 고정폭 글꼴

## 4. 실제 영역 샘플 HTML

`index.html`의 `#real-area` 안에 직접 작성한다.

```html
<div id="real-area">
  <h1 class="title">장보기 목록</h1>
  <!-- 샘플 -->
  <ul>
    <li data-key="a">사과</li>
    <li data-key="b">바나나</li>
  </ul>
</div>
```

작성 규칙:

- `script`, `style`, `iframe` 등 차단 목록 요소를 넣지 않는다.
- 최상위에 `tr`, `td`, `li` 같은 하위 전용 요소를 단독으로 두지 않는다.

## 5. 동작 흐름

### 5.1 페이지 로드

| 순서 | 처리 |
|------|------|
| 1 | `v0 = fromDom(실제 영역).vnode` |
| 2 | `mount(실제 영역, v0)` — 공백·주석 제거, DOM과 VNode 1:1 일치 |
| 3 | `textarea.value = serialize(v0)` |
| 4 | `history.push(v0)` |
| 5 | 화면 상태 갱신 (5.5) |

### 5.2 Patch 버튼

| 순서 | 처리 | 실패 / 예외 시 |
|------|------|----------------|
| 1 | `result = fromHtml(textarea.value)` | `ok`가 false면 오류 메시지 표시 후 중단 |
| 2 | 경고가 있으면 상태 영역에 표시 | — |
| 3 | `patches = diff(history.current, result.vnode)` | 빈 배열이면 "변경 사항 없음" 표시 후 중단 |
| 4 | `applyPatches(실제 영역, patches)` | 실패하면 `mount(실제 영역, result.vnode)`로 복구 |
| 5 | `history.push(result.vnode)` | — |
| 6 | `textarea.value = serialize(result.vnode)` | — |
| 7 | Patch 로그 표시, 변경 요소 하이라이트, 화면 상태 갱신 | — |

6번은 사용자가 쓴 코드를 정리된 코드로 바꿔 보여준다. 브라우저가 실제로 어떻게 해석했는지(제거된 속성, 파서 보정 등) 바로 확인할 수 있다.

### 5.3 뒤로가기 / 앞으로가기

| 순서 | 처리 | 실패 / 예외 시 |
|------|------|----------------|
| 1 | 테스트 영역이 수정된 상태면 확인 창 | 취소하면 중단 |
| 2 | `from = history.current` | — |
| 3 | `to = history.back()` (또는 `forward()`) | null이면 중단 |
| 4 | `patches = diff(from, to)` | — |
| 5 | `applyPatches(실제 영역, patches)` | 실패하면 `mount(실제 영역, to)`로 복구 |
| 6 | `textarea.value = serialize(to)` | — |
| 7 | Patch 로그 표시, 변경 요소 하이라이트, 화면 상태 갱신 | — |

"수정된 상태" 판정: `textarea.value !== serialize(history.current)`

### 5.4 이동에도 diff를 쓰는 이유

뒤로가기/앞으로가기도 "두 VNode 사이의 변화"이므로 `diff`와 `applyPatches`를 그대로 사용한다. 실제 영역 전체를 다시 그리지 않고, 알고리즘을 한 번 더 검증하는 효과가 있다.

### 5.5 화면 상태 갱신

| 대상 | 값 |
|------|----|
| `btn-back.disabled` | `!history.canBack` |
| `btn-forward.disabled` | `!history.canForward` |
| `history-pos` | `` `${index} / ${total}` `` |

## 6. Patch 로그 표시 형식

| Patch | 표시 예 |
|-------|---------|
| PROPS | `PROPS [0] class="title big"` / `PROPS [0] -class` |
| TEXT | `TEXT [0,0] "오늘 장보기"` |
| CREATE | `CREATE [1] 2번째에 <li data-key="c">` |
| REMOVE | `REMOVE [1,2]` |
| REPLACE | `REPLACE [2] → <div>` |

로그 아래에 `Patch 4건`처럼 건수를 함께 표시한다.

## 7. 변경 하이라이트

`applyPatches`가 반환한 `changed` 요소에 `Element.animate()`로 배경색이 잠깐 깜빡이는 효과를 준다.

- **이유:** class나 style 속성을 바꾸지 않으므로 실제 영역 DOM과 VNode의 일치가 깨지지 않는다.

## 8. 함수 단위 설계

### 8.1 파일 구성

```
core-react/
├─ index.html
├─ styles.css
└─ src/
   ├─ main.ts          # 페이지 로드 시 컨트롤러 시작
   └─ app/
      ├─ controller.ts # 로드 / Patch / 뒤로 / 앞으로 흐름
      ├─ view.ts       # 화면 요소 참조, 상태 갱신, 메시지
      └─ log.ts        # Patch 로그 문장 만들기, 하이라이트
```

### 8.2 함수 목록

| 함수 | 역할 |
|------|------|
| `init` | 5.1 로드 흐름, 버튼 이벤트 등록 |
| `onPatch` | 5.2 Patch 흐름 |
| `onBack` / `onForward` | 5.3 이동 흐름 (공통 함수 `moveTo` 사용) |
| `isDirty` | 테스트 영역 수정 여부 |
| `updateControls` | 5.5 버튼·위치 갱신 |
| `showStatus` | 메시지·경고 표시 |
| `formatPatch` | Patch 한 건 → 로그 문장 |
| `showPatchLog` | 로그 목록 표시 |
| `highlight` | 변경 요소 깜빡임 |

## 9. 기대 입출력 (사용 시나리오)

| # | 사용자 동작 | 실제 영역 | 테스트 영역 | 위치 | 뒤로 / 앞으로 | 로그·메시지 |
|---|-------------|-----------|-------------|------|---------------|-------------|
| 1 | 페이지 로드 | 장보기 목록 / 사과, 바나나 | 정리된 샘플 코드 | 1 / 1 | 꺼짐 / 꺼짐 | 없음 |
| 2 | 테스트 영역에서 제목을 `오늘 장보기`, class에 `big` 추가, 바나나 → 배, 우유 추가 후 Patch | 오늘 장보기 / 사과, 배, 우유 | 수정 내용의 정리된 코드 | 2 / 2 | 켜짐 / 꺼짐 | Patch 4건 (PROPS, TEXT, TEXT, CREATE) |
| 3 | 뒤로가기 | 장보기 목록 / 사과, 바나나 | 1번 코드 | 1 / 2 | 꺼짐 / 켜짐 | Patch 4건 (PROPS, TEXT, TEXT, REMOVE) |
| 4 | 앞으로가기 | 2번과 동일 | 2번 코드 | 2 / 2 | 켜짐 / 꺼짐 | Patch 4건 |
| 5 | 아무것도 안 바꾸고 Patch | 변화 없음 | 변화 없음 | 2 / 2 | 변화 없음 | "변경 사항 없음" |
| 6 | `<img src=x onerror="alert(1)">` 추가 후 Patch | img 추가, 알림창 안 뜸 | onerror 빠진 코드 | 3 / 3 | 켜짐 / 꺼짐 | Patch 1건 (CREATE), 경고 "onerror 속성 제거됨" |
| 7 | 50만 자 넘는 내용으로 Patch | 변화 없음 | 입력 그대로 | 변화 없음 | 변화 없음 | 오류 "입력이 너무 큽니다" |
| 8 | 1번 상태에서 테스트 영역 수정 후 Patch 없이 뒤로가기 | — | — | — | — | 확인 창 표시 |
| 9 | 3번 상태(1 / 3)에서 수정 후 Patch | 새 상태 | 새 코드 | 2 / 2 | 켜짐 / 꺼짐 | 이전의 2, 3번 기록 삭제 |

3번 Patch 상세:

```js
[
  { type: 'PROPS', path: [0], set: { class: 'title' }, remove: [] },
  { type: 'TEXT', path: [0, 0], text: '장보기 목록' },
  { type: 'TEXT', path: [1, 1, 0], text: '바나나' },
  { type: 'REMOVE', path: [1, 2] }
]
```

## 10. 요구사항 대응표

| 요구사항 | 구현 위치 |
|----------|-----------|
| 브라우저 DOM을 읽어 Virtual DOM으로 변환 | `fromDom`, `fromHtml` |
| 두 Virtual DOM 비교 Diff | `diff` |
| 실제 영역, 테스트 영역, Patch / 뒤로가기 / 앞으로가기 버튼 | 3장 화면 구성 |
| 로드 시 실제 영역 → Virtual DOM | 5.1 순서 1 |
| 그 Virtual DOM으로 테스트 영역 렌더링 | 5.1 순서 3 (`serialize`) |
| 사용자가 테스트 영역 자유 수정 | textarea |
| Patch: 테스트 영역 → Virtual DOM | 5.2 순서 1 (`fromHtml`) |
| Patch: 이전 Virtual DOM과 비교 | 5.2 순서 3 (`diff`) |
| Patch: 변경된 부분만 실제 영역에 렌더링 | 5.2 순서 4 (`applyPatches`) |
| Patch: 새 Virtual DOM을 State History에 저장 | 5.2 순서 5 |
| 뒤로가기 / 앞으로가기로 이동, 두 영역 함께 변경 | 5.3 |
| 외부 프레임워크 사용 금지 | 전체 바닐라 TS / DOM API |

## 11. 테스트 계획

| 항목 | 확인 방법 |
|------|-----------|
| 9장 시나리오 1~9 | 직접 조작하여 표와 일치 확인 |
| 변경된 부분만 렌더링 | 시나리오 2에서 MutationObserver 기록이 4건이고, 첫 번째 li는 같은 DOM 객체 유지 |
| 실제 영역과 VNode 일치 | 모든 동작 후 `fromDom(실제 영역).vnode`가 `history.current`와 구조 동일 |
| 버튼 상태 | 처음 / 마지막 위치에서 해당 버튼 비활성 |
| 보안 | 시나리오 6에서 알림창이 뜨지 않음 |
| 반응형 | 768px 미만에서 두 영역이 위아래 배치 |

## 12. 작업 분해

| 순서 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | `index.html`, `styles.css` 화면 구조 | 3장 화면 표시 |
| 2 | `view.ts` 요소 참조, 상태 갱신, 메시지 | 버튼·위치 표시 동작 |
| 3 | `controller.ts` 로드 흐름 | 시나리오 1 통과 |
| 4 | Patch 흐름 | 시나리오 2, 5, 6, 7 통과 |
| 5 | 뒤로가기 / 앞으로가기 흐름 | 시나리오 3, 4, 8, 9 통과 |
| 6 | `log.ts` 로그·하이라이트 | 6장 형식으로 표시, 깜빡임 동작 |
| 7 | 11장 전체 점검 | 전부 통과 |

## 13. 결정 사항 및 리스크

| 항목 | 내용 |
|------|------|
| 결정 필요 | TS 사용 방식 — tsc 컴파일 vs JS + JSDoc 타입 검사 |
| 결정 필요 | Patch 후 테스트 영역을 정리된 코드로 덮어쓸지 (현재 안: 덮어씀) |
| 결정 필요 | 수정 중 이동 시 확인 창 사용 여부 (현재 안: `confirm` 사용) |
| 리스크 | ES Module은 `file://`로 열면 로드되지 않음 → 로컬 서버로 실행 (`python -m http.server` 등) |
| 리스크 | 단축키로 Patch를 추가하면 한글 조합 중 글자 누락 → 조합 중(`isComposing`)이면 실행 보류 |
