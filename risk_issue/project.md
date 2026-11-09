# 프로젝트 전반 리스크·이슈

## PJ-01

**Phase 1 흐름 미완성** · 높음 · 예상 → 해결됨

- **현상:** 변환 모듈 4개(`fromHtml`, `fromDom`, `createDom`/`mount`, `serialize`)와 `diff`, `applyPatches`까지 있다. 실제 영역·테스트 영역·Patch/뒤로가기/앞으로가기 버튼 UI, State History, 컨트롤러가 없다. `src/main.ts`는 자리 표시 코드다.
- **영향:** 로드 흐름(fromDom → mount → serialize)과 Patch 흐름(fromHtml → diff → applyPatches)은 테스트로만 검증되었고 실제 페이지에서 동작하지 않는다.
- **다음 작업:** State History와 컨트롤러(페이지 UI) 기획. FD-01, AP-02, AP-03, HV-11을 설계에 반영한다.
- **해결:** State History(`src/state/history.ts`)와 검증 페이지(`index.html`, `src/app/`)를 구현했다. 로드 시 정규화 mount, Patch 실패·예외 시 재mount로 FD-01·AP-02·AP-03에 대응했고, 단축키를 넣지 않아 HV-11은 해당 없다. Chrome에서 시나리오를 확인했다.

## PJ-02

**jsdom 기반 테스트의 한계** · 낮음 · 예상

- **현상:** 모든 DOM 테스트가 jsdom에서 돈다. jsdom은 이미지를 불러오지 않고, 레이아웃과 렌더링이 없으며, 파서 깊이 제한이 브라우저와 다르다.
- **영향:** `onerror` 미실행, SVG가 실제로 그려지는지, 폼 dirty 동작(CD-03), 깊이 제한(HV-02)은 실제 브라우저와 결과가 다를 수 있다.
- **대응안:** 페이지 UI가 생기면 브라우저에서 수동 확인 체크리스트를 돌린다. 필요하면 Vitest browser mode를 검토한다.
