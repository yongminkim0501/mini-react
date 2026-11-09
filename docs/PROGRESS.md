# 진행 현황

최종 갱신: 2026-11-09 · 브랜치: `feat/virtual-dom-vnode`

모듈을 추가하거나 상태가 바뀔 때마다 이 문서를 함께 갱신한다. 모듈별 상세 설계는 각 기획서(`docs/*.md`), 알려진 문제는 [`risk_issue/README.md`](../risk_issue/README.md)를 본다.

## 1. 과제 범위

| 단계 | 내용 | 상태 |
|------|------|------|
| Phase 1 | Virtual DOM 변환, Diff, Patch | 핵심 모듈 완료 |
| Phase 1 | 화면(실제 영역, 테스트 영역, Patch/뒤로가기/앞으로가기 버튼), State History | 미착수 |
| Phase 2 | 함수형 컴포넌트, state, hooks (`useState`, `useEffect`, `useMemo`) | 미착수 |

제약: 바닐라 JS/TS만 사용하고 상용 프레임워크는 쓰지 않는다. Vite, Vitest, jsdom, TypeScript는 개발 도구로만 쓴다.

## 2. 데이터 흐름

```
HTML 문자열 ──fromHtml──▶ VNode ──createDom/mount──▶ 실제 DOM
실제 DOM ────fromDom───▶ VNode ──serialize────────▶ 들여쓴 HTML (테스트 영역)
이전 VNode + 새 VNode ──diff──▶ Patch[] ──applyPatches──▶ 실제 DOM 부분 갱신
```

Patch 버튼 한 번의 예상 흐름(컨트롤러 미구현):

1. 테스트 영역 텍스트를 `fromHtml`로 새 VNode로 만든다.
2. 현재 VNode와 `diff`해서 Patch 목록을 얻는다.
3. `applyPatches`로 실제 영역에 반영한다. `ok: false`면 `mount`로 다시 그린다.
4. 새 VNode를 State History에 넣는다.

## 3. 모듈 현황

| 모듈 | 경로 | 기획서 | 공개 API | 상태 | 커밋 |
|------|------|--------|----------|------|------|
| HTML → VNode | `src/core/html-to-vnode/` | [html-to-vnode.md](./html-to-vnode.md) | `fromHtml`, `readSource` | 완료 | 5ccf43a, e003b1a |
| DOM → VNode | `src/core/html-to-vnode/fromDom.ts` | [from-dom.md](./from-dom.md) | `fromDom` | 완료 | 0e8a096, 664a520 |
| VNode → DOM | `src/core/vnode-to-dom/` | [create-dom.md](./create-dom.md) | `createDom`, `mount`, 네임스페이스 상수 | 완료 | a3bf406, 7d8ac49 |
| VNode → HTML | `src/core/vnode-to-html/` | [serialize.md](./serialize.md) | `serialize` | 완료 | 553cae9, 47643d0 |
| Diff | `src/core/diff/` | [diff.md](./diff.md) | `diff`, `diffProps`, `Patch` 타입 | 완료 | 608100c, d5f9203 |
| Patch 적용 | `src/core/patch/` | [apply-patches.md](./apply-patches.md) | `applyPatches`, `resolvePath`, `syncFormProp` | 완료 | 1dff63d, 1e07a68 |
| State History | - | 미작성 | - | 미착수 | - |
| 컨트롤러·UI | `src/main.ts` (현재 placeholder) | 미작성 | - | 미착수 | - |
| 컴포넌트·hooks | - | 미작성 | - | 미착수 | - |

## 4. 모듈별 요약

### fromHtml / fromDom

- `<template>`으로 파싱해서 스크립트가 실행되지 않게 한다. 입력 상한은 500,000자다.
- VNode 형태: `VText {kind:'text', text}`, `VElement {kind:'element', tag, props, children, key?}`. 최상위는 `tag: '#root'`다.
- `props`는 프로토타입 없는 객체이고, 트리 전체를 `Object.freeze`로 얼린다.
- 보안 필터: `script`, `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base`, `template` 요소, `on*` 속성, `javascript:` URL을 제거하고 경고를 남긴다.
- 공백 정리: ASCII 공백만 공백으로 본다. 줄바꿈이 낀 양 끝 공백은 버리고, 나머지 연속 공백은 한 칸으로 줄인다. `pre`, `textarea` 안은 그대로 둔다.
- `data-key`는 `key`로 옮기고, 형제 사이 중복이면 경고한다.

### createDom / mount

- 텍스트는 Text 노드, `#root`는 DocumentFragment, 요소는 네임스페이스에 맞춰 만든다.
- `svg`는 SVG, `math`는 MathML, `foreignObject` 자식은 다시 HTML로 추론한다.
- `mount(container, vnode)`는 컨테이너 자식을 통째로 교체한다.

### serialize

- 자식이 모두 요소면 2칸 들여쓰기 블록, 텍스트가 하나라도 있으면 한 줄로 쓴다.
- 텍스트와 속성 값을 이스케이프하고 빈 요소(void)는 닫는 태그를 쓰지 않는다.
- 불변 조건: `fromHtml(serialize(v)).vnode`가 `v`와 같다.

