import { ROOT_TAG } from '../html-to-vnode';
import type { VNode } from '../html-to-vnode';
import { diffProps } from './diffProps';
import type { Patch, Path } from './types';

/**
 * 이전 VNode와 새 VNode를 비교해 Patch 배열을 만든다. DOM은 건드리지 않는다.
 * 모든 경로는 이전 트리 기준이고, 깊이 우선(부모 먼저, 자식은 인덱스 순)으로 담는다.
 */
export function diff(oldVNode: VNode, newVNode: VNode): Patch[] {
  const patches: Patch[] = [];
  if (
    oldVNode.kind === 'element' &&
    newVNode.kind === 'element' &&
    oldVNode.tag === ROOT_TAG &&
    newVNode.tag === ROOT_TAG
  ) {
    // 같은 객체면 diffChildren 안에서 바로 끝난다. #root의 props는 항상 비어 있다.
    if (oldVNode !== newVNode) diffChildren(oldVNode.children, newVNode.children, [], patches);
  } else {
    diffNode(oldVNode, newVNode, [], patches);
  }
  return patches;
}

export function diffNode(oldNode: VNode, newNode: VNode, path: Path, patches: Patch[]): void {
  // 동결된 VNode는 같은 객체면 내용도 같으므로 하위를 비교하지 않는다.
  if (oldNode === newNode) return;

  // [1] 종류가 다르면 하위 트리 전체가 다르다고 본다.
  if (oldNode.kind !== newNode.kind) {
    patches.push({ type: 'REPLACE', path, node: newNode });
    return;
  }

  // [2] 텍스트 노드는 새로 만들지 않고 내용만 바꾼다.
  if (oldNode.kind === 'text' && newNode.kind === 'text') {
    if (oldNode.text !== newNode.text) patches.push({ type: 'TEXT', path, text: newNode.text });
    return;
  }

  if (oldNode.kind !== 'element' || newNode.kind !== 'element') return;

  // [3] 태그가 다르면 어차피 요소를 새로 만들어야 한다.
  if (oldNode.tag !== newNode.tag) {
    patches.push({ type: 'REPLACE', path, node: newNode });
    return;
  }

  // [4] 속성
  const propsDiff = diffProps(oldNode.props, newNode.props);
  if (propsDiff) patches.push({ type: 'PROPS', path, ...propsDiff });

  // [5] 자식
  diffChildren(oldNode.children, newNode.children, path, patches);
}

/**
 * 같은 인덱스의 자식끼리 비교한다.
 * 인덱스 기반이므로 CREATE와 REMOVE는 항상 자식 목록의 끝에서만 생긴다.
 */
export function diffChildren(
  oldChildren: readonly VNode[],
  newChildren: readonly VNode[],
  parentPath: Path,
  patches: Patch[],
): void {
  const length = Math.max(oldChildren.length, newChildren.length);
  for (let index = 0; index < length; index++) {
    const oldChild = oldChildren[index];
    const newChild = newChildren[index];
    if (oldChild === undefined && newChild !== undefined) {
      patches.push({ type: 'CREATE', parentPath, index, node: newChild });
    } else if (oldChild !== undefined && newChild === undefined) {
      patches.push({ type: 'REMOVE', path: [...parentPath, index] });
    } else if (oldChild !== undefined && newChild !== undefined) {
      diffNode(oldChild, newChild, [...parentPath, index], patches);
    }
  }
}
