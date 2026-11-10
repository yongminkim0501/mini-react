import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFiberEngine, h, useMemo, useState } from './index';
import { runWithLane, SyncLane, TransitionLane } from './lanes';
import { SliceScheduler } from './scheduler';
import { prepareRoot, performUnitOfWork } from './workLoop';
import { commitRoot } from './commit';
import type { FiberNode } from './types';
import type { VComponent } from '../runtime/types';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

/** A proposed cache fixture, not a change to the frozen lab application. No bailout. */
function fixture() {
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock += 0.5);
  const tasks: (() => void)[] = [], microtasks: (() => void)[] = [];
  const scheduler = new SliceScheduler(() => performance.now(), (fn) => tasks.push(fn), true, (fn) => microtasks.push(fn));
  const engine = createFiberEngine(scheduler);
  const container = document.createElement('div'); document.body.append(container);
  const observations: {
    query: string; matches: string; selected: number;
    setter: (value: number | ((previous: number) => number)) => void;
    onSelect: () => void; vnode: VComponent<any>;
  }[] = [];
  let setQuery!: (value: string) => void, setMatches!: (value: string) => void;
  function Heatmap({ matches, selected, onSelect }: { matches: string; selected: number; onSelect: () => void }) {
    return h('section', { onClick: onSelect }, Array.from({ length: 40 }, () => h('i', null, `${matches}/${selected}`)));
  }
  const root = engine.createRoot(() => {
    const [query, q] = useState('initial'); setQuery = q;
    const [matches, m] = useState(''); setMatches = m;
    const [selected, setSelected] = useState(0);
    const onSelect = useMemo(() => () => setSelected((previous) => previous + 1), [setSelected]);
    const vnode = useMemo(() => h(Heatmap, { matches, selected, onSelect }), [matches, selected, onSelect]);
    observations.push({ query, matches, selected, setter: setSelected, onSelect, vnode });
    return h('main', null, h('output', null, query), vnode);
  }, container, { label: 'heatmap' });
  const pumpSync = () => { let guard=1000; while(microtasks.length && --guard) microtasks.shift()!(); expect(guard).toBeGreaterThan(0); };
  const pump = () => {
    let guard=10000;
    while((tasks.length || microtasks.length) && --guard) { pumpSync(); tasks.shift()?.(); }
    expect(guard).toBeGreaterThan(0);
  };
  root.mount(); pump();
  return { root, engine, container, observations, tasks, pump, pumpSync,
    setQuery: (value: string) => setQuery(value), setMatches: (value: string) => setMatches(value),
    dispose: () => { root.unmount(); engine.dispose(); } };
}

describe('B-4 prerequisite gates (B-3 engine, no bailout implementation)', () => {
  it('keeps the queue dispatch and onSelect identity across committed renders and functional updates', () => {
    const f=fixture();
    try {
      const first=f.observations[0]!;
      const state=f.root.instance.current!.hooks[2]!;
      if(state.kind!=='state') throw new Error('state slot');
      expect(state.queue.set).toBe(first.setter);
      runWithLane(SyncLane,()=>f.setQuery('a'));f.pumpSync();
      expect(f.observations.at(-1)!.vnode).toBe(first.vnode);
      runWithLane(SyncLane,()=>{ first.onSelect(); first.onSelect(); });f.pumpSync();
      expect(f.observations.at(-1)!.selected).toBe(2);
      f.engine.startTransition(()=>f.setMatches('later'));f.pump();
      expect(f.observations.length).toBeGreaterThanOrEqual(4);
      for(const seen of f.observations) {
        expect(seen.setter).toBe(first.setter); expect(seen.onSelect).toBe(first.onSelect);
      }
      const latest=f.root.instance.current!.hooks[2]!;
      expect(latest.kind==='state' && latest.queue).toBe(state.queue);
    } finally {f.dispose();}
  });

  it('reuses the last committed heatmap VNode in Sync after a Transition computed and then discarded another memo value', () => {
    const f=fixture();
    try {
      const committed=f.root.instance.current!, baseline=f.observations[0]!;
      f.engine.startTransition(()=>f.setMatches('new matches'));f.tasks.shift()!();
      const abandoned=f.observations.at(-1)!;
      expect(abandoned.matches).toBe('new matches'); expect(abandoned.vnode).not.toBe(baseline.vnode);
      expect(f.root.instance.current).toBe(committed);
      const memo=committed.hooks[4]!;
      expect(memo.kind==='memo' && memo.value).toBe(baseline.vnode);
      const commits: { lane: number | undefined; vnode: object }[]=[];
      f.engine.subscribe((event)=>{
        if(event.type==='commit') commits.push({lane:event.lane,vnode:f.observations.at(-1)!.vnode});
      });
      runWithLane(SyncLane,()=>f.setQuery('typed'));f.pumpSync();
      expect(commits).toEqual([{lane:SyncLane,vnode:baseline.vnode}]);
      expect(f.observations.at(-1)!.onSelect).toBe(baseline.onSelect);
      f.pump();
      expect(commits.map((c)=>c.lane)).toEqual([SyncLane,TransitionLane]);
      expect(commits[1]!.vnode).not.toBe(abandoned.vnode);
      expect(commits[1]!.vnode).not.toBe(baseline.vnode);
      expect(f.observations.at(-1)!.matches).toBe('new matches');
    } finally {f.dispose();}
  });

  it('commits a changed output without walking a clean heatmap descendant list', () => {
    const f=fixture();
    let clean: FiberNode | undefined;
    let descriptor: PropertyDescriptor | undefined;
    try {
      runWithLane(SyncLane,()=>f.setQuery('changed'));
      const instance=f.root.instance;
      instance.renderLane=SyncLane;
      let unit: FiberNode | null=prepareRoot(instance,f.container);
      while(unit) unit=performUnitOfWork(instance,unit);
      clean=instance.workInProgress!.child!.child!.sibling!;
      expect(clean.stateNode).toBe(f.container.querySelector('section'));
      expect(instance.updates).toHaveLength(1);
      descriptor=Object.getOwnPropertyDescriptor(clean,'child')!;
      Object.defineProperty(clean,'child',{configurable:true,get:()=>{throw new Error('Commit traversed a clean subtree');}});
      expect(()=>commitRoot(instance)).not.toThrow();
      expect(f.container.querySelector('output')!.textContent).toBe('changed');
    } finally {
      if(clean && descriptor) Object.defineProperty(clean,'child',descriptor);
      f.dispose();
    }
  });

  it('freezes the VComponent shell but leaves nested input immutability as an explicit caller contract', () => {
    const data={servers:[{cells:[1]}]};
    const vnode=h(({data: value}:{data:{servers:{cells:number[]}[]}})=>h('i',null,value.servers[0]!.cells[0]),{data});
    expect(Object.isFrozen(vnode)).toBe(true);
    expect(Object.isFrozen(vnode.props)).toBe(true);
    expect(Object.isFrozen(vnode.props.children)).toBe(true);
    expect(()=>Object.assign(vnode.props,{data:{servers:[]}})).toThrow(TypeError);
    expect(Object.isFrozen(data.servers[0]!.cells)).toBe(false);
    data.servers[0]!.cells[0]=2;
    expect(vnode.props.data.servers[0]!.cells[0]).toBe(2);
  });
});
