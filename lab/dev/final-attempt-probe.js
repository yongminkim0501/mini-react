/** Opt-in diagnostic only. Observes existing methods/events without changing results or queues. */
import { FiberRoot } from '../../src/fiber/root.ts';
const original = FiberRoot.prototype.runSlice;
const roots = new WeakMap();
let sequence=0;
const trace = { events:[], calls:[], clear() { this.events.length=0; this.calls.length=0; } };
window.__b4AttemptProbe=trace;
const state = root => {
  if(root.label!=='heatmap') return null;
  const hooks=(root.workInProgress ?? root.current)?.hooks;
  return {query:hooks?.[0]?.value,matchQuery:hooks?.[1]?.value};
};
FiberRoot.prototype.runSlice = function(...args) {
  let id=roots.get(this);
  if(!id) {
    roots.set(this,id=++sequence);
    const emit=this.emit;
    this.emit=event=>{
      const {root,counters,...plain}=event;
      trace.events.push({...plain,rootId:id,...((event.type==='renderAbort')?state(this):{})});
      emit(event);
    };
  }
  const start=performance.now();
  try {return original.apply(this,args);}
  finally {
    trace.calls.push({rootId:id,label:this.label,attemptId:this.attempt,lane:this.renderLane,
      start,end:performance.now(),...state(this)});
  }
};
