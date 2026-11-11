import type { Patch, Path } from '../diff';

export interface ResolvedPatch {
  readonly patch: Patch;
  /** CREATE는 부모 요소, 그 외는 path의 노드 */
  readonly target: Node;
}

/** 컨테이너에서 경로의 인덱스를 따라 childNodes로 내려간다. 없으면 null. DOM은 읽기만 한다. */
export function resolvePath(container: Node, path: Path): Node | null {
  let node: Node = container;
  for (const index of path) {
    const child = node.childNodes[index];
    if (!child) return null;
    node = child;
  }
  return node;
}

/**
 * DOM을 건드리기 전에 모든 Patch의 대상을 찾아 둔다.
 * 하나라도 못 찾거나 종류가 맞지 않으면 DOM과 VNode가 어긋난 상태이므로 null.
 */
export function resolveAll(container: Element, patches: readonly Patch[]): ResolvedPatch[] | null {
  const resolved: ResolvedPatch[] = [];
  for (const patch of patches) {
    const target = resolveTarget(container, patch);
    if (!target) return null;
    resolved.push({ patch, target });
  }
  return resolved;
}

function resolveTarget(container: Element, patch: Patch): Node | null {
  if (patch.type === 'CREATE') {
    const parent = resolvePath(container, patch.parentPath);
    return parent instanceof Element ? parent : null;
  }

  // 빈 경로는 컨테이너 자신이다. 컨테이너는 VNode에 없으므로 수정 대상이 될 수 없다.
  if (patch.path.length === 0) return null;
  const node = resolvePath(container, patch.path);
  if (!node) return null;

  // 종류까지 확인해 어긋난 DOM을 엉뚱하게 수정하지 않는다.
  if (patch.type === 'TEXT') return node instanceof Text ? node : null;
  if (patch.type === 'PROPS') return node instanceof Element ? node : null;
  return node;
}
