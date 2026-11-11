/** Read-only Chrome trace analysis. No page/app/CSS changes. */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const directory = process.argv[2] ?? '/private/tmp/fiber-b3-verified';
const manifest = JSON.parse(await readFile(`${directory}/diagnostic-info.json`, 'utf8'));
const rows = [];
const group = (entries, key) => {
  const groups = new Map();
  for (const entry of entries) {
    const name = key(entry), previous = groups.get(name) ?? { name, count:0, durationMs:0 };
    previous.count++; previous.durationMs += (entry.dur ?? 0) / 1000;
    groups.set(name, previous);
  }
  return [...groups.values()].sort((a,b)=>b.count-a.count);
};
for (const info of manifest) {
  const all = JSON.parse(gunzipSync(await readFile(`${directory}/${info.filename}`))).traceEvents;
  const start = all.find((e)=>e.name === info.markerStart), end = all.find((e)=>e.name === info.markerEnd);
  if (!start || !end) throw new Error(`Missing diagnostic markers: ${info.filename}`);
  const events = all.filter((e)=>e.pid===start.pid && e.tid===start.tid && e.ts>=start.ts && e.ts<=end.ts);
  const layouts = events.filter((e)=>e.name==='Layout' && e.ph==='X').map((e)=>({
    atMs:(e.ts-start.ts)/1000, durationMs:e.dur/1000,
    dirtyObjects:e.args?.beginData?.dirtyObjects, totalObjects:e.args?.beginData?.totalObjects,
    partialLayout:e.args?.beginData?.partialLayout, roots:e.args?.endData?.layoutRoots,
  }));
  const paints = events.filter((e)=>e.name==='Paint' && e.ph==='X');
  const invalidations = events.filter((e)=>e.name.includes('InvalidationTracking'));
  const data = (e)=>e.args?.data ?? {};
  const heatmap = (e)=>/\b(heatmap|row|cell)\b/.test(data(e).nodeName ?? '');
  rows.push({
    mode:info.mode, action:info.action, filename:info.filename, durationMs:(end.ts-start.ts)/1000,
    mutations:info.mutations,
    progressMutationMarks:events.filter((e)=>e.name==='diag-progress-mutation').length,
    heatmapMutationMarks:events.filter((e)=>e.name==='diag-heatmap-mutation').length,
    layouts,
    paints:group(paints,(e)=>data(e).nodeName ?? '?'),
    paintEvents:paints.map((e)=>({atMs:(e.ts-start.ts)/1000,durationMs:e.dur/1000,...data(e)})),
    invalidationTypes:group(invalidations,(e)=>e.name),
    invalidationNodes:group(invalidations,(e)=>data(e).nodeName ?? '?'),
    heatmapNamedInvalidations:invalidations.filter(heatmap).length,
    progressNamedInvalidations:invalidations.filter((e)=>/progress/.test(data(e).nodeName ?? '')).length,
    layoutInvalidationReasons:group(invalidations.filter((e)=>e.name==='LayoutInvalidationTracking'),(e)=>data(e).reason ?? '?'),
    styleRecalcElementCounts:events.filter((e)=>e.name==='UpdateLayoutTree'&&e.ph==='X').map((e)=>e.args?.elementCount),
  });
}
await writeFile(`${directory}/layout-diagnostic-summary.json`,JSON.stringify({
  definition:'Main-thread marker-bounded events; heatmapNamedInvalidations matches heatmap/row/cell node names, not every descendant by ID. document Paint/Layout does not prove every cell was recomputed or rasterized.', rows,
},null,2));
console.log(JSON.stringify(rows.map((r)=>({mode:r.mode,action:r.action,mutations:r.mutations,layouts:r.layouts.length,dirtyMax:Math.max(0,...r.layouts.map((l)=>l.dirtyObjects??0)),heatmapNamedInvalidations:r.heatmapNamedInvalidations,progressNamedInvalidations:r.progressNamedInvalidations,paints:r.paints})),null,2));
