import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFiberBailoutEngine, createFiberEngine, h, useEffect, useMemo, useState } from './index';
import { runWithLane, SyncLane } from './lanes';
import { SliceScheduler } from './scheduler';
import type { EngineEvent } from './types';
import type { Child } from '../runtime/types';

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
function harness(component: () => Child, bailout = true) {
  let clock=0;
  vi.spyOn(performance,'now').mockImplementation(()=>clock+=0.05);
  const tasks: (()=>void)[]=[], micros: (()=>void)[]=[];
  const scheduler=new SliceScheduler(()=>performance.now(),fn=>tasks.push(fn),true,fn=>micros.push(fn));
  const engine=(bailout?createFiberBailoutEngine:createFiberEngine)(scheduler);
  const events:EngineEvent[]=[];
  const container=document.createElement('div');document.body.append(container);
  const root=engine.createRoot(component,container,{label:'heatmap'});
  engine.subscribe(e=>events.push(e));
  const sync=()=>{let guard=10000;while(micros.length&&--guard)micros.shift()!();expect(guard).toBeGreaterThan(0);};
  const pump=()=>{let guard=10000;while((tasks.length||micros.length)&&--guard){sync();tasks.shift()?.();}expect(guard).toBeGreaterThan(0);};
  root.mount();pump();
  return {root,engine,container,events,tasks,micros,sync,pump,
    update:(fn:()=>void)=>{runWithLane(SyncLane,fn);sync();},
    dispose:()=>{root.unmount();engine.dispose();}};
}

