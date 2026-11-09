# 리스크·이슈 목록

작성일: 2026-11-06

지금까지 구현한 모듈(`fromHtml`, `fromDom`, `createDom`/`mount`, `serialize`, `diff`, `applyPatches`)에서 깨지거나 문제가 예상되는 부분을 모은 목록이다. 항목별 상세는 모듈별 파일에 있다.

## 표기

| 항목 | 값 |
|------|----|
| 심각도 | **높음**: 보안 또는 다음 단계(diff/patch) 진행을 막음 · **중간**: 특정 입력에서 결과가 틀림 · **낮음**: 드문 입력, UX, 문서화로 충분 |
| 상태 | **확인됨**: 재현 코드로 직접 확인 · **예상**: 코드·명세 분석으로 예상 · **기획 리스크**: 기획서에 이미 적힌 항목 · **해결됨**: 이후 모듈에서 대응 완료 |

## 전체 목록

| ID | 모듈 | 심각도 | 상태 | 요약 |
|----|------|--------|------|------|
| [HV-01](./html-to-vnode.md#hv-01) | fromHtml | 높음 | 예상 | SVG `<animate>`/`<set>`로 `javascript:` 링크 필터 우회 가능 |
| [HV-02](./html-to-vnode.md#hv-02) | fromHtml | 중간 | 확인됨 | 깊게 중첩된 입력에서 스택 오버플로로 예외 발생 ("예외 없음" 약속 위반) |
| [HV-03](./html-to-vnode.md#hv-03) | fromHtml | 중간 | 확인됨 | 인라인 요소 사이 줄바꿈 공백이 사라져 `A B`가 `AB`로 보임 |
| [HV-04](./html-to-vnode.md#hv-04) | fromHtml | 중간 | 예상 | 중복 `data-key`는 경고만 남김. diff 동작은 미정 |
| [HV-05](./html-to-vnode.md#hv-05) | fromHtml | 낮음 | 예상 | `style` 속성, 외부 URL은 허용되어 화면 덮기·외부 요청 가능 |
| [HV-06](./html-to-vnode.md#hv-06) | fromHtml | 낮음 | 예상 | `id`/`name` 속성으로 전역 변수 덮어쓰기(DOM clobbering) |
| [HV-07](./html-to-vnode.md#hv-07) | fromHtml | 낮음 | 예상 | 차단 요소 경고의 `path`가 근사값 |
| [HV-08](./html-to-vnode.md#hv-08) | fromHtml | 낮음 | 예상 | `props`가 프로토타입 없는 객체라 `hasOwnProperty` 호출 시 오류 |
| [HV-09](./html-to-vnode.md#hv-09) | fromHtml | 낮음 | 기획 리스크 | CSS `white-space: pre` 요소의 공백이 정리됨 |
| [HV-10](./html-to-vnode.md#hv-10) | fromHtml | 낮음 | 기획 리스크 | 브라우저 파서 자동 보정으로 작성한 코드와 구조가 다름 |
| [HV-11](./html-to-vnode.md#hv-11) | fromHtml | 중간 | 기획 리스크 | 단축키 Patch 시 한글 IME 조합 중인 글자 누락 (미구현) |
| [FD-01](./from-dom.md#fd-01) | fromDom | 높음 | 예상 | 마운트 후 Patch 외의 DOM 변경이 생기면 DOM·VNode 1:1 대응이 깨짐 |
| [FD-02](./from-dom.md#fd-02) | fromDom | 중간 | 예상 | 입력값·체크 상태 등 화면 상태가 VNode에 없어 Patch 시 유실 가능 |
| [FD-03](./from-dom.md#fd-03) | fromDom | 중간 | 기획 리스크 | 실제 영역 샘플의 이벤트 속성도 보안 필터로 제거됨 |
| [FD-04](./from-dom.md#fd-04) | fromDom | 낮음 | 기획 리스크 | 최상위 `<tr>`, `<td>` 샘플은 사라짐 |
| [FD-05](./from-dom.md#fd-05) | fromDom | 낮음 | 예상 | Shadow DOM·커스텀 요소 내부는 표현되지 않음 |
| [CD-01](./create-dom.md#cd-01) | createDom | 높음 | 해결됨 (applyPatches) | SVG 하위 노드를 단독으로 만들면 HTML 요소가 되어 그려지지 않음 |
| [CD-02](./create-dom.md#cd-02) | createDom | 높음 | 기획 리스크 | 손으로 만든 VNode는 보안 필터를 거치지 않음 |
| [CD-03](./create-dom.md#cd-03) | createDom | 중간 | 해결됨 (applyPatches) | 사용자가 수정한 폼은 `setAttribute('value')`로 화면이 안 바뀜 |
| [CD-04](./create-dom.md#cd-04) | createDom | 중간 | 예상 | 깊은 트리에서 재귀 스택 오버플로 |
| [CD-05](./create-dom.md#cd-05) | createDom | 낮음 | 예상 | 구형 브라우저에서 특이한 속성 이름으로 `setAttribute` 예외 |
| [CD-06](./create-dom.md#cd-06) | createDom | 낮음 | 예상 | `xlink:href`를 네임스페이스 없이 설정 |
| [CD-07](./create-dom.md#cd-07) | createDom | 낮음 | 기획 리스크 | DocumentFragment는 한 번 붙이면 비워짐 |
| [SR-01](./serialize.md#sr-01) | serialize | 중간 | 확인됨 | `<plaintext>` 왕복 깨짐 |
| [SR-02](./serialize.md#sr-02) | serialize | 낮음 | 확인됨 | `<xmp>`, `<noembed>` 등 raw text 요소 왕복 깨짐 |
| [SR-03](./serialize.md#sr-03) | serialize | 낮음 | 예상 | 주석이 테스트 영역에서 사라짐 |
| [SR-04](./serialize.md#sr-04) | serialize | 낮음 | 기획 리스크 | 텍스트 섞인 긴 요소가 한 줄로 길게 출력됨 |
| [SR-05](./serialize.md#sr-05) | serialize | 중간 | 기획 리스크 | 출력 규칙과 fromHtml 정리 규칙이 어긋나면 왕복 깨짐 |
| [DF-01](./diff.md#df-01) | diff | 높음 | 해결됨 (applyPatches) | 경로가 이전 트리 기준이라 순서대로 바로 적용하면 인덱스가 밀림 |
| [DF-02](./diff.md#df-02) | diff | 중간 | 기획 리스크 | 리스트 앞쪽 삽입·삭제 시 Patch 증가, 화면 상태가 엉뚱한 항목에 남음 |
| [DF-03](./diff.md#df-03) | diff | 높음 | 해결됨 (applyPatches) | SVG 안 CREATE/REPLACE에 네임스페이스 정보 없음 |
| [DF-04](./diff.md#df-04) | diff | 중간 | 해결됨 (applyPatches) | 폼 요소 `value`/`checked`는 속성 변경만으로 화면에 반영 안 됨 |
| [DF-05](./diff.md#df-05) | diff | 낮음 | 예상 | Patch가 VNode·프로토타입 없는 객체를 참조로 공유 |
| [AP-01](./apply-patches.md#ap-01) | applyPatches | 중간 | 확인됨 | 사용자가 수정한 textarea는 TEXT Patch로 화면 값이 안 바뀜 |
| [AP-02](./apply-patches.md#ap-02) | applyPatches | 중간 | 예상 | 적용 단계 중간 예외 시 반쯤 바뀐 화면이 남음 |
| [AP-03](./apply-patches.md#ap-03) | applyPatches | 높음 | 기획 리스크 | 정규화 마운트 없이 호출하면 오동작 (종류 검사로 일부만 차단) |
| [AP-04](./apply-patches.md#ap-04) | applyPatches | 중간 | 기획 리스크 | key 기반 diff 도입 시 CREATE를 중간에 넣을 anchor 필요 |
| [AP-05](./apply-patches.md#ap-05) | applyPatches | 낮음 | 예상 | REPLACE/REMOVE 시 포커스·입력 상태 유실 |
| [PJ-01](./project.md#pj-01) | 프로젝트 | 높음 | 예상 | 페이지 UI·State History·컨트롤러 미구현으로 Phase 1 흐름 미완성 |
| [PJ-02](./project.md#pj-02) | 프로젝트 | 낮음 | 예상 | 테스트가 jsdom 기반이라 실제 브라우저 동작과 다를 수 있음 |

## 우선 처리 권장

1. **FD-01, AP-03**: 실제 영역에 쓰는 코드는 `mount`와 `applyPatches`뿐이라는 규칙을 컨트롤러에 반영한다.
2. **HV-01**: 보안 항목. 차단 목록에 `animate`, `set`, `animateMotion`, `animateTransform`을 추가하면 끝난다.
3. **AP-01, AP-02**: textarea 동기화 한 줄 추가, 컨트롤러의 예외 시 재마운트 복구.
4. **HV-02, CD-04**: 깊이 제한을 정하고 초과 시 `ok: false`로 처리한다.
5. **HV-03**: 실제 영역과 테스트 영역의 화면이 달라 보이는 문제라 사용자가 바로 눈치챈다. 규칙 변경 여부를 결정해야 한다.

해결된 항목(CD-01, CD-03, DF-01, DF-03, DF-04)은 기록을 위해 목록에 남겨 둔다.
