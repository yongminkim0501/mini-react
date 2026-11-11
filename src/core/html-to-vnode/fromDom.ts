import { convertChildren } from './convert';
import { freezeNode } from './freeze';
import { ROOT_TAG } from './types';
import type { ConvertWarning, FromHtmlResult, VNode } from './types';

/** 루트 VNode와 경고를 동결된 결과 객체로 묶는다. fromHtml의 조기 종료에도 쓴다. */
export function createResult(children: VNode[], warnings: ConvertWarning[]): FromHtmlResult {
  const vnode = freezeNode({
    kind: 'element',
    tag: ROOT_TAG,
    props: Object.create(null),
    children,
  });
  return Object.freeze({
    vnode,
    warnings: Object.freeze(warnings),
    ok: !warnings.some((warning) => warning.severity === 'error'),
  });
}

/**
 * 렌더링된 DOM을 읽어 VNode 트리로 바꾼다. DOM은 읽기만 하고 수정하지 않는다.
 * 컨테이너 자신(id, class 등)은 페이지 UI이므로 넣지 않고, 자식만 #root 아래에 둔다.
 * DocumentFragment(template.content)는 그대로 루트로 쓴다.
 */
export function fromDom(container: Element | DocumentFragment): FromHtmlResult {
  const warnings: ConvertWarning[] = [];
  const children = convertChildren(container, [], warnings, false);
  return createResult(children, warnings);
}
