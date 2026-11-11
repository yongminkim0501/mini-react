import { afterEach, describe, expect, it, vi } from 'vitest';
import { FunctionComponent } from '../runtime/FunctionComponent';
import * as stackHooks from '../runtime/index';
import type { Child } from '../runtime/types';
import { createFiberSyncEngine, h, useEffect, useMemo, useState } from './index';
import type { FiberRoot } from './root';
import { performUnitOfWork, prepareRoot } from './workLoop';

const roots: { unmount(): void }[] = [];
const flush = async () => { await Promise.resolve(); };
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mount(App: () => Child) {
  const engine = createFiberSyncEngine();
  const container = document.createElement('div');
  document.body.append(container);
  const root = engine.createRoot(App, container, { label: 'test' });
  const events: string[] = [];
  engine.subscribe((event) => events.push(event.type));
  roots.push(root);
  root.mount();
  return { root: root.instance, container, events };
}

describe('fiber-sync double buffer / Render and Commit', () => {
  it('does not mutate current DOM, props, handlers, state queue or run effects before Commit', () => {
    const calls: number[] = [];
    let set!: (n: number) => void;
    const { root, container } = mount(() => {
      const [n, s] = useState(0); set = s;
      useEffect(() => { calls.push(n); }, [n]);
      return h('button', { title: String(n), onClick: () => calls.push(n) }, n, h('i', null, n));
    });
    root.flushPassiveEffects();
    const old = root.current!;
    const button = container.firstChild as HTMLButtonElement;
    set(1);
    root.rendering = true;
    let unit = prepareRoot(root, container) as ReturnType<typeof performUnitOfWork>;
    while (unit) unit = performUnitOfWork(root, unit);
    root.rendering = false;
    expect(container.innerHTML).toBe('<button title="0">0<i>0</i></button>');
    button.click();
    expect(calls).toEqual([0, 0]);
    expect(root.current).toBe(old);
    const hook = old.hooks[0]!;
    expect(hook.kind === 'state' && hook.queue.pending).toEqual([1]);
    root.update();
    expect(root.current?.alternate).toBe(old);
    expect(root.current?.alternate?.alternate).toBe(root.current);
    expect(container.firstChild).toBe(button);
    expect(button.title).toBe('1');
    expect(calls).toEqual([0, 0]);
    root.flushPassiveEffects();
    expect(calls).toEqual([0, 0, 1]);
  });

  it('reuses two buffers and emits start/end/commit in order', async () => {
    let set!: (n: number) => void;
    const { root, events } = mount(() => { const [n, s] = useState(0); set = s; return h('p', null, n); });
    const a = root.current;
    set(1); await flush();
    const b = root.current;
    expect(b).not.toBe(a);
    set(2); await flush();
    expect(root.current).toBe(a);
    expect(events.filter((type) => type !== 'renderSlice')).toEqual(Array(3).fill(['renderStart', 'renderEnd', 'commit']).flat());
  });

  it('failed Render preserves committed DOM, memo and actions; retry applies queued updater once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = false;
    let set!: (n: (p: number) => number) => void;
    const effects: number[] = [];
    const { root, container } = mount(() => {
      const [n, s] = useState(0); set = s;
      useMemo(() => n, [n]);
      useEffect(() => { effects.push(n); }, [n]);
      if (fail) throw new Error('reject');
      return h('p', null, n);
    });
    root.flushPassiveEffects();
    const current = root.current;
    fail = true; set((n) => n + 1); await flush();
    expect(container.textContent).toBe('0');
    expect(root.current).toBe(current);
    expect(effects).toEqual([0]);
    fail = false; root.update(); root.flushPassiveEffects();
    expect(container.textContent).toBe('1');
    expect(effects).toEqual([0, 1]);
  });

  it('indexes host output across pure component boundaries, fragments, keys and merged text', async () => {
    let output: Child = null;
    const fiber = mount(() => output);
    const container = document.createElement('div');
    const stack = new FunctionComponent(() => output, container); roots.push(stack); stack.mount();
    const A = () => h('span', null, 'a');
    const B = () => h('span', null, 'b');
    const Text = () => ['b', null, 'c'];
    const Many = () => [h('em', null, 'm'), h('strong', null, 'n')];
    const variants: Child[] = [
      [h(A, { key: 'outer' }), 'a', h(Text), 'd', h(Many)],
      [h(B, { key: 'new' }), 'z', h(Text), false, h('i', null, 'replaced')],
      [h(B), h('input', { type: 'checkbox', checked: true }), h('svg', null, h('g', null, h('circle')))],
      [h('svg', null, h('foreignObject', null, h('div', null, 'html'))), null],
      [h(Many, { key: 'ignored' }), 0], [], ['<script>', h(Text)],
    ];
    for (const variant of variants) {
      const previousFiber = fiber.container.firstChild;
      const previousStack = container.firstChild;
      output = variant;
      fiber.root.update(); stack.update();
      expect(fiber.container.innerHTML).toBe(container.innerHTML);
      expect(fiber.container.childNodes.length).toBe(container.childNodes.length);
      // If stack reused the first host, Fiber must also preserve it.
      if (previousStack && container.firstChild === previousStack) expect(fiber.container.firstChild).toBe(previousFiber);
    }
    await flush();
  });

  it('preserves input selection and replaces/deletes latest event handlers without duplicates', async () => {
    let set!: (n: number) => void;
    const calls: unknown[] = [];
    const { container } = mount(() => {
      const [n, s] = useState(0); set = s;
      return [h('input', { value: n < 2 ? 'abc' : 'next' }), h('button', n === 3 ? {} : {
        onClick: function(this: Element) { calls.push(n, this); },
      }, n)];
    });
    const input = container.querySelector('input')!;
    const button = container.querySelector('button')!;
    input.focus(); input.setSelectionRange(1, 2);
    set(1); await flush();
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2]);
    button.click(); expect(calls).toEqual([1, button]);
    set(2); await flush(); expect(input.value).toBe('next');
    button.click(); expect(calls).toEqual([1, button, 2, button]);
    set(3); await flush(); button.click(); expect(calls).toHaveLength(4);
    set(4); await flush(); button.click(); expect(calls.slice(-2)).toEqual([4, button]);
  });
});

