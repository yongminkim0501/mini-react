/** Node built-ins + Chrome CDP only. Start Vite :5181 and a headed Chrome :9331.
 * node lab/dev/measure-fiber-sync.mjs [output-dir]
 * Chrome traces import directly into DevTools Performance; benchmark runs do not trace.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const isB2 = process.argv.includes('--b2');
const engines = isB2 ? ['stack', 'fiber-sync', 'fiber-slice'] : ['stack', 'fiber-sync'];
const output = process.argv[2] ?? '/private/tmp/fiber-b1-results';
const provenance = {
  codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  cpuThrottle: 1,
  headed: true,
  viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
};
await mkdir(output, { recursive: true });
const pages = await (await fetch('http://127.0.0.1:9331/json/list')).json();
const page = pages.find((p) => p.type === 'page');
if (!page) throw new Error('No measurement page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let seq = 0;
const pending = new Map();
const watchers = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const item = pending.get(message.id); pending.delete(message.id);
    if (message.error) item?.reject(new Error(JSON.stringify(message.error)));
    else item?.resolve(message.result);
  } else {
    for (const fn of watchers.get(message.method) ?? []) fn(message.params);
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
function once(method) {
  return new Promise((resolve) => {
    const callback = (value) => { watchers.set(method, (watchers.get(method) ?? []).filter((f) => f !== callback)); resolve(value); };
    watchers.set(method, [...(watchers.get(method) ?? []), callback]);
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function navigate(query) {
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: `http://127.0.0.1:5181/lab/pages/heatmap.html?${query}` });
  await loaded;
  await send('Page.bringToFront');
}
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
  // Explicitly disable artificial CPU/network throttling, leave display refresh/power unchanged.
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await navigate(`engines=${engines.join(',')}&size=20000&seed=42&cellCost=0&runs=3&autorun=1`);
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const status = await evaluate('window.__lab && ({done:__lab.done,error:__lab.error,results:__lab.results.length})');
    if (status?.error) throw new Error(status.error);
    if (status?.done) break;
    await delay(2000);
  }
  const lab = await evaluate('JSON.parse(JSON.stringify(window.__lab))');
  if (!lab?.done) throw new Error('Benchmark timeout');
  await writeFile(`${output}/${isB2 ? 'fiber-slice' : 'fiber-sync'}-cross.json`, JSON.stringify({ ...lab, provenance }, null, 2));
  console.log(JSON.stringify(lab.results.map((r) => ({ scenario: r.scenario, engine: r.engine, update: r.average.updateMean, longest: r.average.longTaskMax }))));
  const traceInfo = [];
  for (const mode of isB2 ? ['stack', 'fiber-slice'] : ['stack', 'fiber-sync']) {
    for (const scenario of isB2 ? ['S2', 'S4'] : ['S2']) {
      await navigate(`engine=${mode}&size=20000&seed=42&cellCost=0`);
      await delay(3500);
      if (scenario === 'S2') {
        await evaluate(`(async()=>{const i=document.querySelector('#search');for(const value of ['x','']){i.value=value;i.dispatchEvent(new Event('input',{bubbles:true}));await __lab.waitForIdle();}i.focus();})()`);
      } else {
        await evaluate(`(async()=>{document.querySelector('#regen').click();await __lab.waitForIdle();})()`);
      }
      const seedBefore = await evaluate(`document.querySelector('#regen').textContent`);
      await send('Tracing.start', {
        categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,v8.execute',
        transferMode: 'ReturnAsStream',
      });
      const markerStart = isB2 ? `B2-${scenario}-start` : 'B1-input-start';
      const markerEnd = isB2 ? `B2-${scenario}-end` : 'B1-input-end';
      await evaluate(`performance.mark('${markerStart}')`);
      if (scenario === 'S2') {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', text: 'd', unmodifiedText: 'd', windowsVirtualKeyCode: 68 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
      } else await evaluate(`document.querySelector('#regen').click()`);
      await evaluate(`(async()=>{await __lab.waitForIdle();performance.mark('${markerEnd}');})()`);
      const completed = once('Tracing.tracingComplete'); await send('Tracing.end');
      const { stream } = await completed;
      let raw = '';
      for (;;) {
        const chunk = await send('IO.read', { handle: stream });
        raw += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data;
        if (chunk.eof) break;
      }
      await send('IO.close', { handle: stream });
      const filename = `${mode}-20k-${scenario}-${scenario === 'S2' ? 'key' : 'receive'}.trace.json.gz`;
      await writeFile(`${output}/${filename}`, gzipSync(raw));
      const environment = await evaluate(`(async()=>{const b=await navigator.getBattery?.();return {ua:navigator.userAgent,power:b?{charging:b.charging,level:b.level}:null,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,echo:document.querySelector('#echo').textContent,seedAfter:document.querySelector('#regen').textContent};})()`);
      traceInfo.push({ mode, scenario, filename, markerStart, markerEnd, seedBefore, environment });
      console.log(`Saved ${filename}`);
    }
  }
  await writeFile(`${output}/trace-info.json`, JSON.stringify(traceInfo, null, 2));
} finally { socket.close(); }