describe('single-host committed VComponent identity bailout',()=>{
  it.each(['text','insert','delete'] as const)('survives four hits then a deep %s miss using historical alternates',kind=>{
    let query!:(n:number)=>void, change!:(n:number)=>void;
    let calls=0, clicks:string[]=[];
    function Leaf({version}:{version:number}) {calls++;return h('article',null,h('section',null,h('button',{onClick:()=>clicks.push(`v${version}`)},`v${version}`),
      kind==='insert'&&version ? h('b',null,'added') : null,
      kind==='delete'&&!version ? h('i',null,'remove') : null));}
    const f=harness(()=>{const[q,sq]=useState(0);query=sq;const[v,sv]=useState(0);change=sv;
      const node=useMemo(()=>h(Leaf,{version:v}),[v]);return h('main',null,h('output',null,q),node);});
    try {
      const article=f.container.querySelector('article');
      for(let i=1;i<=4;i++){f.update(()=>query(i));expect(calls).toBe(1);expect(f.container.querySelector('article')).toBe(article);}
      f.container.querySelector('button')!.click();expect(clicks).toEqual(['v0']);
      f.update(()=>change(1));expect(calls).toBe(2);
      expect(f.container.querySelector('button')!.textContent).toBe('v1');
      f.container.querySelector('button')!.click();expect(clicks).toEqual(['v0','v1']);
      expect(Boolean(f.container.querySelector('b'))).toBe(kind==='insert');
      expect(f.container.querySelector('i')).toBeNull();
      f.update(()=>query(5));expect(calls).toBe(2);
      f.update(()=>change(2));expect(calls).toBe(3);
      expect(f.container.querySelector('button')!.textContent).toBe('v2');
    } finally {f.dispose();}
  });
  it('keeps nested transparent boundary records across outer hits and repairs a miss',()=>{
    let tick!:(n:number)=>void,outer!:(n:number)=>void;let innerCalls=0,outerCalls=0;
    const inner=h(()=>{innerCalls++;return h('p',null,h('em',null,'inner'));},{});
    function Outer(){outerCalls++;return inner;}
    const f=harness(()=>{const[q,sq]=useState(0);tick=sq;const[v,sv]=useState(0);outer=sv;
      const node=useMemo(()=>h(Outer,{version:v}),[v]);return h('main',null,q,node);});
    try {for(let i=1;i<=4;i++)f.update(()=>tick(i));expect(innerCalls).toBe(1);expect(outerCalls).toBe(1);
      f.update(()=>outer(1));expect(outerCalls).toBe(2);expect(innerCalls).toBe(1);expect(f.container.textContent).toBe('4inner');
    }finally{f.dispose();}
  });
  it.each(['text','array','null'] as const)('falls back for %s and merges adjacent transparent text',kind=>{
    let update!:(n:number)=>void,calls=0;
    const node=h(()=>{calls++;return kind==='text'?'B':kind==='array'?[h('i',null,'B'),h('b',null,'C')]:null;},{});
    const f=harness(()=>{const[n,s]=useState(0);update=s;return h('main',null,'A',node,'Z',n);});
    try {f.update(()=>update(1));expect(calls).toBe(2);expect(f.container.innerHTML).toBe(kind==='text'?'<main>ABZ1</main>':kind==='array'?'<main>A<i>B</i><b>C</b>Z1</main>':'<main>AZ1</main>');
      const c=f.events.filter(e=>e.type==='commit').at(-1)!.counters!;
      expect(c.total.bailoutMissFallbackShape).toBe(1);expect(c.total.bailoutHits).toBe(0);
    }finally{f.dispose();}
  });
  it('rejects relocation even if the VComponent object is unchanged',()=>{
    let move!:(v:boolean)=>void,calls=0;
    const node=h(()=>{calls++;return h('i',null,'node');},{});
    const f=harness(()=>{const[m,s]=useState(false);move=s;return h('main',null,m?h('b',null,'new'):null,node);});
    try{f.update(()=>move(true));expect(calls).toBe(2);expect(f.container.innerHTML).toBe('<main><b>new</b><i>node</i></main>');
      expect(f.events.filter(e=>e.type==='commit').at(-1)!.counters!.total.bailoutMissDifferentPosition).toBe(1);
    }finally{f.dispose();}
  });
  it('does not share identities across different host parents',()=>{
    let move!:(v:boolean)=>void,calls=0;
    const node=h(()=>{calls++;return h('i',null,'node');},{});
    const f=harness(()=>{const[m,s]=useState(false);move=s;return h('main',null,h('section',null,m?null:node),h('aside',null,m?node:null));});
    try{f.update(()=>move(true));expect(calls).toBe(2);expect(f.container.innerHTML).toBe('<main><section></section><aside><i>node</i></aside></main>');}finally{f.dispose();}
  });
  it('preserves inherited ancestor keys on a reused header without walking its children',()=>{
    let change!:(v:number)=>void,calls=0;
    const node=h(()=>{calls++;return h('i',null,h('b',null,'child'));},{});
    const Outer=()=>node;
    const f=harness(()=>{const[n,s]=useState(0);change=s;return h('main',null,h(Outer,{key:String(n)}));});
    try{f.update(()=>change(1));expect(calls).toBe(1);expect(f.container.querySelector('i')!.getAttribute('data-key')).toBe('1');}finally{f.dispose();}
  });
  it('treats nested in-place mutation + same VNode as a contract violation; a new VNode updates',()=>{
    let tick!:(n:number)=>void,fresh!:(n:number)=>void;const data={value:'old'};
    const Child=({data:d}:{data:typeof data})=>h('p',null,d.value);
    const f=harness(()=>{const[q,sq]=useState(0);tick=sq;const[v,sv]=useState(0);fresh=sv;
      const node=useMemo(()=>h(Child,{data}),[v]);return h('main',null,q,node);});
    try{data.value='mutated';f.update(()=>tick(1));expect(f.container.querySelector('p')!.textContent).toBe('old');
      f.update(()=>fresh(1));expect(f.container.querySelector('p')!.textContent).toBe('mutated');}finally{f.dispose();}
  });
  it('records zero internal Render, Commit, child calls and DOM writes for a Heatmap hit',()=>{
    let set!:(n:number)=>void;
    const node=h(()=>h('section',{id:'heatmap'},Array.from({length:80},()=>h('i',null,'cell'))),{});
    const f=harness(()=>{const[n,s]=useState(0);set=s;return h('main',null,h('output',null,n),node);});
    try{f.update(()=>set(1));const c=f.events.filter(e=>e.type==='commit').at(-1)!.counters!;
      expect(c.inside.bailoutHits).toBe(1);
      for(const key of ['childCalls','renderFiberVisits','renderWorkUnits','commitFiberVisits','liveDomWrites','eventHandlerWrites'] as const)expect(c.inside[key],key).toBe(0);
      expect(c.total.bailoutMisses).toBe(c.total.bailoutMissDifferentVComponent+c.total.bailoutMissDifferentPosition+c.total.bailoutMissFallbackShape);
      for(const key of Object.keys(c.total) as (keyof typeof c.total)[])expect(c.total[key]).toBe(c.inside[key]+c.outside[key]);
    }finally{f.dispose();}
  });
});

