/** Exclusive union of main-thread trace intervals within the two input markers.
 * This is a documented trace calculation, not DevTools UI Summary output.
 * Node built-ins only. node lab/dev/summarize-fiber-traces.mjs <results-dir>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const directory = process.argv[2] ?? '/private/tmp/fiber-b1-results';
const categories = {
  Scripting: new Set(['FunctionCall', 'EvaluateScript', 'EvaluateModule', 'EventDispatch', 'RunMicrotasks', 'V8.Execute', 'TimerFire', 'FireAnimationFrame']),
  Rendering: new Set(['UpdateLayoutTree', 'RecalculateStyles', 'Layout', 'PrePaint', 'Layerize', 'UpdateLayerTree']),
  Painting: new Set(['Paint', 'PaintImage', 'CompositeLayers', 'Commit']),
};
const rows = [];
const manifest = JSON.parse(await readFile(`${directory}/trace-info.json`, 'utf8'));
for (const { mode, scenario = 'S2', filename, markerStart = 'B1-input-start', markerEnd = 'B1-input-end' } of manifest) {
  const events = JSON.parse(gunzipSync(await readFile(`${directory}/${filename}`))).traceEvents;
  const start = events.find((e) => e.name === markerStart);
  const end = events.find((e) => e.name === markerEnd);
  if (!start || !end || end.ts <= start.ts) throw new Error(`Missing markers: ${mode}`);
  const edges = [];
  for (const event of events) {
    if (event.pid !== start.pid || event.tid !== start.tid || event.ph !== 'X') continue;
    const category = Object.keys(categories).find((key) => categories[key].has(event.name));
    if (!category || !event.dur) continue;
    const from = Math.max(event.ts, start.ts), to = Math.min(event.ts + event.dur, end.ts);
    if (to > from) edges.push([from, category, 1], [to, category, -1]);
  }
  edges.sort((a, b) => a[0] - b[0]);
  const active = { Scripting: 0, Rendering: 0, Painting: 0 };
  const micros = { Scripting: 0, Rendering: 0, Painting: 0, OtherOrIdle: 0 };
  const segments = [];
  let previous = start.ts;
  for (const [time, category, delta] of [...edges, [end.ts, 'Scripting', 0]]) {
    const owner = active.Painting ? 'Painting' : active.Rendering ? 'Rendering' : active.Scripting ? 'Scripting' : 'OtherOrIdle';
    micros[owner] += time - previous;
    if (time > previous) segments.push({ from: previous, to: time, owner });
    active[category] += delta;
    previous = time;
  }
  const durationMs = (end.ts - start.ts) / 1000;
  const tasks = events.filter((e) => e.pid === start.pid && e.tid === start.tid && e.name === 'RunTask' && e.ph === 'X' && e.ts < end.ts && e.ts + e.dur > start.ts)
    .map((task) => {
      const from = Math.max(start.ts, task.ts), to = Math.min(end.ts, task.ts + task.dur);
      const ms = { Scripting: 0, Rendering: 0, Painting: 0, OtherOrIdle: 0 };
      for (const s of segments) ms[s.owner] += Math.max(0, Math.min(to, s.to) - Math.max(from, s.from)) / 1000;
      return { from, durationMs: (to - from) / 1000, ...ms };
    });
  rows.push({ mode, scenario, durationMs,
    categories: Object.fromEntries(Object.entries(micros).map(([key, us]) => [key, { ms: us / 1000, percent: us / (end.ts - start.ts) * 100 }])),
    taskDiagnostics: {
      scriptingOver50Count: tasks.filter((t) => t.Scripting > 50).length,
      maxScriptingPerTaskMs: Math.max(0, ...tasks.map((t) => t.Scripting)),
      maxRenderingPaintingPerTaskMs: Math.max(0, ...tasks.map((t) => t.Rendering + t.Painting)),
      tasks,
    },
  });
}
await writeFile(`${directory}/trace-summary.json`, JSON.stringify({
  definition: 'Marker-bounded main-thread exclusive union. Painting > Rendering > Scripting; remaining time OtherOrIdle. Not DevTools UI Summary.',
  categories: Object.fromEntries(Object.entries(categories).map(([name, values]) => [name, [...values]])),
  rows,
}, null, 2));
console.log(JSON.stringify(rows, null, 2));
