import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFiberEngine, h, useEffect, useMemo, useState } from './index';
import { DefaultLane, getCurrentLane, runWithLane, SyncLane, TransitionLane } from './lanes';
import { SliceScheduler } from './scheduler';
import { rebaseUpdates } from './updateQueue';
import type { EngineEvent } from './types';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

function lab() {
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock += 0.5);
  const tasks: (() => void)[] = [], microtasks: (() => void)[] = [];
  const scheduler = new SliceScheduler(() => performance.now(), (fn) => tasks.push(fn), true, (fn) => microtasks.push(fn));
  const engine = createFiberEngine(scheduler);
  const events: EngineEvent[] = [];
  engine.subscribe((event) => events.push(event));
  const container = document.createElement('div'); document.body.append(container);
  const pumpSync = () => { let guard=1000; while(microtasks.length && --guard) microtasks.shift()!(); expect(guard).toBeGreaterThan(0); };
  const pump = () => {
    let guard=10000;
    while ((tasks.length || microtasks.length) && --guard) { pumpSync(); tasks.shift()?.(); }
    expect(guard).toBeGreaterThan(0);
  };
  return { engine, container, tasks, events, pump, pumpSync };
}

describe('lane queue rebase', () => {
  it('spends the remaining host budget after a short higher-priority root, without starving Transition', () => {
    let clock=0, work=0;
    const tasks:(()=>void)[]=[],order:string[]=[];
    const scheduler=new SliceScheduler(()=>clock,(fn)=>tasks.push(fn),true);
    const low={getPriority:()=>TransitionLane,runSlice:(yieldNow:()=>boolean)=>{
      order.push('transition');do{work++;clock+=1;}while(work<10&&!yieldNow());return work<10;
    }};
    const high={getPriority:()=>DefaultLane,runSlice:()=>{order.push('default');clock+=0.1;return false;}};
    try {
      scheduler.enqueue(low);scheduler.enqueue(high);tasks.shift()!();
      expect(order).toEqual(['default','transition']);expect(work).toBe(5);
    } finally {scheduler.dispose();}
  });
  it('preserves non-commutative replacement order and replayed Sync actions', () => {
    const sync = rebaseUpdates(0, [{lane:TransitionLane,action:10},{lane:SyncLane,action:1}],SyncLane);
    expect(sync.value).toBe(1); expect(sync.baseState).toBe(0);
    expect(sync.baseQueue.map((u)=>u.lane)).toEqual([TransitionLane,0]);
    expect(rebaseUpdates(sync.baseState,sync.baseQueue,TransitionLane).value).toBe(1);
    const mixed = rebaseUpdates(0,[{lane:TransitionLane,action:(n:number)=>n+10},{lane:SyncLane,action:(n:number)=>n+1}],SyncLane);
    expect(mixed.value).toBe(1);
    expect(rebaseUpdates(mixed.baseState,mixed.baseQueue,TransitionLane).value).toBe(11);
  });
  it('matches sequential evaluation for mixed lanes across many deterministic queues', () => {
    for (let seed=0;seed<60;seed++) {
      const updates=Array.from({length:9},(_,i)=>({lane:[SyncLane,DefaultLane,TransitionLane][(i+seed)%3]!,action:i%3===0 ? i-seed : (n:number)=>n*2+i}));
      let result: ReturnType<typeof rebaseUpdates>={value:0,baseState:0,baseQueue:updates};
      for (const lane of [SyncLane,DefaultLane,TransitionLane]) result=rebaseUpdates(result.baseState,result.baseQueue,lane);
      const expected=updates.reduce((n,u)=>typeof u.action==='function'?u.action(n):u.action,0);
      expect(result.value).toBe(expected); expect(result.baseQueue).toEqual([]);
    }
  });
  it('restores priority after nested callbacks and exceptions', () => {
    expect(getCurrentLane()).toBe(DefaultLane);
    runWithLane(SyncLane,()=>{
      expect(getCurrentLane()).toBe(SyncLane);
      expect(()=>runWithLane(TransitionLane,()=>{throw new Error('test');})).toThrow();
      expect(getCurrentLane()).toBe(SyncLane);
    });
    expect(getCurrentLane()).toBe(DefaultLane);
  });
});