### diff

- 인덱스 기반 O(n) 비교. Patch는 `CREATE`, `REMOVE`, `REPLACE`, `TEXT`, `PROPS` 5종이다.
- 모든 경로는 이전 트리 기준이다. 같은 객체는 하위 비교를 건너뛴다.
- key 기반 비교는 아직 하지 않는다.

### applyPatches

- 1단계에서 모든 대상을 찾고, 하나라도 없거나 종류가 맞지 않으면 DOM을 건드리지 않고 `{ok: false, changed: []}`를 돌려준다.
- 2단계에서 반영한다. 새 노드의 네임스페이스는 부모 DOM에서 계산한다.
- `value`, `checked`, `selected`는 속성과 함께 property도 맞춘다. file 입력의 `value`는 건너뛴다.
- `changed`는 바뀐 요소 목록이다. 텍스트 변경과 삭제는 부모 요소를 담는다. 하이라이트에 쓸 수 있다.

## 5. 테스트

`npm run test:run` 기준 11개 파일, 150개 통과. `npm run typecheck` 오류 없음.

| 파일 | 내용 |
|------|------|
| `html-to-vnode/pure.test.ts` | 공백 정리, class 정리, 보안 판정 순수 함수 |
| `html-to-vnode/fromHtml.test.ts` | 파싱, 보안 필터, 경고, 동결 |
| `html-to-vnode/fromDom.test.ts` | DOM 변환, fromHtml과 결과 일치 |
| `vnode-to-dom/namespace.test.ts` | 네임스페이스 추론 |
| `vnode-to-dom/createDom.test.ts` | DOM 생성, mount, 왕복, 경로 대응 |
| `vnode-to-html/serialize.test.ts` | 들여쓰기, 이스케이프, void, pre/textarea |
| `vnode-to-html/roundtrip.test.ts` | 입력 20종 왕복, 테스트 영역 로드 흐름 |
| `diff/diff.test.ts` | Patch 종류별 단위 테스트 |
| `diff/diff.integration.test.ts` | 기획서 시나리오, 경로 존재, 입력 불변 |
| `patch/applyPatches.test.ts` | 변경 기록 검증, 실패 시 무변경, SVG, 폼, 왕복 10종, 연속 적용 |
| `setup.test.ts` | jsdom 동작 확인 |

## 6. 주요 결정

- 보안 필터는 실제 영역 샘플에도 적용한다. 그래서 샘플의 이벤트 속성도 사라진다.
- 네임스페이스는 태그와 부모로 추론하고 VNode에 저장하지 않는다.
- 들여쓰기는 2칸이다.
- key 기반 diff는 뒤로 미룬다. 지금은 인덱스 기반이다.
- 경로 불일치 시 다시 그리기, 변경 하이라이트는 컨트롤러가 맡는다.

## 7. 우선 처리할 리스크

상세는 [`risk_issue/README.md`](../risk_issue/README.md).

1. FD-01 / AP-03: Patch 외 DOM 변경으로 DOM·VNode 대응이 깨지는 문제. 컨트롤러가 정규화된 mount를 보장해야 한다.
2. HV-01: SVG `<animate>`/`<set>`로 `javascript:` 필터 우회 가능.
3. AP-01 / AP-02: 사용자가 입력한 textarea는 TEXT Patch로 값이 안 바뀜. 반영 중 예외가 나면 화면이 반쯤 바뀐 채 남음.
4. HV-02 / CD-04: 깊은 중첩에서 스택 오버플로.
5. HV-03: 인라인 요소 사이 줄바꿈이 사라져 `A B`가 `AB`로 보임.

## 8. 다음 작업

1. State History 기획과 구현 (뒤로가기/앞으로가기).
2. 컨트롤러와 화면: 실제 영역, 테스트 영역, 버튼 연결, 실패 시 다시 그리기, 변경 하이라이트.
3. Phase 2: 함수형 컴포넌트와 hooks.

## 9. 커밋 기록

| 커밋 | 내용 |
|------|------|
| 3ecea4d | Initial commit |
| 89c3c95 | PR 템플릿 추가 (develop) |
| eda3292 | Vite + Vitest + TypeScript 설정 |
| 5ccf43a / e003b1a | fromHtml 기획서 / 구현 |
| 0e8a096 / 664a520 | fromDom 기획서 / 구현 |
| a3bf406 / 7d8ac49 | createDom 기획서 / 구현 |
| 553cae9 / 47643d0 | serialize 기획서 / 구현 |
| aced930 | 리스크·이슈 목록 |
| 608100c / d5f9203 | diff 기획서 / 구현 |
| 1dff63d / 1e07a68 | applyPatches 기획서 / 구현 |
| 306189c | 리스크·이슈 목록 갱신 (diff, applyPatches) |

`a3bf406`부터 최신 커밋까지는 아직 원격에 올리지 않았다.
