# 진행 현황

최종 갱신: 2026-11-10 · 브랜치: `feat/scenario-a-lab-harness` (`feat/phase2-components-hooks`에서 분기. `develop`에는 엔진 코드가 없어 사용자 확인 후 결정, [D-A01](./decisions.md))

모듈을 추가하거나 상태가 바뀔 때마다 이 문서를 함께 갱신한다. 모듈별 상세 설계는 각 기획서(`docs/*.md`), 알려진 문제는 [`risk_issue/README.md`](../risk_issue/README.md)를 본다.

## 1. 과제 범위

| 단계 | 내용 | 상태 |
|------|------|------|
| Phase 1 | Virtual DOM 변환, Diff, Patch, State History | 핵심 모듈 완료 |
| Phase 1 | 화면(실제 영역, 테스트 영역, Patch/뒤로가기/앞으로가기 버튼) | 완료 (Chrome 확인, PR #2) |
| Phase 2 | 함수형 컴포넌트, state, hooks (`useState`, `useEffect`, `useMemo`), Todo 데모 | 완료 (Chrome 확인) |
| 작업 A | 측정용 히트맵 탐색기(stack 엔진), 계측 훅, 시나리오 러너, HUD | 완료 (Chrome 측정) |

제약: 바닐라 JS/TS만 사용하고 상용 프레임워크는 쓰지 않는다. Vite, Vitest, jsdom, TypeScript는 개발 도구로만 쓴다.

## 2. 데이터 흐름

```
HTML 문자열 ──fromHtml──▶ VNode ──createDom/mount──▶ 실제 DOM
실제 DOM ────fromDom───▶ VNode ──serialize────────▶ 들여쓴 HTML (테스트 영역)
이전 VNode + 새 VNode ──diff──▶ Patch[] ──applyPatches──▶ 실제 DOM 부분 갱신
```

Patch 버튼 한 번의 흐름 (`src/app/controller.ts`):

1. 테스트 영역 텍스트를 `fromHtml`로 새 VNode로 만든다.
2. 현재 VNode와 `diff`해서 Patch 목록을 얻는다.
3. `applyPatches`로 실제 영역에 반영한다. `ok: false`면 `mount`로 다시 그린다.
4. 새 VNode를 `history.push`로 저장한다. Patch가 빈 배열이면 저장하지 않는다.

뒤로가기/앞으로가기: `history.back()`/`forward()`로 받은 VNode와 현재 VNode를 `diff` → `applyPatches`(실패 시 `mount`) → 테스트 영역에 `serialize` 결과를 넣는다.

Phase 2 렌더링 1회 (`src/runtime/FunctionComponent.ts`):

```
setState ──scheduleUpdate(마이크로태스크, 묶음)──▶ update()
  └─ render: beginRender → fn(props) → resolve(자식 컴포넌트 펼치기) → endRender → Hook 개수 확인
  └─ diff(이전 vnode, 새 vnode) → applyPatches (실패 시 mount) → onCommit → flushEffects
```

## 3. 모듈 현황

| 모듈 | 경로 | 기획서 | 공개 API | 상태 | 커밋 |
|------|------|--------|----------|------|------|
| HTML → VNode | `src/core/html-to-vnode/` | [html-to-vnode.md](./html-to-vnode.md) | `fromHtml`, `readSource` | 완료 | 5ccf43a, e003b1a |
| DOM → VNode | `src/core/html-to-vnode/fromDom.ts` | [from-dom.md](./from-dom.md) | `fromDom` | 완료 | 0e8a096, 664a520 |
| VNode → DOM | `src/core/vnode-to-dom/` | [create-dom.md](./create-dom.md) | `createDom`, `mount`, 네임스페이스 상수 | 완료 | a3bf406, 7d8ac49 |
| VNode → HTML | `src/core/vnode-to-html/` | [serialize.md](./serialize.md) | `serialize` | 완료 | 553cae9, 47643d0 |
| Diff | `src/core/diff/` | [diff.md](./diff.md) | `diff`, `diffProps`, `Patch` 타입 | 완료 | 608100c, d5f9203 |
| Patch 적용 | `src/core/patch/` | [apply-patches.md](./apply-patches.md) | `applyPatches`, `resolvePath`, `syncFormProp` | 완료 | 1dff63d, 1e07a68 |
| State History | `src/state/history.ts` | [state-history.md](./state-history.md) | `StateHistory` (`push`, `back`, `forward`, `current`, `canBack`, `canForward`, `position`) | 완료 | b05f2c3, 36f9c24 |
| 검증 페이지 | `index.html`, `styles.css`, `src/app/` | [page.md](./page.md) | `init`, `getView`, `formatPatch`, `highlight` | 완료 | 4bb728b, ae205f6 |
| h() | `src/runtime/h.ts`, `normalize.ts`, `types.ts` | [phase2-01-h.md](./phase2-01-h.md) | `h` | 완료 | 4fb26e7, 6565504 |
| 이벤트 props | `src/core/vnode-to-dom/events.ts` (+ createDom, commit, formProps, serialize) | [phase2-02-event-props.md](./phase2-02-event-props.md) | `setEvent`, `removeEvent`, `isEventProp` | 완료 | c69b87b, d2e4988 |
| resolve | `src/runtime/resolve.ts` | [phase2-03-resolve.md](./phase2-03-resolve.md) | `resolve`, `resolveNode` | 완료 | db204ff, 5061786 |
| FunctionComponent | `src/runtime/FunctionComponent.ts` | [phase2-04-function-component.md](./phase2-04-function-component.md) | `mount`, `update`, `unmount`, `onCommit` | 완료 | c003384, ec781ec |
| Hook 실행 환경 | `src/runtime/hookRuntime.ts` | [phase2-05-hook-runtime.md](./phase2-05-hook-runtime.md) | `useHookSlot`, `depsChanged` | 완료 | bddd495, 092084c |
| useState | `src/runtime/hooks/useState.ts`, `scheduler.ts` | [phase2-06-use-state.md](./phase2-06-use-state.md) | `useState` | 완료 | 48edc25, b8a5e32 |
| useEffect | `src/runtime/hooks/useEffect.ts` | [phase2-07-use-effect.md](./phase2-07-use-effect.md) | `useEffect` | 완료 | a093a2c, 4523008 |
| useMemo | `src/runtime/hooks/useMemo.ts`, `src/runtime/index.ts` | [phase2-08-use-memo.md](./phase2-08-use-memo.md) | `useMemo` | 완료 | 6854bf2, 227135c |
| Todo 데모 | `phase2/` | [phase2-09-demo-page.md](./phase2-09-demo-page.md) | `App`, `createDebugPanel` | 완료 | 5323f7f, d362ea6 |
| 계측 훅 | `src/runtime/instrument.ts` (+ FunctionComponent 호출 3곳) | [decisions.md](./decisions.md) D-A02·03 | `setInstrumentation` | 완료 | 작업 A |
| 히트맵 탐색기·측정 도구 | `lab/` | [README](../README.md), [decisions.md](./decisions.md) | `createEngine`, `startTransition`, `createMetrics`, `SCENARIOS` | 완료 | 작업 A |

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

### StateHistory

- `snapshots` 배열과 `cursor`로 관리한다. 동결된 VNode를 복사 없이 참조로 저장한다.
- `push`는 `cursor` 뒤 기록을 버리고 끝에 추가한다. `back`/`forward`는 끝에 닿으면 상태를 바꾸지 않고 `null`을 돌려준다.
- 비어 있으면 `current`는 `null`, `position`은 `{index: 0, total: 0}`이다.
- 저장 개수 제한 없음, `goTo`는 후속. 빈 Patch 시 저장 안 함은 컨트롤러가 처리한다.

### 검증 페이지

- `npm run dev`(Vite)로 실행한다. `file://`로는 ES Module이 로드되지 않는다.
- 로드: `fromDom` → `mount`로 정규화 → `serialize` 결과를 테스트 영역에 → `history.push(v0)`.
- Patch: `fromHtml`이 `ok: false`면 오류만 표시. 빈 Patch면 "변경 사항 없음"과 함께 테스트 영역을 정리된 코드로 맞춘다. 성공하면 기록에 넣고 정리된 코드로 덮어쓴다.
- 뒤로/앞으로: 테스트 영역이 `serialize(current)`와 다르면 `confirm`. 이동도 `diff` → `applyPatches`로 반영한다.
- `applyPatches`가 `ok: false`이거나 예외를 던지면 `mount`로 다시 그리고 경고를 띄운다 (AP-02, AP-03 대응).
- 하이라이트는 `Element.animate`라 DOM 속성을 바꾸지 않는다. 단축키는 넣지 않았다(한글 조합 리스크 회피).

### Phase 2 런타임

- `h(type, props, ...children)`: children은 펼치고 null·불리언·빈 문자열은 버리며 인접 텍스트를 합친다. 요소 key는 `data-key`에도 넣는다. 함수 props는 `on*`일 때만 남긴다.
- 이벤트: 요소마다 WeakMap 이벤트 표를 두고 종류별 리스너는 1회만 등록한다. 렌더링마다 표의 함수만 바꾼다. `value`는 다를 때만 property에 넣어 커서를 지킨다.
- `resolve`: 자식 컴포넌트를 동결된 props로 실행하고 결과를 펼친다. 단일 요소 결과에 key를 옮긴다. 중첩 1000단계 초과 시 오류.
- `FunctionComponent`: 렌더링 오류면 이전 화면 유지 + 콘솔. Hook 개수가 바뀌면 오류. 실패한 렌더링의 새 칸·effect는 버린다.
- Hook 규칙 위반(렌더링 밖, 자식 컴포넌트, 순서 변경)은 오류. `depsChanged`는 `Object.is` 비교.
- `useState`: setState는 칸마다 1개, 같은 값이면 무시, 렌더링 중 호출은 오류, unmount 후 무시. 업데이트는 `queueMicrotask`로 묶는다.
- `useEffect`: 반영 직후 동기 실행(`useLayoutEffect` 시점). 정리 → 실행 → deps 저장. 연속 100회 넘는 업데이트는 중단.
- `useMemo`: 렌더링 중 계산, deps 같으면 이전 값.

### Todo 데모 (`/phase2/`)

- App에 Hook 7개(state 3, memo 2, effect 2), 자식 6개는 props만 받는다.
- 추가: 버튼 또는 Enter(한글 조합 중 Enter 무시). id는 현재 최대 id + 1.
- 디버그 패널: 렌더링 횟수, Hook 칸(memo ⟳ 재계산, effect ▶ 실행 표시), 마지막 Patch(이벤트 교체는 건수로 묶음).

## 5. 테스트


`npm run test:run` 기준 24개 파일, 273개 통과. `npm run build`(세 페이지) 성공. `npm run typecheck` 오류 없음.

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
| `state/history.test.ts` | 기획서 7장 순서, 빈 기록, 참조 동일성, 동결, push 100회 |
| `app/controller.test.ts` | `index.html`을 올려 9장 시나리오 1~9, MutationObserver 4건, 실패 시 재마운트, 로그 형식 |
| `vnode-to-dom/events.test.ts` | 이벤트 등록 1회, 함수 교체·삭제, 커서 유지, serialize 제외 |
| `runtime/h.test.ts` | h 기획서 6·7장, 정리 경계 |
| `runtime/resolve.test.ts` | 펼치기, key 이어받기, 텍스트 병합, 동결, 깊이 한도 |
| `runtime/FunctionComponent.test.ts` | mount/update/unmount, 오류 시 화면 유지, 재마운트 복구 |
| `runtime/hookRuntime.test.ts` | depsChanged 표, Hook 규칙 오류, 컨텍스트 복구, 인스턴스 분리 |
| `runtime/hooks/useState.test.ts` | Counter, 묶음 렌더링, 함수형 업데이트, 렌더링 중·unmount 후 |
| `runtime/hooks/useEffect.test.ts` | 실행 순서, 정리, 오류 격리, 무한 렌더링 중단, 실패 렌더링 |
| `runtime/hooks/useMemo.test.ts` | 재계산 조건, 같은 객체 반환, 세 Hook 칸 |
| `phase2/src/App.test.ts` | 데모 시나리오 1~8, Hook 7칸, DOM 재사용, 디버그 패널 |
| `setup.test.ts` | jsdom 동작 확인 |
| `runtime/instrument.test.ts` | 계측 훅 미등록 시 무동작, 호출 순서·patch 수, 훅 오류 격리 |
| `lab/lab.test.js` | percentile, 같은 시드 → 같은 데이터, burn 단조성, URL 파라미터 |

## 6. 주요 결정

- 보안 필터는 실제 영역 샘플에도 적용한다. 그래서 샘플의 이벤트 속성도 사라진다.
- 네임스페이스는 태그와 부모로 추론하고 VNode에 저장하지 않는다.
- 들여쓰기는 2칸이다.
- key 기반 diff는 뒤로 미룬다. 지금은 인덱스 기반이다.
- 경로 불일치 시 다시 그리기, 변경 하이라이트는 컨트롤러가 맡는다.
- State History는 저장 개수를 제한하지 않는다. Patch가 빈 배열이면 저장하지 않는다(컨트롤러).
- 테스트 영역을 수정만 하고 뒤로가기를 누르면 `confirm`으로 묻는다.
- 검증 페이지는 TS + Vite로 빌드한다(JSDoc 방식 아님). Patch 후 테스트 영역은 정리된 코드로 덮어쓴다.
- Phase 2 기획서 결정 항목은 현재 안을 따랐다: `style`은 문자열만, `class` 그대로, 이벤트 표는 WeakMap, 렌더링 오류는 화면 유지 + 콘솔, 오류 메시지 한국어, `queueMicrotask` 예약, effect는 반영 직후, `useCallback` 없음, 데모는 별도 `phase2/` 페이지.
- `EventHandler`/`PropValue` 타입은 core(`html-to-vnode/types.ts`)에 두고 runtime이 다시 내보낸다. core가 runtime에 의존하지 않게 하기 위해서다.

## 7. 우선 처리할 리스크

상세는 [`risk_issue/README.md`](../risk_issue/README.md).

1. FD-01 / AP-03: Patch 외 DOM 변경으로 DOM·VNode 대응이 깨지는 문제. 컨트롤러가 로드 시 정규화 mount, 실패 시 재mount로 대응했다.
2. HV-01: SVG `<animate>`/`<set>`로 `javascript:` 필터 우회 가능.
3. AP-01: 사용자가 입력한 textarea는 TEXT Patch로 값이 안 바뀜. (AP-02는 재mount로 해결)
4. HV-02 / CD-04: 깊은 중첩에서 스택 오버플로.
5. HV-03: 인라인 요소 사이 줄바꿈이 사라져 `A B`가 `AB`로 보임.
6. RT-02 / RT-03: 렌더링 실패·무한 렌더링 중단 후 상태 값이 화면보다 앞섬. `setState` 값을 렌더링 성공 시 확정하면 해결.
7. EV-01: 제어 입력에서 상태가 그대로면 사용자 입력이 DOM에 남음.
8. RT-01: 목록 중간 삭제 시 포커스가 다른 항목으로 넘어감 (key 기반 diff 필요).

## 8. 다음 작업

0. 작업 A 결과(stack, cellCost=0, S2 키 입력당 렌더+커밋 평균): 2k 8.8ms · 5k 17.4ms · 10k 33.2ms · 20k 66.7ms. 10k에서 50ms를 넘지 않는다. Fiber 엔진 연결 전에 기준 조건(셀 수, cellCost)을 정해야 한다.

1. PR #2(`feat/virtual-dom-vnode` → `develop`) 병합 후 Phase 2 PR 생성.
2. RT-02/RT-03, EV-01 대응.
3. key 기반 diff (RT-01, DF-02, AP-04).

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
| d5ef8ca | 진행 현황 문서 |
| b05f2c3 / 36f9c24 | StateHistory 기획서 / 구현 |
| d4aedb5 | 진행 현황 갱신 (StateHistory) |
| 4bb728b / ae205f6 | 검증 페이지 기획서 / 구현 |
| c64630b | 진행 현황 갱신 (검증 페이지) — 여기까지 PR #2 |
| 4fb26e7 / 6565504 | h() 기획서 / 구현 |
| c69b87b / d2e4988 | 이벤트 props 기획서 / 구현 |
| db204ff / 5061786 | resolve 기획서 / 구현 |
| c003384 / ec781ec | FunctionComponent 기획서 / 구현 |
| bddd495 / 092084c | Hook 실행 환경 기획서 / 구현 |
| 48edc25 / b8a5e32 | useState 기획서 / 구현 |
| a093a2c / 4523008 | useEffect 기획서 / 구현 |
| 6854bf2 / 227135c | useMemo 기획서 / 구현 |
| 5323f7f / d362ea6 | Todo 데모 기획서 / 구현 |

`feat/virtual-dom-vnode`는 `c64630b`까지(PR #2), `feat/phase2-components-hooks`는 최신 커밋까지 원격에 있다. Phase 2 리스크는 GitHub 이슈 #12~#20(마일스톤 Phase 2 구현, 프로젝트 보드 "Phase 2 구현" 뷰)으로 등록했다.
