# applyPatches 리스크·이슈

관련 코드: `src/core/patch/` · 기획서: [docs/apply-patches.md](../docs/apply-patches.md)

## AP-01

**사용자가 수정한 textarea는 TEXT Patch로 화면 값이 안 바뀜** · 중간 · 확인됨

- **현상:** `<textarea>`의 내용은 자식 텍스트 노드라 diff는 `PROPS`가 아니라 `TEXT`를 만든다. 사용자가 한 번 입력한 textarea는 dirty 상태라 텍스트 노드를 바꿔도 화면 값이 그대로다. `ok: true`, DOM은 `<textarea>b</textarea>`인데 `value`는 `"typed"`로 남는 것을 확인했다.
- **영향:** 실제 영역의 textarea가 VNode와 다르게 보인다. 테스트 영역 자체는 실제 영역 밖이라 해당 없다.
- **대응안:** `TEXT` 적용 시 부모가 `HTMLTextAreaElement`면 `parent.value = parent.defaultValue`로 맞춘다. `formProps.ts`에 함께 둔다.

## AP-02

**적용 단계 중간 예외 시 반쯤 바뀐 화면** · 중간 · 예상 → 해결됨

- **현상:** 찾기 단계는 모두 성공했는데 적용 단계에서 예외가 나면 앞의 Patch만 반영된 채 멈춘다. 예: 구형 브라우저의 `setAttribute` 속성 이름 검사(CD-05). `file` 입력의 `value`는 건너뛰도록 막아 두었다.
- **영향:** "반쯤 바뀐 화면이 남지 않는다"는 기획서 1단계의 보장이 적용 단계에는 없다.
- **대응안:** 컨트롤러가 `applyPatches`를 `try/catch`로 감싸고, 예외 시 기획서 9장 현재 안대로 새 VNode로 다시 `mount`해 복구한다.
- **해결:** 검증 페이지 컨트롤러(`src/app/controller.ts`)와 `FunctionComponent.update()`가 `applyPatches`를 `try/catch`로 감싸고, `ok: false`나 예외면 새 VNode로 다시 `mount`한다.

## AP-03

**정규화 마운트 없이 호출하면 오동작** · 높음 · 기획 리스크

- **현상:** 컨테이너 DOM과 이전 VNode가 1:1이 아니면 경로가 공백 노드를 가리킨다.
- **완화:** 찾기 단계에서 `TEXT`는 Text 노드, `PROPS`와 `CREATE` 부모는 Element인지 확인해 많은 경우 `ok: false`로 멈춘다. 같은 종류의 다른 노드를 가리키면(요소 ↔ 요소) 막지 못한다.
- **대응:** 로드 흐름에서 `mount`를 반드시 먼저 실행한다 (FD-01).

## AP-04

**key 기반 diff 도입 시 CREATE 위치** · 중간 · 기획 리스크

- **현상:** 지금은 `CREATE`를 항상 `appendChild`로 붙인다. `index`는 쓰지 않는다.
- **영향:** key 기반 diff가 목록 중간에 `CREATE`를 만들면 끝에 붙어 순서가 틀린다.
- **대응:** 찾기 단계에서 삽입 기준 노드(anchor)를 함께 확보하고 `insertBefore`로 붙인다.

## AP-05

**REPLACE/REMOVE 시 포커스와 화면 상태 유실** · 낮음 · 예상

- **현상:** 교체·삭제되는 서브트리 안에 포커스된 입력칸이 있으면 포커스와 입력 중인 값이 사라진다.
- **대응:** 데모 범위에서는 허용한다. Phase 2 컴포넌트 단계에서 key 기반 비교로 재사용 범위를 넓힌다.
