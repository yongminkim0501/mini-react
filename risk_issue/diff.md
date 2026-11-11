# diff 리스크·이슈

관련 코드: `src/core/diff/` · 기획서: [docs/diff.md](../docs/diff.md)

## DF-01

**이전 트리 기준 경로와 적용 순서** · 높음 · 기획 리스크 → 해결됨

- **현상:** 모든 Patch 경로는 이전 트리 기준이다. `REMOVE [0,1]` 다음에 `REMOVE [0,2]`를 순서대로 바로 적용하면 두 번째 경로가 이미 밀린 위치를 가리킨다.
- **대응:** `applyPatches`는 모든 대상 DOM 노드를 먼저 찾아 둔 뒤 적용한다. `CREATE`는 부모 노드를 먼저 찾아 두고 `appendChild`로 붙인다. 인덱스 기반 diff에서는 항상 끝에 붙기 때문이다.

- **해결:** `applyPatches`의 `resolveAll`이 모든 대상을 먼저 찾은 뒤 적용한다.

## DF-02

**리스트 앞쪽 삽입·삭제 시 Patch 증가** · 중간 · 기획 리스크

- **현상:** 기획서 7.2처럼 첫 항목을 지우면 뒤 항목들의 `PROPS`·`TEXT`가 줄줄이 생긴다. 결과 화면은 맞다.
- **영향:** 하위 요소의 DOM 노드가 다른 내용으로 재사용되므로 해당 노드의 화면 상태(포커스, 입력값, 스크롤)가 엉뚱한 항목에 남는다. FD-02와 겹친다.
- **대응:** 기획서 8장의 key 기반 비교. 중복 key 처리 규칙은 HV-04에서 정한다.

## DF-03

**SVG 안 CREATE/REPLACE의 네임스페이스** · 높음 · 예상 → 해결됨

- **현상:** `CREATE`/`REPLACE` Patch는 `node`만 담고 네임스페이스 정보는 없다.
- **영향:** `applyPatches`가 `createDom(node)`를 기본값으로 호출하면 SVG 안의 새 노드가 그려지지 않는다 (CD-01).
- **대응안:** `applyPatches`가 대상 부모 DOM의 `namespaceURI`, `localName`으로 네임스페이스를 계산해 넘긴다.

- **해결:** `applyPatches`가 부모 DOM 기준으로 네임스페이스를 계산한다.

## DF-04

**폼 요소의 `value`/`checked` PROPS** · 중간 · 예상 → 해결됨

- **현상:** `PROPS`는 속성 변경만 표현한다.
- **영향:** 사용자가 수정한 입력칸에는 `setAttribute('value')`가 화면에 반영되지 않는다 (CD-03).
- **대응안:** `applyPatches`에서 `value`, `checked`, `selected`는 property도 함께 설정한다.

- **해결:** `applyPatches`의 `syncFormProp`. textarea는 AP-01 참고.

## DF-05

**Patch가 VNode를 참조로 공유** · 낮음 · 예상

- **현상:** `CREATE`/`REPLACE`의 `node`는 새 VNode 트리의 하위 객체를 복사 없이 가리킨다. `PROPS`의 `set` 객체는 프로토타입 없는 객체다.
- **영향:** 동결되어 있어 수정은 불가능하다. `set`에 `hasOwnProperty`를 호출하면 오류가 난다 (HV-08).
- **대응:** `Object.hasOwn`, `Object.entries`만 쓴다.
