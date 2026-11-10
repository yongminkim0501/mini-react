import { diffProps } from '../core/diff/diffProps';
import { childNamespace, elementNamespace, HTML_NAMESPACE } from '../core/vnode-to-dom/namespace';
import { normalizeChildren } from '../runtime/normalize';
import type { ElementProps, HElement, HNode } from '../runtime/types';
import { createHost } from './dom';
import { renderRoot } from './hooks';
import { Placement, Update } from './types';
import type { Expansion, FiberNode, RenderHost } from './types';

const EMPTY_PROPS = Object.freeze(Object.create(null)) as ElementProps;

function makeFiber(old: FiberNode | null, tag: FiberNode['tag'], type: FiberNode['type'], props: ElementProps | string): FiberNode {
  const fiber: FiberNode = old?.alternate ?? {
    tag, type, pendingProps: props, memoizedProps: props, key: undefined,
    stateNode: null, return: null, child: null, sibling: null, alternate: null,
    flags: 0, deletions: [], hooks: [], namespace: HTML_NAMESPACE, phase: 'begin',
    input: [], expansion: [], resolved: [], resolvedDepths: [], componentDepth: 0,
    index: 0, oldChild: null, tail: null, propsDiff: null,
  };
  Object.assign(fiber, {
    tag, type, pendingProps: props, key: undefined, stateNode: old?.stateNode ?? null,
    return: null, child: null, sibling: null, alternate: old,
    flags: 0, deletions: [], hooks: [], phase: 'begin', input: [], expansion: [], resolved: [], resolvedDepths: [], componentDepth: 0,
    index: 0, oldChild: old?.child ?? null, tail: null, propsDiff: null,
  });
  if (old) old.alternate = fiber;
  return fiber;
}

export function prepareRoot(root: RenderHost, container: Element) {
  const fiber = makeFiber(root.current, 'root', root.component, EMPTY_PROPS);
  fiber.stateNode = container;
  const own = container.namespaceURI;
  fiber.namespace = own === 'http://www.w3.org/2000/svg' || own === 'http://www.w3.org/1998/Math/MathML'
    ? childNamespace(own, container.localName) : HTML_NAMESPACE;
  root.workInProgress = fiber;
  root.effects = [];
  root.placements = [];
  root.updates = [];
  root.deletions = [];
  return fiber;
}

function expansion(nodes: readonly HNode[], depth = 0, key?: string): Expansion {
  return { nodes, index: 0, output: [], outputDepths: [], depth, key };
}
function append(frame: Expansion, node: HNode, depth: number) {
  const last = frame.output[frame.output.length - 1];
  if (last?.kind === 'text' && node.kind === 'text') {
    frame.output[frame.output.length - 1] = { kind: 'text', text: last.text + node.text };
  } else { frame.output.push(node); frame.outputDepths.push(depth); }
}

/** One expansion step, not a recursive resolve of the whole tree. */
function expandOne(fiber: FiberNode) {
  const frames = fiber.expansion;
  const frame = frames[frames.length - 1]!;
  const node = frame.nodes[frame.index++];
  if (node?.kind === 'component') {
    if (frame.depth >= 1000) throw new Error('컴포넌트 중첩이 1000단계를 넘었습니다');
    frames.push(expansion(normalizeChildren([node.type(node.props)]), frame.depth + 1, node.key));
  } else if (node) append(frame, node, frame.depth);
  else {
    frames.pop();
    let output = frame.output;
    const only = output[0];
    if (frame.key !== undefined && output.length === 1 && only?.kind === 'element') {
      output = [{ ...only, key: frame.key, props: { ...only.props, 'data-key': frame.key } }];
    }
    const parent = frames[frames.length - 1];
    if (parent) for (let i = 0; i < output.length; i++) append(parent, output[i]!, frame.outputDepths[i]!);
    else { fiber.resolved = output; fiber.resolvedDepths = frame.outputDepths; fiber.phase = 'children'; }
  }
}

export function beginWork(root: RenderHost, fiber: FiberNode) {
  if (fiber.tag === 'root') {
    fiber.input = normalizeChildren([renderRoot(root, fiber)]);
  } else if (fiber.tag === 'text') {
    if (!fiber.stateNode) fiber.stateNode = document.createTextNode(fiber.pendingProps as string);
    else if (fiber.pendingProps !== fiber.alternate!.memoizedProps) {
      fiber.flags |= Update;
      root.updates.push(fiber);
    }
    fiber.phase = 'complete';
    return;
  } else {
    if (!fiber.stateNode) fiber.stateNode = createHost(fiber.type as string, fiber.namespace, fiber.pendingProps as ElementProps);
    else {
      fiber.propsDiff = diffProps(fiber.alternate!.memoizedProps as ElementProps, fiber.pendingProps as ElementProps);
      if (fiber.propsDiff) { fiber.flags |= Update; root.updates.push(fiber); }
    }
  }
  fiber.expansion = [expansion(fiber.input, fiber.componentDepth)];
  fiber.phase = 'expand';
}

function reconcileNext(root: RenderHost, parent: FiberNode): FiberNode | null {
  const node = parent.resolved[parent.index++];
  if (!node) {
    for (let old = parent.oldChild; old; old = old.sibling) {
      parent.deletions.push(old);
      root.deletions.push(old);
    }
    parent.phase = 'complete';
    return null;
  }
  if (node.kind === 'component') throw new Error('미해결 컴포넌트');
  const tag = node.kind === 'element' ? 'host' : 'text';
  const type = node.kind === 'element' ? node.tag : null;
  const props = node.kind === 'element' ? node.props : node.text;
  const old = parent.oldChild;
  parent.oldChild = old?.sibling ?? null;
  const matches = old?.tag === tag && old.type === type;
  if (old && !matches) { parent.deletions.push(old); root.deletions.push(old); }
  const fiber = makeFiber(matches ? old : null, tag, type, props);
  fiber.return = parent;
  fiber.componentDepth = parent.resolvedDepths[parent.index - 1]!;
  fiber.key = node.kind === 'element' ? node.key : undefined;
  const parentNS = parent.tag === 'host' ? childNamespace(parent.namespace, parent.type as string) : parent.namespace;
  fiber.namespace = tag === 'host' ? elementNamespace(parentNS, type as string) : parentNS;
  fiber.input = node.kind === 'element' ? (node as HElement).children : [];
  if (!matches) {
    fiber.flags |= Placement;
    // Descendants of a new node are assembled detached; insert only the subtree root.
    if (!(parent.flags & Placement)) root.placements.push(fiber);
  }
  if (parent.tail) parent.tail.sibling = fiber;
  else parent.child = fiber;
  parent.tail = fiber;
  return fiber;
}

export function completeWork(fiber: FiberNode) {
  if (fiber.flags & Placement) {
    for (let child = fiber.child; child; child = child.sibling) fiber.stateNode!.appendChild(child.stateNode!);
  }
  fiber.memoizedProps = fiber.pendingProps;
  // The resolved list is temporary; committed identity is the host Fiber list.
  fiber.expansion = [];
  fiber.resolved = [];
  fiber.resolvedDepths = [];
  fiber.input = [];
}

/** Repeated calls are the entire DFS. No recursion and no DOM writes to current. */
export function performUnitOfWork(root: RenderHost, fiber: FiberNode): FiberNode | null {
  if (fiber.phase === 'begin') beginWork(root, fiber);
  else if (fiber.phase === 'expand') expandOne(fiber);
  else if (fiber.phase === 'children') {
    const child = reconcileNext(root, fiber);
    if (child) return child;
  } else {
    completeWork(fiber);
    return fiber.return;
  }
  return fiber;
}
