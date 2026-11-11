# fromHtml (HTML → VNode) 리스크·이슈

관련 코드: `src/core/html-to-vnode/` · 기획서: [docs/html-to-vnode.md](../docs/html-to-vnode.md)

## HV-01

**SVG 애니메이션 요소로 `javascript:` 링크 필터 우회** · 높음 · 예상

- **현상:** 위험 링크 검사는 속성의 현재 값만 본다. SVG의 `<animate>`, `<set>`은 다른 속성의 값을 실행 중에 바꿀 수 있다.
- **재현 예:** `<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text y="20">클릭</text></a></svg>`. `values`, `to`, `from` 속성은 URL 속성 목록에 없어 그대로 통과한다.
- **영향:** 실제 영역에 그려진 링크를 누르면 스크립트가 실행될 수 있다.
- **대응안:** `animate`, `set`, `animateMotion`, `animateTransform`을 차단 목록에 추가한다. 화면 표현에 거의 쓰이지 않아 손실이 적다.

## HV-02

**깊게 중첩된 입력에서 스택 오버플로** · 중간 · 확인됨

- **현상:** `convertChildren` ↔ `convertElement`가 재귀로 동작한다. `<span>` 20,000개 중첩 입력에서 `RangeError: Maximum call stack size exceeded`가 발생했다 (jsdom).
- **영향:** "예외는 던지지 않는다"는 약속이 깨진다. 컨트롤러가 예외를 처리하지 않으면 페이지가 멈춘다.
- **참고:** Chromium 계열 파서는 트리 깊이를 약 512로 제한한다고 알려져 있어 브라우저의 `fromHtml`에서는 덜 발생할 수 있다. 직접 확인하지 않았다. 스크립트로 만든 DOM을 읽는 `fromDom`은 이 제한이 없다.
- **대응안:** 최대 깊이(예: 256)를 정하고 초과 시 `INPUT_TOO_DEEP` error 경고와 `ok: false`로 끝낸다. 또는 `fromHtml` 전체를 `try/catch`로 감싸 `ok: false`로 바꾼다.

## HV-03

**인라인 요소 사이 줄바꿈 공백 소실** · 중간 · 확인됨

- **현상:** `<b>A</b>\n<i>B</i>`의 `"\n"`은 줄바꿈 섞인 공백이라 버려진다. 브라우저는 이 공백을 한 칸으로 그리므로 원래는 `A B`로 보인다.
- **영향:** 사용자가 테스트 영역에서 줄을 바꿔 인라인 요소를 쓰면 Patch 후 실제 영역에서 글자가 붙어 보인다. 기획서 7단계 규칙을 따른 결과다.
- **대응안:** 양쪽 형제가 모두 인라인 요소(`b`, `i`, `span`, `a` 등)일 때만 줄바꿈 공백을 한 칸으로 남긴다. 이 경우 serialize의 블록 출력 규칙도 함께 바꿔야 왕복이 유지된다.

## HV-04

**중복 `data-key`** · 중간 · 예상

- **현상:** 같은 부모 아래 `data-key`가 겹치면 `DUPLICATE_KEY` 경고만 남기고 둘 다 `key`를 가진다.
- **영향:** key 기반 diff에서 어느 노드와 짝지을지 정해지지 않는다. 노드가 잘못 이동하거나 사라질 수 있다.
- **대응안:** diff 기획에서 중복 key 처리 규칙을 정한다. 예: 중복이면 해당 부모는 key를 무시하고 인덱스로 비교.

## HV-05

**`style` 속성과 외부 URL 허용** · 낮음 · 예상

- **현상:** `style` 속성과 `http(s):` URL은 그대로 통과한다.
- **영향:** `style="position:fixed;inset:0"`으로 페이지 전체를 덮거나, `<img src="https://외부">`로 외부에 요청을 보낼 수 있다. 스크립트 실행은 아니다.
- **대응안:** 학습용 데모 범위에서는 허용하고 문서화한다. 필요하면 실제 영역에 `overflow: hidden`, `contain: paint`를 걸어 화면 밖으로 넘치지 않게 한다.

## HV-06

**DOM clobbering** · 낮음 · 예상

- **현상:** `id`, `name` 속성은 그대로 통과한다. `<img id="realArea">` 같은 요소는 `window.realArea`를 덮어쓴다.
- **영향:** 페이지 코드가 전역 변수를 암묵적으로 쓰면 오동작한다.
- **대응안:** 페이지 코드는 모듈 스코프 변수와 `getElementById`만 쓴다. 전역 이름에 의존하지 않는다.

## HV-07

**차단 요소 경고의 `path`가 근사값** · 낮음 · 예상

- **현상:** `SANITIZED_ELEMENT`의 `path` 마지막 값은 경고 시점의 `children.length`다. 아직 정리되지 않은 텍스트가 앞에 있으면 실제 위치와 한 칸 어긋날 수 있다.
- **영향:** 경고를 화면에 표시할 때 위치 안내가 부정확하다. 변환 결과에는 영향 없다.

## HV-08

**`props`가 프로토타입 없는 객체** · 낮음 · 예상

- **현상:** `__proto__` 속성 이름을 안전하게 담기 위해 `Object.create(null)`을 쓴다.
- **영향:** diff/patch에서 `props.hasOwnProperty(name)`을 호출하면 `TypeError`가 난다.
- **대응안:** `Object.hasOwn(props, name)`, `Object.keys`, `Object.entries`만 쓴다는 규칙을 diff 기획에 적는다.

## HV-09

**CSS `white-space: pre` 요소의 공백 정리** · 낮음 · 기획 리스크

- **현상:** 공백 보존 여부를 태그(`pre`, `textarea`)로만 판단한다. CSS로 `white-space: pre`를 준 일반 요소의 공백은 정리된다.
- **대응:** 한계로 문서화. 공백이 중요한 내용은 `pre` 태그를 쓴다.

## HV-10

**브라우저 파서 자동 보정** · 낮음 · 기획 리스크

- **현상:** `<p>` 안의 `<div>`, `<table>` 바로 아래 `<tr>`(→ `tbody` 자동 삽입) 등은 파서가 구조를 바꾼다.
- **대응:** 파서 결과를 정답으로 간주한다. serialize가 보정된 구조를 출력하므로 Patch 후 테스트 영역 코드가 사용자가 쓴 것과 다르게 보일 수 있다.

## HV-11

**단축키 Patch 시 한글 IME 조합 중인 글자 누락** · 중간 · 기획 리스크 (미구현)

- **현상:** 한글 조합이 끝나기 전에 `textarea.value`를 읽으면 마지막 글자가 빠질 수 있다.
- **대응안:** 컨트롤러에서 `KeyboardEvent.isComposing`이 `true`면 Patch를 보류한다. 컨트롤러 구현 시 반영해야 한다.
