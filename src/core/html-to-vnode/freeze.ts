import type { VNode } from './types';

/**
 * 자식이 먼저 만들어지므로 생성 직후 동결하면 트리 전체가 고정된다.
 * props와 children 배열도 함께 동결한다.
 */
export function freezeNode<T extends VNode>(node: T): T {
  const target: VNode = node;
  if (target.kind === 'element') {
    Object.freeze(target.props);
    Object.freeze(target.children);
  }
  return Object.freeze(node);
}
