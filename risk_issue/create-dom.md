# createDom / mount (VNode → DOM) 리스크·이슈

관련 코드: `src/core/vnode-to-dom/` · 기획서: [docs/create-dom.md](../docs/create-dom.md)

## CD-01

**SVG 하위 노드 단독 생성 시 네임스페이스 오류** · 높음 · 확인됨 → 해결됨

- **현상:** `createDom`의 네임스페이스 기본값은 HTML이다. `circle` VNode를 단독으로 넘기면 HTML 네임스페이스 요소가 만들어진다. `namespaceURI`가 `http://www.w3.org/1999/xhtml`인 것을 확인했다.
- **영향:** Patch의 CREATE/REPLACE가 SVG 안의 노드를 만들 때 부모 네임스페이스를 넘기지 않으면, 요소가 DOM에는 들어가지만 화면에 그려지지 않는다.
- **대응안:** Patch가 대상 부모 DOM의 `namespaceURI`와 `localName`으로 `childNamespace`를 계산해 `createDom(vnode, ns)`에 넘긴다. diff/patch 기획에 명시한다.

- **해결:** `applyPatches`가 부모 DOM의 `namespaceURI`와 `localName`으로 네임스페이스를 계산해 `createDom`에 넘긴다. `createDom` 단독 호출의 기본값은 여전히 HTML이다.

## CD-02

**손으로 만든 VNode는 보안 필터를 거치지 않음** · 높음 · 기획 리스크

- **현상:** `createDom`은 입력 VNode를 신뢰하고 `setAttribute`를 그대로 호출한다. `props: { onclick: '...' }`인 VNode를 직접 만들어 넘기면 이벤트 속성이 실제로 붙는다.
- **대응:** 테스트 외 경로에서는 `fromDom`/`fromHtml` 결과만 `createDom`에 넘긴다. History에 저장되는 VNode도 이 두 함수의 결과여야 한다.

## CD-03

**사용자가 수정한 폼은 `setAttribute`로 바뀌지 않음** · 중간 · 예상 → 해결됨

- **현상:** 사용자가 `input`에 입력하면 그 요소는 dirty 상태가 되어 이후 `setAttribute('value', ...)`가 화면 값을 바꾸지 않는다. `checked`도 같다.
- **영향:** Patch가 속성만 바꾸면 화면 입력칸 값이 VNode와 다르게 남는다.
- **대응안:** 기획서대로 Patch 단계에서 `value`, `checked`, `selected`는 property도 함께 설정한다.

- **해결:** `applyPatches`의 `syncFormProp`이 `value`, `checked`, `selected` property를 함께 맞춘다. textarea는 AP-01 참고.

## CD-04

**깊은 트리에서 재귀 스택 오버플로** · 중간 · 예상

- **현상:** `createDom` ↔ `appendChildren`이 재귀다. HV-02와 같은 원인이다.
- **대응안:** HV-02의 깊이 제한으로 입력 단계에서 막는다. 입력 단계에서 막으면 `createDom`과 `serialize`도 보호된다.

## CD-05

**구형 브라우저의 속성 이름 검사** · 낮음 · 예상

- **현상:** HTML 파서는 `@click`, `a"b` 같은 속성 이름을 허용한다. 예전 DOM 규칙의 `setAttribute`는 이런 이름에 `InvalidCharacterError`를 던진다. jsdom 31은 바뀐 규칙을 따라 통과함을 확인했다. 최신 브라우저도 통과할 것으로 예상하지만 직접 확인하지는 않았다.
- **영향:** 구형 브라우저에서 `mount`가 예외로 중단된다. `replaceChildren` 전에 실패하므로 컨테이너는 그대로 남는다.
- **대응안:** 필요하면 `setAttribute`를 `try/catch`로 감싸고 건너뛴다.

## CD-06

**`xlink:href`를 네임스페이스 없이 설정** · 낮음 · 예상

- **현상:** 모든 속성을 `setAttribute`로 설정하므로 `xlink:href`가 xlink 네임스페이스 없이 들어간다.
- **영향:** 최신 브라우저는 SVG2의 `href`를 쓰므로 문제없지만 구형 브라우저에서는 `<use xlink:href>`가 동작하지 않을 수 있다.
- **대응안:** `xlink:` 접두사 속성은 `setAttributeNS('http://www.w3.org/1999/xlink', ...)`로 설정한다.

## CD-07

**DocumentFragment는 한 번만 붙일 수 있음** · 낮음 · 기획 리스크

- **현상:** `#root`의 결과인 DocumentFragment는 붙이는 순간 비워진다.
- **대응:** 같은 내용을 다시 붙여야 하면 `createDom`을 다시 호출한다.