// Behavioral counterparts of existing Hooks tests. Fiber's passive boundary is explicit.
describe.each(['stack', 'fiber-sync'] as const)('%s Hooks shared behavior', (mode) => {
  function start(make: (api: Pick<typeof stackHooks, 'h' | 'useState' | 'useMemo' | 'useEffect'>) => () => Child) {
    const container = document.createElement('div'); document.body.append(container);
    const engine = createFiberSyncEngine();
    const App = make(mode === 'stack' ? stackHooks : engine);
    const instance = mode === 'stack' ? new FunctionComponent(App, container)
      : engine.createRoot(App, container, { label: 'hooks' }).instance;
    roots.push(instance); instance.mount();
    const passive = () => { if (mode !== 'stack') (instance as FiberRoot).flushPassiveEffects(); };
    return { container, instance, passive };
  }

  it('lazy init, stable setter, values vs functions, one-event batching, literal no-op', async () => {
    const init = vi.fn(() => 0);
    let set!: (action: number | ((n: number) => number)) => void;
    let renders = 0;
    let visible = -1;
    const { container } = start(({ h, useState }) => () => {
      renders++; const [n, s] = useState(init); set = s; visible = n;
      return h('button', { onClick: () => { s(n + 1); s(n + 1); s((p) => p + 2); } }, n);
    });
    const firstSet = set;
    container.querySelector('button')!.click();
    expect(visible).toBe(0);
    await flush();
    expect(container.textContent).toBe('3'); expect(renders).toBe(2);
    expect(init).toHaveBeenCalledTimes(1); expect(set).toBe(firstSet);
    set(3); await flush(); expect(renders).toBe(2);
    set((p) => p + 1); set((p) => p + 1); await flush(); expect(container.textContent).toBe('5');
  });

  it('memo deps: absent, empty, Object.is, same and new references', async () => {
    const always = vi.fn(), once = vi.fn(), byRef = vi.fn(), byValue = vi.fn();
    let set!: (n: number) => void;
    let ref: object = {};
    let dep = NaN;
    start(({ h, useState, useMemo }) => () => {
      const [n, s] = useState(0); set = s;
      useMemo(always); useMemo(once, []); useMemo(byRef, [ref]); useMemo(byValue, [dep]);
      return h('p', null, n);
    });
    set(1); await flush(); ref = {}; dep = -0;
    set(2); await flush(); dep = 0; set(3); await flush();
    expect(always).toHaveBeenCalledTimes(4); expect(once).toHaveBeenCalledTimes(1);
    expect(byRef).toHaveBeenCalledTimes(2); expect(byValue).toHaveBeenCalledTimes(3);
  });

  it('effects: no deps, [], changed deps, cleanup order, committed DOM, unmount', async () => {
    const log: string[] = [];
    const once = vi.fn(), always = vi.fn();
    let set!: (n: number) => void;
    const { container, instance, passive } = start(({ h, useState, useEffect }) => () => {
      const [n, s] = useState(0); set = s;
      useEffect(always); useEffect(once, []);
      useEffect(() => { log.push(`effect:${n}:${document.querySelector('#observed')?.textContent}`); return () => { log.push(`cleanup:${n}`); }; }, [n]);
      return h('p', { id: 'observed' }, n);
    });
    // Fiber effects are explicitly drained after the committed DOM is available.
    passive();
    set(1); await flush(); passive(); set(1); await flush(); passive();
    expect(always).toHaveBeenCalledTimes(2); expect(once).toHaveBeenCalledTimes(1);
    expect(log.slice(-2)).toEqual(['cleanup:0', 'effect:1:1']);
    instance.unmount(); expect(log.at(-1)).toBe('cleanup:1');
    set(9); await flush(); expect(container.textContent).toBe('');
  });

  it('root isolation, hook outside/child/order/count and render-time setter errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let extra = false;
    const a = start(({ h, useState }) => () => { useState(0); if (extra) useState(1); return h('p', null, 'a'); });
    const b = start(({ h, useState }) => () => { const [n] = useState(2); return h('p', null, n); });
    extra = true; a.instance.update();
    expect(a.container.textContent).toBe('a'); expect(b.container.textContent).toBe('2');
    const child = start(({ h, useState }) => () => h(() => { useState(0); return h('p'); }));
    expect(child.container.textContent).toBe('');
    const setter = start(({ h, useState, useMemo }) => () => {
      const [n, set] = useState(0); useMemo(() => set(n + 1), []); return h('p');
    });
    expect(setter.container.textContent).toBe('');
  });

  it('rejects fewer hooks and changed hook kinds while preserving DOM', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = mode === 'stack' ? stackHooks : createFiberSyncEngine();
    expect(() => api.useState(0)).toThrow();
    expect(() => api.useMemo(() => 1)).toThrow();
    expect(() => api.useEffect(() => {})).toThrow();
    let variant = 0;
    const app = start(({ h, useState, useMemo }) => () => {
      useState(0);
      if (variant === 0) useMemo(() => 1, []);
      if (variant === 2) useState(1);
      return h('p', null, variant);
    });
    variant = 1; app.instance.update(); expect(app.container.textContent).toBe('0');
    variant = 2; app.instance.update(); expect(app.container.textContent).toBe('0');
  });

  it('isolates effect and cleanup failures and cleans up every committed effect', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const effects: string[] = [];
    let set!: (n: number) => void;
    const { instance, passive } = start(({ h, useState, useEffect }) => () => {
      const [n, s] = useState(0); set = s;
      useEffect(() => { throw new Error('first'); }, []);
      useEffect(() => { effects.push(`effect:${n}`); return () => { throw new Error('cleanup'); }; }, [n]);
      useEffect(() => () => { effects.push(`cleanup:${n}`); }, [n]);
      return h('p', null, n);
    });
    passive(); set(1); await flush(); passive(); instance.unmount();
    expect(effects).toEqual(['effect:0', 'effect:1', 'cleanup:0', 'cleanup:1']);
    expect(error.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('effect state update uses a subsequent render, then [] stays stable', async () => {
    let renders = 0;
    const { container, passive } = start(({ h, useState, useEffect }) => () => {
      renders++; const [loaded, set] = useState(false);
      useEffect(() => set(true), []);
      return h('p', null, loaded ? 'ready' : 'loading');
    });
    passive(); await flush(); passive(); await flush();
    expect(container.textContent).toBe('ready'); expect(renders).toBe(2);
  });
});

