import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFiberSliceEngine, h, useState } from './index';
import { SliceScheduler } from './scheduler';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

function host() {
  let time = 0;
  const tasks: (() => void)[] = [];
  const scheduler = new SliceScheduler(() => time, (task) => tasks.push(task));
  return { scheduler, tasks, advance: (ms: number) => { time += ms; } };
}

describe('MessageChannel policy / 5ms single-lane slices', () => {
  it('yields at 5ms, runs only one root per host task and rotates roots fairly', () => {
    const { scheduler, tasks, advance } = host();
    const sequence: string[] = [];
    let a = 0, b = 0;
    const A = { runSlice(yieldNow: () => boolean) { do { a++; sequence.push('a'); advance(1); } while(a < 12 && !yieldNow()); return a < 12; } };
    const B = { runSlice(yieldNow: () => boolean) { do { b++; sequence.push('b'); advance(1); } while(b < 7 && !yieldNow()); return b < 7; } };
    scheduler.enqueue(A); scheduler.enqueue(A); scheduler.enqueue(B);
    expect(tasks).toHaveLength(1);
    tasks.shift()!(); expect([a,b]).toEqual([5,0]);
    tasks.shift()!(); expect([a,b]).toEqual([5,5]);
    while(tasks.length) tasks.shift()!();
    expect(sequence.join('')).toBe('a'.repeat(5) + 'b'.repeat(5) + 'a'.repeat(5) + 'b'.repeat(2) + 'a'.repeat(2));
    scheduler.dispose();
  });
  it('uses MessageChannel for the default transport and cancels disposed/cancelled jobs', () => {
    let message!: () => void;
    const postMessage = vi.fn(); const close = vi.fn();
    vi.stubGlobal('MessageChannel', class {
      port1 = { set onmessage(fn: () => void) { message = fn; }, close };
      port2 = { postMessage, close };
    });
    try {
      const scheduler = new SliceScheduler(); const job = { runSlice: vi.fn(() => false) };
      scheduler.enqueue(job); expect(postMessage).toHaveBeenCalledTimes(1);
      scheduler.cancel(job); message(); expect(job.runSlice).not.toHaveBeenCalled();
      scheduler.enqueue(job); scheduler.dispose(); message(); expect(job.runSlice).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('fiber-slice resumable roots', () => {
  function lab() {
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time += 0.5);
    const tasks: (() => void)[] = [];
    const scheduler = new SliceScheduler(() => performance.now(), (task) => tasks.push(task));
    const engine = createFiberSliceEngine(scheduler);
    const container = document.createElement('div'); document.body.append(container);
    const pump = () => {
      let limit = 10000;
      while (tasks.length && --limit) tasks.shift()!();
      expect(limit).toBeGreaterThan(0);
    };
    return { engine, tasks, container, pump };
  }
  it('finishes the current snapshot before applying updates arriving between slices (no restart)', async () => {
    const { engine, tasks, container, pump } = lab();
    let set!: (n: number | ((p: number) => number)) => void;
    const commits: string[] = [], starts: number[] = [];
    engine.subscribe((e) => { if(e.type === 'commit') commits.push(container.textContent!); if(e.type === 'renderStart') starts.push(e.attemptId); });
    const root = engine.createRoot(() => {
      const [n,s] = useState(0); set = s;
      return h('main', null, Array.from({length: 30}, () => h('i', null, n)));
    }, container, { label: 'heatmap' });
    try {
      root.mount(); expect(container.textContent).toBe(''); pump(); await root.instance.whenIdle();
      commits.length = 0; starts.length = 0;
      set(1); tasks.shift()!();
      expect(container.textContent).toBe('0'.repeat(30));
      set((n) => n + 1); set((n) => n + 1);
      pump(); await root.instance.whenIdle();
      expect(commits).toEqual(['1'.repeat(30), '3'.repeat(30)]);
      expect(starts).toHaveLength(2);
    } finally { root.unmount(); engine.dispose(); }
  });
  it('lets a small second root commit during a large first root Render', () => {
    const { engine, container, pump } = lab();
    const other = document.createElement('div'); document.body.append(other);
    const commits: string[] = [];
    engine.subscribe((e) => { if(e.type === 'commit') commits.push(e.label); });
    const a = engine.createRoot(() => h('div', null, Array.from({length:100}, () => h('i', null, 'a'))), container, {label:'large'});
    const b = engine.createRoot(() => h('p', null, 'progress'), other, {label:'small'});
    try {
      a.mount(); b.mount(); pump();
      expect(commits).toEqual(['small','large']);
      expect(container.querySelectorAll('i')).toHaveLength(100);
    } finally { a.unmount(); b.unmount(); engine.dispose(); }
  });
  it('unmount during Render cancels pending Commit and remount cannot revive old work', () => {
    const { engine, tasks, container, pump } = lab();
    const root = engine.createRoot(() => h('div', null, Array.from({length:30}, () => h('i', null, 'a'))), container, {label:'test'});
    try {
      root.mount(); tasks.shift()!(); root.unmount(); pump(); expect(container.textContent).toBe('');
      root.mount(); pump(); expect(container.textContent).toBe('a'.repeat(30));
    } finally { root.unmount(); engine.dispose(); }
  });
});
