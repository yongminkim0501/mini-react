import { ROOT_TAG } from '../core/html-to-vnode';
import type { VElement, VNode, VText } from '../core/html-to-vnode';
import { setRenderingChild } from './hookRuntime';
import { normalizeChildren } from './normalize';
import type { Child, HNode, VComponent } from './types';

/** 컴포넌트가 자기 자신을 반환하는 무한 재귀를 막는 중첩 한도. */
export const MAX_COMPONENT_DEPTH = 1000;

/**
 * 루트 컴포넌트의 결과를 요소·텍스트만 남은 #root VNode로 바꾼다.
 * 출력은 Phase 1 VNode와 같은 구조라서 Phase 1 diff를 그대로 쓸 수 있다.
 */
export function resolve(result: Child): VElement {
  const children = resolveList(normalizeChildren([result]), 0);
  return freezeElement(ROOT_TAG, Object.freeze(Object.create(null)), children, undefined);
}

/** 노드 하나를 펼친다. 컴포넌트는 여러 노드나 0개를 반환할 수 있으므로 배열을 돌려준다. */
export function resolveNode(node: HNode, depth = 0): VNode[] {
  switch (node.kind) {
    case 'text':
      return [node];
    case 'element':
      return [freezeElement(node.tag, node.props, resolveList(node.children, depth), node.key)];
    case 'component': {
      if (depth >= MAX_COMPONENT_DEPTH) {
        throw new Error(`컴포넌트 중첩이 ${MAX_COMPONENT_DEPTH}단계를 넘었습니다. 컴포넌트가 자기 자신을 반환하는지 확인하세요.`);
      }
      const resolved = resolveList(renderChild(node), depth + 1);
      return inheritKey(resolved, node.key);
    }
  }
}

/**
 * 자식 컴포넌트를 실행하고 결과를 h()의 children 규칙으로 정리한다.
 * 실행하는 동안 "자식 렌더링 중"을 켜서 Hook 호출을 막는다. 오류가 나도 표시는 되돌린다.
 */
export function renderChild(component: VComponent<any>): HNode[] {
  const previous = setRenderingChild(true);
  let output: Child;
  try {
    output = component.type(component.props);
  } finally {
    setRenderingChild(previous);
  }
  return normalizeChildren([output]);
}

/** 자식 목록을 펼친 뒤, 컴포넌트가 반환한 텍스트끼리 붙은 경우 하나로 합친다. */
function resolveList(nodes: readonly HNode[], depth: number): VNode[] {
  const result: VNode[] = [];
  for (const node of nodes) {
    for (const resolved of resolveNode(node, depth)) {
      const last = result[result.length - 1];
      if (resolved.kind === 'text' && last?.kind === 'text') {
        result[result.length - 1] = Object.freeze<VText>({ kind: 'text', text: last.text + resolved.text });
      } else {
        result.push(resolved);
      }
    }
  }
  return result;
}

/**
 * key는 컴포넌트에 붙이지만 diff가 보는 것은 펼쳐진 요소다.
 * 결과가 요소 하나일 때만 그 요소에 key와 data-key를 옮긴다. 여러 노드면 key를 무시한다.
 */
function inheritKey(nodes: VNode[], key: string | undefined): VNode[] {
  const only = nodes[0];
  if (key === undefined || nodes.length !== 1 || only?.kind !== 'element') return nodes;
  const props = Object.freeze(Object.assign(Object.create(null), only.props, { 'data-key': key }));
  return [freezeElement(only.tag, props, only.children, key)];
}

function freezeElement(
  tag: string,
  props: VElement['props'],
  children: readonly VNode[],
  key: string | undefined,
): VElement {
  const frozenChildren = Object.freeze([...children]);
  const element: VElement =
    key === undefined
      ? { kind: 'element', tag, props, children: frozenChildren }
      : { kind: 'element', tag, props, children: frozenChildren, key };
  return Object.freeze(element);
}