/** Compare semantic state versions, never pair nth Commit (preemption changes Commit counts). */
it('replays a fixed-seed mixed script against a state-version DOM/title oracle in both engines',()=>{
  type Model={version:number;selected:number;shape:number;text:string};
  const versions=new Map<number,Model>();let seed=0xB400;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const script=Array.from({length:40},(_,i)=>({version:i+1,selected:random()%4,shape:random()%4,text:`v${i+1}-${random()%100}`}));
  const initial={version:0,selected:0,shape:0,text:'initial'};for(const m of [initial,...script])versions.set(m.version,m);
  const oracle=(m:Model,q:number)=>`<main><output>${q}</output>${m.shape===0?`<section id="heatmap"><button>${m.text}/${m.selected}</button>${'<i>cell</i>'.repeat(80)}</section>`:m.shape===1?`${m.text}`:m.shape===2?`<b>${m.text}</b><i>${m.selected}</i>`:''}</main>`;
  for(const bailout of [false,true]){
    let setModel!:(m:Model)=>void,setQuery!:(n:number)=>void;let effects=0;
    function Shape({model:m}:{model:Model}){
      return m.shape===0?h('section',{id:'heatmap'},h('button',null,`${m.text}/${m.selected}`),Array.from({length:80},()=>h('i',null,'cell'))):m.shape===1?m.text:m.shape===2?[h('b',null,m.text),h('i',null,m.selected)]:null;
    }
    const f=harness(()=>{const[m,sm]=useState(initial);setModel=sm;const[q,sq]=useState(0);setQuery=sq;
      useEffect(()=>{effects++;document.title=`${m.version}/${q}`;},[m,q]);
      const node=useMemo(()=>h(Shape,{model:m}),[m]);return h('main',null,h('output',null,q),node);},bailout);
    let checked=0;
    const check=()=>{f.root.instance.flushPassiveEffects();const hooks=f.root.instance.current!.hooks;
      const m=hooks[0]!,q=hooks[1]!;if(m.kind!=='state'||q.kind!=='state')throw Error('state');
      const model=m.value as Model;expect(model).toBe(versions.get(model.version));
      expect(f.container.innerHTML).toBe(oracle(versions.get(model.version)!,q.value as number));
      expect(document.title).toBe(`${model.version}/${q.value}`);checked++;};
    f.engine.subscribe(e=>{if(e.type==='commit')f.micros.push(check);});
    try {check();for(const m of script){
      f.engine.startTransition(()=>setModel(m));
      // Some attempts expand and yield before a Sync input; others batch naturally.
      if(m.version%3===0)f.tasks.shift()?.();
      f.update(()=>setQuery(m.version));
      if(m.version%4===0)f.update(()=>setModel(m)); // click/reclick equivalent: same chosen state version
      f.pump();
    }expect(checked).toBeGreaterThan(60);expect(effects).toBeGreaterThan(40);
      expect(f.events.some(e=>e.type==='renderAbort')).toBe(true);
      for(const e of f.events.filter(e=>e.type==='renderAbort'))expect(e.counters?.total.renderWorkUnits).toBeGreaterThan(0);
    }finally{f.dispose();}
  }
});
