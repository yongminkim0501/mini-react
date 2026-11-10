/** Engine API operations, not browser layout/paint or external scenario DOM writes. */
export const counterKeys = [
  'rootCalls', 'childCalls', 'renderFiberVisits', 'renderWorkUnits',
  'commitFiberVisits', 'commitEffectVisits', 'commitAnchorSiblingVisits', 'commitHookVisits',
  'liveDomWrites', 'detachedDomOps', 'eventHandlerWrites',
  'bailoutHits', 'bailoutMisses', 'bailoutMissDifferentVComponent',
  'bailoutMissDifferentPosition', 'bailoutMissFallbackShape',
] as const;
export type CounterKey = typeof counterKeys[number];
export type CounterBucket = Record<CounterKey, number>;
export interface AttemptCounters { total: CounterBucket; inside: CounterBucket; outside: CounterBucket }
export function newCounters(): AttemptCounters {
  const bucket = () => Object.fromEntries(counterKeys.map(key => [key, 0])) as CounterBucket;
  return { total: bucket(), inside: bucket(), outside: bucket() };
}
export function count(root: { counters: AttemptCounters }, inside: boolean, key: CounterKey, amount = 1) {
  root.counters.total[key] += amount;
  root.counters[inside ? 'inside' : 'outside'][key] += amount;
}
