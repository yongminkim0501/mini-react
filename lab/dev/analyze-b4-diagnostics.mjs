/** Reproduce diagnostic summaries without touching runtime code. */
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {percentile} from '../stats.js';
const dir=process.argv[2];if(!dir)throw Error('Expected result directory');
const load=async path=>{
 try{const b=await readFile(path);return JSON.parse(path.endsWith('.gz')?gunzipSync(b).toString():b.toString());}
 catch(e){if(e.code!=='ENOENT'||path.endsWith('.gz'))throw e;return JSON.parse(gunzipSync(await readFile(path+'.gz')).toString());}
};
const baseline=await load(process.argv[3]??'docs/results/fiber-bailout-b4/fiber-bailout-cross.json');
const mean=a=>{const valid=a.filter(Number.isFinite);return valid.length?valid.reduce((s,x)=>s+x,0)/valid.length:null;};
const merge=segments=>{
 const sorted=segments.filter(([s,e])=>e>s).sort((a,b)=>a[0]-b[0]),out=[];
 for(const [s,e] of sorted){const last=out.at(-1);if(last&&s<=last[1])last[1]=Math.max(e,last[1]);else out.push([s,e]);}return out;
};
const length=segments=>merge(segments).reduce((s,[a,b])=>s+b-a,0);
function finalAttempt(r) {
 const {events,calls}=r.trace,s=r.summary;
 const commit=events.find(e=>e.type==='commit'&&e.t===s.raw.finalHeatmap.commitAt);assert(commit?.lane===4);
 const own=e=>e.rootId===commit.rootId&&e.attemptId===commit.attemptId;
 const start=events.find(e=>own(e)&&e.type==='renderStart').t,end=commit.t;
 const clipped=call=>[Math.max(start,call.start),Math.min(end,call.end)];
 const target=length(calls.filter(own).map(clipped));
 const progress=length(calls.filter(c=>c.label==='progress').map(clipped));
 const other=length(calls.filter(c=>c.label!=='progress'&&!own(c)).map(clipped));
 const state=calls.find(own);assert.equal(state.matchQuery,'deploy-1742 err-503');
 const sync=events.filter(e=>e.rootId===commit.rootId&&e.type==='commit'&&e.lane===1&&e.t<end).at(-1);
 const aborts=events.filter(e=>e.rootId===commit.rootId&&e.type==='renderAbort'&&e.t>=s.raw.startedAt&&e.t<start);
 const result={engine:r.engine,run:r.runIndex+1,rootId:commit.rootId,attemptId:commit.attemptId,matchQuery:state.matchQuery,
   start,end,syncCommit:sync.t,syncToStartMs:start-sync.t,renderWorkMs:commit.renderActiveMs,workMs:commit.activeMs,
   commitWorkMs:commit.activeMs-commit.renderActiveMs,elapsedMs:end-start,
   slices:events.filter(e=>own(e)&&e.type==='renderSlice').length,
   targetRunSliceMs:target,progressMs:progress,otherLaneMs:other,browserGapMs:end-start-target-progress-other,
   progressSlices:calls.filter(c=>c.label==='progress'&&clipped(c)[1]>clipped(c)[0]).length,
   sameQueryAborted:aborts.filter(e=>e.matchQuery===state.matchQuery).map(e=>({attemptId:e.attemptId,t:e.t,activeMs:e.activeMs})),
   discardedBeforeSyncMs:aborts.filter(e=>e.t<=sync.t).reduce((v,e)=>v+e.activeMs,0),
   abortsAfterSync:aborts.filter(e=>e.t>sync.t).length,
   discardedRunSliceAfterInteractionMs:length(calls.filter(c=>c.rootId===commit.rootId&&aborts.some(e=>e.attemptId===c.attemptId)).map(c=>[Math.max(s.raw.interactionEnd.at,c.start),Math.min(end,c.end)])),
   interactionEndToSyncMs:sync.t-s.raw.interactionEnd.at,commitToFrameMs:s.raw.finalHeatmap.frameAt-end,
   settleMs:s.heatmapSettleMs,warnings:s.warnings};
 assert(result.browserGapMs>=-0.001);
 assert(Math.abs(result.interactionEndToSyncMs+result.syncToStartMs+result.elapsedMs+result.commitToFrameMs-result.settleMs)<0.001);
 return result;
}
let attemptRaw,attemptMethod='single-run diagnostic API';
try{attemptRaw=await load(join(dir,'attempt-original.json'));attemptMethod='existing runner.runScenario';}
catch(e){if(e.code!=='ENOENT')throw e;attemptRaw=await load(join(dir,'attempt.json'));}
const attempts=attemptRaw.rows.map(finalAttempt);assert.equal(attempts.length,6);
const original=[];
for(const r of baseline.results.filter(r=>r.scenario==='S2'&&r.appVariant==='cached'&&r.engine!=='stack'))for(const [i,s] of r.perRun.entries()){
 const u=s.raw.updates.at(-1);assert.equal(u.lane,4);
 const aid=s.raw.renderSlices.at(-1).attemptId;
 const sync=s.raw.updates.filter(u=>u.lane===1).at(-1);
 original.push({engine:r.engine,run:i+1,syncToStartMs:u.t-u.total-sync.t,workMs:u.activeMs,renderWorkMs:u.renderActiveMs,
  elapsedMs:u.total,browserAndOtherGapMs:u.total-u.activeMs,slices:s.raw.renderSlices.filter(a=>a.attemptId===aid).length,
  settleMs:s.heatmapSettleMs,discardedMs:s.discardedTransitionMs});
}
const requested=baseline.results.find(r=>r.scenario==='S2'&&r.appVariant==='current'&&r.engine==='fiber-bailout');
const stable=requested.perRun.filter(r=>!r.warnings.includes('in-run-refresh-unstable'));
const warningCheck={perRun:requested.perRun.map((r,i)=>({run:i+1,unstable:r.warnings.includes('in-run-refresh-unstable'),p95:r.inputP95,inputs:r.inputCount,preRunHz:r.preRunHz,observedHz:r.refreshHzObserved})),
  allRunP95Mean:mean(requested.perRun.map(r=>r.inputP95)),warningFreeRunP95Mean:mean(stable.map(r=>r.inputP95)),
  allPooledP95:percentile(requested.perRun.flatMap(r=>r.raw.input.map(i=>i.main)),95),
  warningFreePooledP95:percentile(stable.flatMap(r=>r.raw.input.map(i=>i.main)),95),warningFreeRuns:stable.length};
