# serialize (VNode → HTML 문자열) 리스크·이슈

관련 코드: `src/core/vnode-to-html/` · 기획서: [docs/serialize.md](../docs/serialize.md)

## SR-01

**`<plaintext>` 왕복 깨짐** · 중간 · 확인됨

- **현상:** `<plaintext>abc` → serialize → `<plaintext>abc</plaintext>`. 파서는 `<plaintext>` 이후 모든 글자를 텍스트로 읽으므로 다시 변환하면 텍스트가 `abc</plaintext>`가 된다.
- **영향:** 왕복 불변식이 깨진다. `<plaintext>` 뒤에 오는 형제 요소도 모두 텍스트로 바뀐다. 테스트 영역에서 Patch를 반복할 때마다 텍스트가 계속 길어진다.
- **대응안:** fromHtml 차단 목록에 `plaintext`를 추가한다. 사용 가치가 없는 폐기된 태그다.

## SR-02

**raw text 요소(`xmp`, `noembed`, `noframes`) 왕복 깨짐** · 낮음 · 확인됨

- **현상:** 이 요소들 안에서는 엔티티가 해석되지 않는다. `<xmp>a<b</xmp>` → serialize → `<xmp>a&lt;b</xmp>` → 다시 변환하면 텍스트가 `a&lt;b`가 된다. `noembed`도 같은 결과를 확인했다.
- **대응안:** 차단 목록에 추가하거나, serialize에서 이 요소의 내용은 이스케이프하지 않는다.

## SR-03

**주석이 테스트 영역에서 사라짐** · 낮음 · 예상

- **현상:** VNode에 주석이 없으므로 Patch, 뒤로가기, 앞으로가기 후 테스트 영역을 serialize로 다시 채우면 사용자가 쓴 주석이 사라진다.
- **영향:** 기획서 9.1의 미정 항목("Patch 후 테스트 영역을 정리된 코드로 다시 채울지")을 "채운다"로 정하면 사용자가 바로 체감한다.
- **대응안:** Patch 직후에는 테스트 영역을 다시 채우지 않고, 뒤로가기/앞으로가기 때만 serialize 결과로 채운다.

## SR-04

**텍스트 섞인 긴 요소의 한 줄 출력** · 낮음 · 기획 리스크

- **현상:** 텍스트 자식이 있으면 하위 전체가 한 줄로 출력된다. `<div><p>a</p> <p>b</p></div>`처럼 블록 사이에 공백 한 칸만 있어도 `div` 전체가 한 줄이 된다.
- **대응:** textarea 자동 줄바꿈(`wrap`)으로 보완한다.

## SR-05

**출력 규칙과 fromHtml 정리 규칙의 결합** · 중간 · 기획 리스크

- **현상:** serialize의 블록/인라인 규칙은 fromHtml의 공백 정리 규칙을 전제로 한다. HV-03 대응처럼 한쪽 규칙만 바꾸면 왕복이 깨진다.
- **대응:** `src/core/vnode-to-html/roundtrip.test.ts`가 상시 검증한다. 규칙을 바꿀 때 이 테스트에 경계 입력을 추가한다.
