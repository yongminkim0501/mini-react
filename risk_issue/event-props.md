# 이벤트 props 리스크·이슈

관련 코드: `src/core/vnode-to-dom/events.ts`, `src/core/patch/commit.ts`, `src/core/patch/formProps.ts` · 기획서: [docs/phase2-02-event-props.md](../docs/phase2-02-event-props.md)

## EV-01

**제어 입력에서 상태가 그대로면 사용자 입력이 DOM에 남음** · 중간 · 확인됨

- **GitHub 이슈:** #12 · 마일스톤 Phase 2 구현

- **현상:** 입력칸·체크박스는 사용자가 조작하면 브라우저가 먼저 화면 값(property)을 바꾼다. 이벤트 함수가 값을 거부해서 `setState`를 부르지 않거나 같은 값을 넣으면, `useState`는 같은 값이라 렌더링하지 않고 DOM은 사용자가 바꾼 값으로 남는다. 재현 결과:
  - `value: v`, `onInput`에서 3글자 이상이면 무시 → `abc` 입력 후 `input.value`가 `abc`로 남음
  - `checked: false`, `onChange: () => {}` → 클릭 후 `checked`가 `true`로 남음
- **영향:** 상태(`hooks`)와 화면이 어긋난다. 글자 수 제한, 숫자만 입력, 체크 막기 같은 제어 입력 패턴이 동작하지 않는다. 데모는 모든 입력을 상태에 그대로 반영하므로 겉으로 드러나지 않는다.
- **대응안:** `input`·`change` 이벤트 처리 직후 현재 VNode의 `value`/`checked`와 DOM property를 비교해 되돌린다. 예: 대리 함수(`dispatch`)가 핸들러 호출 뒤 마이크로태스크로 렌더링이 예약되지 않았으면 마지막 VNode 값으로 property를 맞춘다. 컴포넌트 런타임과 이벤트 모듈 사이에 "마지막 값" 조회 경로가 필요하다.

## EV-02

**이벤트 이름 변환이 소문자화뿐이라 일부 이벤트가 연결되지 않음** · 낮음 · 확인됨

- **GitHub 이슈:** #13 · 마일스톤 Phase 2 구현

- **현상:** `toEventType`은 `on` 뒤를 소문자로 바꾸기만 한다. `onDoubleClick`은 `doubleclick`이 되어 실제 이벤트 `dblclick`에 연결되지 않는다(호출 0회 확인). `onClickCapture` 같은 캡처 단계 등록도 `clickcapture`라는 없는 이벤트가 된다.
- **영향:** React 이름에 익숙한 사용자가 쓰면 오류 없이 조용히 동작하지 않는다.
- **대응안:** 예외 이름 표(`DoubleClick → dblclick`)를 두고, `Capture` 접미사는 캡처 단계 리스너로 등록한다. 또는 지원 목록을 문서에 명시하고 모르는 이름은 개발 중 경고한다.

## EV-03

**렌더링마다 이벤트 함수 수만큼 PROPS Patch가 생김** · 낮음 · 기획 리스크

- **GitHub 이슈:** #14 · 마일스톤 Phase 2 구현

- **현상:** 컴포넌트가 렌더링마다 새 함수를 만들므로 diff가 이벤트를 가진 모든 요소에 `PROPS set: { onX: 새 함수 }`를 만든다. 버튼 2개와 텍스트 1개인 화면에서 숫자만 바뀌어도 Patch는 `PROPS, PROPS, TEXT` 3건이다. 데모는 Todo 3개 기준 한 번에 10건 정도의 이벤트 교체가 생긴다.
- **영향:** DOM 비용은 이벤트 표 값 교체뿐이라 작다. 다만 Patch 로그가 길어지고 "바뀐 부분만 반영"을 보여주기 어렵다.
- **완화:** 데모 디버그 패널이 이벤트 교체를 `이벤트 교체 n건`으로 묶어 표시한다.
- **대응안:** 필요하면 `useCallback`(또는 `useMemo(() => fn, deps)`)로 함수 정체성을 유지한다. 또는 diff가 이벤트 함수를 Patch 대신 별도 "이벤트 갱신" 목록으로 분리한다.
