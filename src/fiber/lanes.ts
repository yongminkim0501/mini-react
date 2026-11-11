export const NoLane = 0;
export const SyncLane = 1;
export const DefaultLane = 2;
export const TransitionLane = 4;
export const AllLanes = SyncLane | DefaultLane | TransitionLane;

let currentLane = DefaultLane;
export function getCurrentLane() { return currentLane; }
export function highestLane(lanes: number) { return lanes & -lanes; }
export function runWithLane<T>(lane: number, fn: () => T): T {
  const previous = currentLane;
  currentLane = lane;
  try { return fn(); } finally { currentLane = previous; }
}
