import { afterEach, expect, it } from 'vitest';
import { createEngine } from './engine-adapter.js';
import { createHeatmapApp } from './app/heatmap-app.js';

afterEach(() => document.body.replaceChildren());

it('same heatmap inputs, regeneration, selection, SLO and resize produce identical DOM', async () => {
  async function run(mode) {
    const engine = createEngine(mode);
    const { App } = createHeatmapApp(engine);
    const container = document.createElement('div'); document.body.append(container);
    const root = engine.createRoot(App, container, { label: 'heatmap', props: { size: 1000, seed: 42, cellCost: 0 } });
    const snapshots = [];
    const record = async () => {
      await Promise.resolve();
      await root.instance.whenIdle?.();
      root.instance.flushPassiveEffects?.();
      snapshots.push([container.innerHTML, document.title]);
    };
    const event = (id, value, type = 'input') => {
      const element = container.querySelector(id); element.value = value;
      element.dispatchEvent(new Event(type, { bubbles: true }));
    };
    try {
      root.mount(); await record();
      container.querySelector('#regen').click(); await record();
      for (const text of ['dep', 'deploy-1742', 'err-503', '']) { event('#search', text); await record(); }
      container.querySelector('#heatmap .cell').click(); await record();
      event('#slo', '500'); await record();
      event('#size', '2000', 'change'); await record();
      for (let i = 0; i < 3; i++) { container.querySelector('#regen').click(); await record(); }
      return snapshots;
    } finally { root.unmount(); engine.dispose?.(); container.remove(); }
  }
  const baseline = await run('stack');
  expect(await run('fiber-sync')).toEqual(baseline);
  expect(await run('fiber-slice')).toEqual(baseline);
  expect(await run('fiber')).toEqual(baseline);
}, 20000);
