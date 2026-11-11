/** Measurement only, built-in Node/CDP. No application/engine commands are mutated.
 * node lab/dev/measure-b4-diagnostics.mjs <output-dir> <attempt|production|smoke>
 */
import {gzipSync} from 'node:zlib';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const output=process.argv[2],phase=process.argv[3];
if(!output||!['attempt','production','smoke','clean','trace'].includes(phase))throw Error('Expected output-dir and attempt|production|smoke');
await mkdir(output,{recursive:true});
const provenance={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),phase,headed:true,cpuThrottle:1};
const pages=()=>fetch('http://127.0.0.1:9331/json/list').then(r=>r.json());
async function connect(page) {
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let seq=0;const pending=new Map(),watchers=new Map();
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(JSON.stringify(m.error))):p?.resolve(m.result);}else{for(const fn of watchers.get(m.method)??[])fn(m.params);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++seq,{resolve,reject});ws.send(JSON.stringify({id:seq,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:2,mobile:false});
 await send('Emulation.setCPUThrottlingRate',{rate:1});
 return {send,evaluate,once:method=>new Promise(resolve=>watchers.set(method,[resolve])),close:()=>ws.close()};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const first=(await pages()).find(p=>p.type==='page');if(!first)throw Error('No Chrome page');
const master=await connect(first);
const clients=[];
async function page(port) {
 const {targetId}=await master.send('Target.createTarget',{url:'about:blank'});
 const p=(await pages()).find(p=>p.id===targetId);const c=await connect(p);clients.push(c);
 await c.send('Page.navigate',{url:`http://127.0.0.1:${port}/lab/pages/heatmap.html?engine=fiber&app=cached&size=20000&seed=42&cellCost=0`});
 await c.send('Page.bringToFront');
 for(let i=0;i<100;i++){await wait(100);if(await c.evaluate('Boolean(window.__lab?.measureRun)'))break;}
 await c.evaluate('__lab.waitForIdle()');await wait(2000);await c.evaluate('__lab.suspend()');return c;
}
const rows=[];
async function run(c,scenario,engine,appVariant,runIndex,counters) {
 await c.send('Page.bringToFront');await wait(100);
 if(phase==='attempt'||phase==='trace')await c.evaluate('__b4AttemptProbe.clear()');
 console.log(JSON.stringify({phase,scenario,engine,appVariant,run:runIndex,counters,at:new Date().toISOString()}));
 const record=await c.evaluate(`__lab.measureRun(${JSON.stringify(scenario)},${JSON.stringify(engine)},${JSON.stringify(appVariant)},${runIndex})`);
 if(phase==='attempt'||phase==='trace')record.trace=await c.evaluate('({events:__b4AttemptProbe.events,calls:__b4AttemptProbe.calls})');
 record.counters=counters;record.runIndex=runIndex;
 if(runIndex>=0){rows.push(record);await writeFile(`${output}/${phase}.json`,JSON.stringify({provenance,rows},null,2));}
 await c.evaluate('__lab.suspend()');return record;
}
try {
 if(phase==='clean'){
  for(const p of await pages())if(p.type==='page'&&/^http:\/\/127\.0\.0\.1:518[23]\//.test(p.url))await master.send('Target.closeTarget',{targetId:p.id});
 }else if(phase==='attempt'||phase==='trace'){
  const c=await page(5181);await c.evaluate("import('/lab/dev/final-attempt-probe.js')");
  for(const engine of ['fiber','fiber-bailout'])await run(c,'S2',engine,'cached',-1,'on');
  if(phase==='attempt')for(let i=0;i<3;i++)for(const engine of ['fiber','fiber-bailout'])await run(c,'S2',engine,'cached',i,'on');
  else for(const engine of ['fiber','fiber-bailout']) {
    await c.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReturnAsStream'});
    const marker=`B4D-anchor-${engine}`;
    const markMs=await c.evaluate(`performance.mark(${JSON.stringify(marker)}).startTime`);
    const r=await run(c,'S2',engine,'cached',0,'on');
    const done=c.once('Tracing.tracingComplete');await c.send('Tracing.end');const {stream}=await done;
    let raw='';for(;;){const part=await c.send('IO.read',{handle:stream});raw+=part.base64Encoded?Buffer.from(part.data,'base64').toString():part.data;if(part.eof)break;}
    await c.send('IO.close',{handle:stream});
    const filename=`final-attempt-${engine}.trace.json.gz`;await writeFile(`${output}/${filename}`,gzipSync(raw));
    Object.assign(r,{traceFilename:filename,clockMarker:marker,clockMarkMs:markMs});
    await writeFile(`${output}/trace.json`,JSON.stringify({provenance,rows},null,2));
  }
 }else{
  const on=await page(5182),off=await page(5183);
  if(phase==='smoke'){
   const snapshots=[];
   for(const [c,counters] of [[on,'on'],[off,'off']])for(const engine of ['fiber','fiber-bailout']) {
    await c.send('Page.bringToFront');
    const probe=await c.evaluate(`(async()=>{const run=await __lab.measureRun('S2',${JSON.stringify(engine)},'cached',0);const cell=document.querySelector('#heatmap .cell');cell.click();await __lab.waitForIdle();document.querySelector('#heatmap .cell').click();await __lab.waitForIdle();await new Promise(r=>setTimeout(r,50));return {run,html:document.querySelector('#app-root').innerHTML,title:document.title,seq:document.querySelector('#detail').dataset.seq};})()`);
    snapshots.push({engine,counters,...probe});await c.evaluate('__lab.suspend()');
   }
   await writeFile(`${output}/smoke.json`,JSON.stringify({provenance,snapshots},null,2));
  }else{
   const configs=['current','cached'].flatMap(app=>['fiber','fiber-bailout'].flatMap(engine=>[{c:on,counters:'on',engine,app},{c:off,counters:'off',engine,app}]));
   for(const scenario of ['S1','S3','S2']){
    for(const x of configs)await run(x.c,scenario,x.engine,x.app,-1,x.counters);
    for(let i=0;i<3;i++)for(const x of configs)await run(x.c,scenario,x.engine,x.app,i,x.counters);
   }
  }
 }
 console.log(`COMPLETE ${phase}: ${rows.length} measured runs`);
}finally{for(const c of clients)c.close();master.close();}