describe('fiber priorities and abandoned work', () => {
  it('uses Sync for native handlers and Transition only inside startTransition', () => {
    const {engine,container,events,pump,pumpSync}=lab();
    const root=engine.createRoot(()=>{
      const[q,setQ]=useState('old');const[m,setM]=useState('old');
      return h('button',{onClick:()=>{setQ('new');engine.startTransition(()=>setM('new'));}},`${q}/${m}`);
    },container,{label:'test'});
    try {
      root.mount();pump();events.length=0;
      container.querySelector('button')!.click();pumpSync();
      expect(container.textContent).toBe('new/old');expect(getCurrentLane()).toBe(DefaultLane);
      pump();expect(container.textContent).toBe('new/new');
      expect(events.filter((e)=>e.type==='commit').map((e)=>e.lane)).toEqual([SyncLane,TransitionLane]);
    } finally {root.unmount();engine.dispose();}
  });
  it('aborts a Transition without changing DOM/handlers/hooks/effects, commits Sync, then restarts Transition', () => {
    const {engine,container,tasks,events,pump,pumpSync}=lab();
    let setQuery!:(v:string)=>void, setMatch!:(v:string)=>void;
    const seen:string[]=[], effects:string[]=[];
    const root=engine.createRoot(()=>{
      const [query,q]=useState('');setQuery=q;
      const [match,m]=useState('');setMatch=m;
      const cached=useMemo(()=>({value:match}),[match]);
      useEffect(()=>{effects.push(`${query}/${match}`);},[query,match]);
      return h('div',null,h('button',{onClick:()=>seen.push(`${query}/${match}`)},`${query}/${cached.value}`),
        Array.from({length:40},()=>h('i',null,match)));
    },container,{label:'heatmap'});
    const commits:string[]=[];
    engine.subscribe((e)=>{if(e.type==='commit')commits.push(container.querySelector('button')!.textContent!);});
    try {
      root.mount();pump();root.instance.flushPassiveEffects();commits.length=0;events.length=0;
      const button=container.querySelector('button')!, current=root.instance.current;
      engine.startTransition(()=>setMatch('deferred'));
      tasks.shift()!();
      expect(container.querySelector('button')).toBe(button);expect(button.textContent).toBe('/');
      button.click();expect(seen).toEqual(['/']);
      expect(root.instance.current).toBe(current);expect(current!.hooks[1]!.kind==='state' && current!.hooks[1]!.value).toBe('');
      expect(effects).toEqual(['/']);
      runWithLane(SyncLane,()=>setQuery('urgent'));pumpSync();
      expect(commits).toEqual(['urgent/']);
      expect(events.some((e)=>e.type==='renderAbort' && e.lane===TransitionLane)).toBe(true);
      expect(effects).toEqual(['/']);
      const hook=root.instance.current!.hooks[1]!;
      expect(hook.kind==='state' && hook.baseQueue.map((u)=>u.lane)).toEqual([TransitionLane]);
      button.click();expect(seen.at(-1)).toBe('urgent/');
      pump();root.instance.flushPassiveEffects();
      expect(commits).toEqual(['urgent/','urgent/deferred']);
      expect(effects).toEqual(['/','urgent/','urgent/deferred']);
      expect(events.filter((e)=>e.type==='renderStart' && e.lane===TransitionLane)).toHaveLength(2);
    } finally {root.unmount();engine.dispose();}
  });

  it('mixed updates on the same Hook converge in original order, including literal no-ops', () => {
    const {engine,container,pump,pumpSync}=lab();
    let set!:(v:number|((n:number)=>number))=>void;
    const root=engine.createRoot(()=>{const[n,s]=useState(0);set=s;return h('p',null,n);},container,{label:'test'});
    try {
      root.mount();pump();engine.startTransition(()=>set(10));runWithLane(SyncLane,()=>set(0));pumpSync();
      expect(container.textContent).toBe('0');pump();expect(container.textContent).toBe('0');
      engine.startTransition(()=>set((n)=>n+10));runWithLane(SyncLane,()=>set((n)=>n+1));pumpSync();
      expect(container.textContent).toBe('1');pump();expect(container.textContent).toBe('11');
    } finally {root.unmount();engine.dispose();}
  });

  it('continuous Transitions converge without dropping actions or forcing same-lane restarts', () => {
    const {engine,container,tasks,pump}=lab();let set!:(v:number|((n:number)=>number))=>void;
    const root=engine.createRoot(()=>{const[n,s]=useState(0);set=s;return h('main',null,Array.from({length:30},()=>h('i',null,n)));},container,{label:'test'});
    try {
      root.mount();pump();engine.startTransition(()=>set(1));tasks.shift()!();
      engine.startTransition(()=>{set((n)=>n+1);set(9);set((n)=>n+1);});pump();
      expect(container.textContent).toBe('10'.repeat(30));
    } finally {root.unmount();engine.dispose();}
  });

  it('selects priorities across roots and does not yield within a Sync render', () => {
    const {engine,container,tasks,events,pump,pumpSync}=lab();const other=document.createElement('div');document.body.append(other);
    let setA!:(n:number)=>void,setB!:(n:number)=>void;
    const a=engine.createRoot(()=>{const[n,s]=useState(0);setA=s;return h('main',null,Array.from({length:30},()=>h('i',null,n)));},container,{label:'heatmap'});
    const b=engine.createRoot(()=>{const[n,s]=useState(0);setB=s;return h('p',null,n);},other,{label:'progress'});
    try {
      a.mount();b.mount();pump();events.length=0;
      engine.startTransition(()=>setA(1));tasks.shift()!();setB(1);pump();
      expect(events.filter((e)=>e.type==='commit').map((e)=>e.label)).toEqual(['progress','heatmap']);
      expect(events.some((e)=>e.type==='renderAbort')).toBe(false);
      events.length=0;runWithLane(SyncLane,()=>setA(2));pumpSync();
      expect(container.textContent).toBe('2'.repeat(30));
      expect(events.filter((e)=>e.type==='renderSlice' && e.label==='heatmap')).toHaveLength(1);
    } finally {a.unmount();b.unmount();engine.dispose();}
  });
});
