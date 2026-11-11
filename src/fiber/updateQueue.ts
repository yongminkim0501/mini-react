import { NoLane } from './lanes';
import type { Action } from './types';

export interface StateUpdate { lane: number; action: Action }

/** Never consume the shared pending queue during Render: abandoned attempts can retry. */
export function rebaseUpdates(baseState: unknown, updates: readonly StateUpdate[], lanes: number) {
  let value = baseState, nextBase = baseState;
  let skipped = false;
  const baseQueue: StateUpdate[] = [];
  for (const update of updates) {
    if (update.lane !== NoLane && !(update.lane & lanes)) {
      if (!skipped) { skipped = true; nextBase = value; }
      baseQueue.push(update);
    } else {
      value = typeof update.action === 'function' ? update.action(value) : update.action;
      if (skipped) baseQueue.push({ ...update, lane: NoLane });
    }
  }
  if (!skipped) nextBase = value;
  return { value, baseState: nextBase, baseQueue };
}
