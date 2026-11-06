import { convertChildren, createWarning } from './convert';
import { freezeNode } from './freeze';
import { MAX_INPUT_LENGTH, checkSize, parseToFragment } from './parse';
import { ROOT_TAG } from './types';
import type { ConvertWarning, FromHtmlResult, VElement, VNode } from './types';

export { readSource } from './parse';
export { ROOT_TAG } from './types';
export type * from './types';

function createRoot(children: VNode[]): VElement {
  return freezeNode({ kind: 'element', tag: ROOT_TAG, props: Object.create(null), children });
}

function finish(vnode: VElement, warnings: ConvertWarning[]): FromHtmlResult {
  return Object.freeze({
    vnode,
    warnings: Object.freeze(warnings),
    ok: !warnings.some((warning) => warning.severity === 'error'),
  });
}

/** 테스트 영역의 HTML 문자열을 정규화·동결된 VNode 트리로 바꾼다. 예외는 던지지 않는다. */
export function fromHtml(html: string): FromHtmlResult {
  if (!checkSize(html)) {
    // 빈 결과만 돌려주면 "전부 지웠다"로 해석되므로 ok: false로 Patch를 막는다.
    return finish(createRoot([]), [
      createWarning('INPUT_TOO_LARGE', [], `입력 ${html.length}자, 최대 ${MAX_INPUT_LENGTH}자`),
    ]);
  }

  const warnings: ConvertWarning[] = [];
  const children = convertChildren(parseToFragment(html), [], warnings, false);
  return finish(createRoot(children), warnings);
}