let trace=[];
try {
 const tr=await load(join(dir,'trace.json'));
 for(const r of tr.rows){
  const a=finalAttempt(r),raw=JSON.parse(gunzipSync(await readFile(join(dir,r.traceFilename))));
  const es=raw.traceEvents,marker=es.find(e=>e.name===r.clockMarker);assert(marker);
  const offset=marker.ts/1000-r.clockMarkMs;
  const main=es.find(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain'&&e.pid===marker.pid);
  const ownCalls=r.trace.calls.filter(c=>c.rootId===a.rootId&&c.attemptId===a.attemptId).map(c=>[c.start,c.end]);
  const overlap=(parts,blocks)=>parts.flatMap(([s,e])=>blocks.map(([x,y])=>[Math.max(s,x),Math.min(e,y)]));
  const rendering=['UpdateLayoutTree','RecalculateStyles','Layout','PrePaint','Paint','Layerize','CompositeLayers'];
  const spans=es.filter(e=>e.ph==='X'&&e.pid===marker.pid&&(!main||e.tid===main.tid)&&rendering.includes(e.name)).map(e=>[Math.max(a.start,e.ts/1000-offset),Math.min(a.end,(e.ts+e.dur)/1000-offset)]).filter(([s,e])=>e>s);
  const browserRenderingMs=length(spans),renderingInOwnCallsMs=length(overlap(spans,ownCalls));
  const renderingInAnyEngineCallsMs=length(overlap(spans,r.trace.calls.map(c=>[c.start,c.end])));
  trace.push({...a,traceFilename:r.traceFilename,clockOffsetMs:offset,browserRenderingMs,renderingInOwnCallsMs,renderingInAnyEngineCallsMs,
    renderingInGapMs:browserRenderingMs-renderingInAnyEngineCallsMs,
    renderingOutsideOwnCallsMs:browserRenderingMs-renderingInOwnCallsMs,
    byCategory:Object.fromEntries(rendering.map(name=>[name,length(es.filter(e=>e.ph==='X'&&e.name===name&&e.pid===marker.pid&&(!main||e.tid===main.tid)).map(e=>[Math.max(a.start,e.ts/1000-offset),Math.min(a.end,(e.ts+e.dur)/1000-offset)]))]))});
 }
} catch(e){if(e.code!=='ENOENT')throw e;}
let production=[],productionValidation=null,productionLanes=[];
try{
 const p=await load(join(dir,'production.json'));
 if(p.rows.length===72){
  for(const r of p.rows){assert.equal(Boolean(r.summary.counterTotals),r.counters==='on');assert.equal(r.summary.pendingInputCount,0);assert.equal(r.summary.pendingClickCount,0);}
  for(const scenario of ['S1','S3','S2'])for(const app of ['current','cached']){
   const avg=(counter,engine,key)=>{const rr=p.rows.filter(r=>r.scenario===scenario&&r.appVariant===app&&r.counters===counter&&r.engine===engine);assert.equal(rr.length,3);return mean(rr.map(r=>r.summary[key]));};
   const row={scenario,app};
   for(const mode of ['on','off']){
    const f=avg(mode,'fiber','activeMean'),b=avg(mode,'fiber-bailout','activeMean');
    row[mode]={fiberMs:f,bailoutMs:b,increasePercent:(b/f-1)*100};
   }
   row.increaseDifferencePp=row.off.increasePercent-row.on.increasePercent;
   production.push(row);
  }
  for(const scenario of ['S1','S3','S2'])for(const app of ['current','cached'])for(const counters of ['on','off'])for(const engine of ['fiber','fiber-bailout']){
    const rows=p.rows.filter(r=>r.scenario===scenario&&r.appVariant===app&&r.counters===counters&&r.engine===engine);
    productionLanes.push({scenario,app,counters,engine,commits:mean(rows.map(r=>r.summary.updateCount)),
      syncCommits:mean(rows.map(r=>r.summary.syncUpdateCount)),
      transitionCommits:mean(rows.map(r=>r.summary.raw.updates.filter(u=>u.lane===4&&!u.mounted).length)),
      syncRenderMs:mean(rows.map(r=>r.summary.syncRenderActiveMean)),syncActiveMs:mean(rows.map(r=>r.summary.syncUpdateActiveMean)),
      inputP95:mean(rows.map(r=>r.summary.inputP95)),clickP95:mean(rows.map(r=>r.summary.clickP95)),
      warnings:rows.flatMap(r=>r.summary.warnings.map(w=>[r.runIndex+1,w]))});
  }
  productionValidation={runs:p.rows.length,provenance:p.provenance,warnings:p.rows.filter(r=>r.summary.warnings.length).map(r=>({scenario:r.scenario,app:r.appVariant,engine:r.engine,counters:r.counters,run:r.runIndex+1,warnings:r.summary.warnings})),order:p.rows.map(r=>[r.scenario,r.runIndex,r.appVariant,r.engine,r.counters])};
 }
} catch(e){if(e.code!=='ENOENT')throw e;}
const result={attemptMethod,original,attempts,warningCheck,trace,production,productionLanes,productionValidation};
await writeFile(join(dir,'analysis.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({attempts:attempts.length,traces:trace.length,productionRows:production.length,warningCheck},null,2));
