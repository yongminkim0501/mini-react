import { clampSize } from './data.js';

/**
 * URL 파라미터 해석. 순수 함수.
 * ?engine=stack | ?engines=stack,fiber &size=20000&seed=42&cellCost=0&scenario=S2&runs=3&autorun=1&hud=record&save=1
 * engines가 있으면 engine보다 우선한다. 첫 엔진으로 페이지를 띄운다.
 * @param {string} search location.search
 */
export function parseParams(search) {
  const p = new URLSearchParams(search);
  const num = (name, fallback) => {
    const raw = p.get(name);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const list = (p.get('engines') ?? p.get('engine') ?? 'stack')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const engines = list.length ? [...new Set(list)] : ['stack'];
  const appVariants = [...new Set((p.get('apps') ?? p.get('app') ?? 'current')
    .split(',').map(s => s.trim()).filter(s => ['current', 'cached'].includes(s)))];
  return {
    appVariants: appVariants.length ? appVariants : ['current'],
    engine: engines[0],
    engines,
    size: clampSize(num('size', 20000)),
    seed: Math.trunc(num('seed', 42)),
    cellCost: Math.max(0, num('cellCost', 0)),
    scenario: p.get('scenario'),
    runs: Math.max(1, Math.trunc(num('runs', 3))),
    autorun: p.get('autorun') === '1',
    hud: p.get('hud'),
    save: p.get('save') === '1',
  };
}