describe('Fiber passive scheduling and lifetime', () => {
  it('caps a runaway passive-state chain at 100 updates without retaining rejected actions', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let renders = 0;
    const { root, container } = mount(() => {
      renders++; const [n, set] = useState(0);
      useEffect(() => set(n + 1));
      return h('p', null, n);
    });
    for (let i = 0; i < 102; i++) { root.flushPassiveEffects(); await flush(); }
    expect(renders).toBe(101); expect(container.textContent).toBe('100');
    expect(String(error.mock.calls[0]?.[0])).toContain('연속');
    const hook = root.current!.hooks[0]!;
    expect(hook.kind === 'state' && hook.queue.pending).toEqual([]);
  });

  it('limits component nesting even across intervening host elements', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Recursive = (): Child => h('div', null, h(Recursive));
    const { container, root } = mount(() => h(Recursive));
    expect(container.innerHTML).toBe(''); expect(root.current).toBeNull();
  });

  it('runs after rAF + task, isolates effect errors and lets effect schedule state', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const order: string[] = [];
    const { container } = mount(() => {
      const [n, set] = useState(0);
      useEffect(() => { throw new Error('effect'); }, []);
      useEffect(() => { order.push('passive'); set(1); }, []);
      return h('p', null, n);
    });
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(15); expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(order).toEqual(['passive']); expect(container.textContent).toBe('1');
  });

  it('unmount cancels unrun effects and setters from the previous mount', async () => {
    vi.useFakeTimers();
    const fx = vi.fn();
    let set!: (n: number) => void;
    const { root, container } = mount(() => {
      const [n, s] = useState(0); set = s; useEffect(fx, []); return h('p', null, n);
    });
    const oldSetter = set;
    set(3); root.unmount(); root.mount();
    oldSetter(7); await vi.advanceTimersByTimeAsync(40);
    expect(fx).toHaveBeenCalledTimes(1); expect(container.textContent).toBe('0');
  });
});
