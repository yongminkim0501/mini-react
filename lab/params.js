import { clampSize } from './data.js';

/**
 * URL 파라미터 해석. 순수 함수.
 * ?engine=stack&size=10000&seed=42&cellCost=0&scenario=S2&runs=3&autorun=1&hud=record
 * @param {string} search location.search
 */
export function parseParams(search) {
  const p = new URLSearchParams(search);
  const num = (name, fallback) => {
    const raw = p.get(name);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    engine: p.get('engine') ?? 'stack',
    size: clampSize(num('size', 10000)),
    seed: Math.trunc(num('seed', 42)),
    cellCost: Math.max(0, num('cellCost', 0)),
    scenario: p.get('scenario'),
    runs: Math.max(1, Math.trunc(num('runs', 3))),
    autorun: p.get('autorun') === '1',
    hud: p.get('hud'),
  };
}
