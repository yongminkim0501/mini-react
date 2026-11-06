import { createWarning } from './convert';
import { createResult, fromDom } from './fromDom';
import { MAX_INPUT_LENGTH, checkSize, parseToFragment } from './parse';
import type { FromHtmlResult } from './types';

export { fromDom } from './fromDom';
export { readSource } from './parse';
export { ROOT_TAG } from './types';
export type * from './types';

/** 테스트 영역의 HTML 문자열을 정규화·동결된 VNode 트리로 바꾼다. 예외는 던지지 않는다. */
export function fromHtml(html: string): FromHtmlResult {
  if (!checkSize(html)) {
    // 빈 결과만 돌려주면 "전부 지웠다"로 해석되므로 ok: false로 Patch를 막는다.
    return createResult(
      [],
      [createWarning('INPUT_TOO_LARGE', [], `입력 ${html.length}자, 최대 ${MAX_INPUT_LENGTH}자`)],
    );
  }

  return fromDom(parseToFragment(html));
}
