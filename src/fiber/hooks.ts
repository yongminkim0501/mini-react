import type { Action, FiberNode, Hook, RenderHost } from './types';
import { getCurrentLane } from './lanes';
import { rebaseUpdates } from './updateQueue';
import type { StateUpdate } from './updateQueue';

let currentlyRenderingFiber: FiberNode | null = null;
let host: RenderHost | null = null;
let hookIndex = 0;

/** Only the root function gets a hook context; pure children do not. */
export function renderRoot(root: RenderHost, fiber: FiberNode) {
  const previous = { fiber: currentlyRenderingFiber, host, index: hookIndex };
  currentlyRenderingFiber = fiber;
  host = root;
  hookIndex = 0;
  try {
    const result = root.component(root.props);
    if (fiber.alternate && hookIndex !== fiber.alternate.hooks.length) {
      throw new Error('Hook 호출 개수가 바뀌었습니다');
    }
    return result;
  } finally {
    currentlyRenderingFiber = previous.fiber;
    host = previous.host;
    hookIndex = previous.index;
  }
}

function slot<K extends Hook['kind']>(kind: K) {
  if (!currentlyRenderingFiber || !host) throw new Error('Hook은 루트 컴포넌트 렌더링 중에만 사용할 수 있습니다');
  const index = hookIndex++;
  const old = currentlyRenderingFiber.alternate?.hooks[index];
  if (currentlyRenderingFiber.alternate && (!old || old.kind !== kind)) {
    throw new Error('Hook 호출 순서가 바뀌었습니다');
  }
  return { root: host, fiber: currentlyRenderingFiber, old: old as Extract<Hook, {kind: K}> | undefined };
}

export function useState<T>(initial: T | (() => T)): [T, (action: T | ((previous: T) => T)) => void] {
  const { root, fiber, old } = slot('state');
  const queue = old?.queue ?? {
    pending: [] as Action[],
    value: typeof initial === 'function' ? (initial as () => T)() : initial,
    active: false,
    updates: [] as StateUpdate[],
    hasBase: false,
    set: (_action: Action) => {},
  };
  if (!old) {
    queue.set = (action) => {
      if (root.rendering) throw new Error('렌더링 중에는 setState를 호출할 수 없습니다');
      if (!root.alive || !queue.active) return;
      if (root.laneAware) {
        if (!queue.updates.length && !queue.hasBase && typeof action !== 'function' && Object.is(action, queue.value)) return;
        const lane = getCurrentLane();
        if (root.schedule(lane)) queue.updates.push({ lane, action });
        return;
      }
      // Do not evaluate updater functions in the setter. Literal no-ops can skip scheduling.
      if (!queue.pending.length && typeof action !== 'function' && Object.is(action, queue.value)) return;
      if (root.schedule()) queue.pending.push(action);
    };
  }
  if (root.laneAware) {
    const consumed = queue.updates.length;
    const result = rebaseUpdates(old ? old.baseState : queue.value,
      [...(old?.baseQueue ?? []), ...queue.updates.slice(0, consumed)], root.renderLane);
    fiber.hooks.push({ kind: 'state', ...result, queue, consumed });
    return [result.value as T, queue.set];
  }
  let value = old ? old.value : queue.value;
  const consumed = queue.pending.length;
  for (let i = 0; i < consumed; i++) {
    const action = queue.pending[i];
    value = typeof action === 'function' ? action(value) : action;
  }
  fiber.hooks.push({ kind: 'state', value, queue, consumed, baseState: value, baseQueue: [] });
  return [value as T, queue.set];
}

function changed(previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
  return !previous || !next || previous.length !== next.length || next.some((value, i) => !Object.is(value, previous[i]));
}

export function useMemo<T>(compute: () => T, deps?: readonly unknown[]): T {
  const { fiber, old } = slot('memo');
  const value = old && !changed(old.deps, deps) ? old.value : compute();
  fiber.hooks.push({ kind: 'memo', value, deps: deps?.slice() });
  return value as T;
}

export function useEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
  const { root, fiber, old } = slot('effect');
  const cell = old?.cell ?? { cleanup: undefined };
  fiber.hooks.push({ kind: 'effect', cell, deps: deps?.slice() });
  if (!old || changed(old.deps, deps)) root.effects.push({ cell, create });
}
