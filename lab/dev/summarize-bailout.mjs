/** Recompute B-4 counters and acceptance checks from preserved attempt data. Node built-ins only.
 * node lab/dev/summarize-bailout.mjs <fiber-bailout-cross.json> <output-directory>
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const [input, output] = process.argv.slice(2);
assert(input && output, 'Expected raw JSON path and output directory');
const { results } = JSON.parse(await readFile(input, 'utf8'));
assert.equal(results.length, 24);
const scopes = ['total', 'inside', 'outside'];
const statuses = ['committed', 'sync', 'aborted'];
const keys = Object.keys(results.flatMap(r => r.perRun).flatMap(r => r.raw.updates).find(a => a.counters).counters.total);
const attempts = (r, status) => r.perRun.flatMap(run => status === 'aborted' ? run.raw.aborts : run.raw.updates)
  .filter(a => !a.mounted && (status !== 'sync' || a.lane === 1));
const sum = (r, status, scope) => r.engine === 'stack' ? null : Object.fromEntries(keys.map(k => [k,
  attempts(r, status).reduce((n, a) => n + a.counters[scope][k], 0)]));
const checks = { configurations: results.length, runs: 0, pendingInteractions: [], counterInvariantFailures: [],
  abortedDomWriteFailures: [], cachedS2SyncInternalNonzero: [], refreshWarnings: [] };
for (const scenario of ['S1','S2','S3','S4']) for (const app of ['current','cached']) for (const engine of ['stack','fiber','fiber-bailout']) {
  assert.equal(results.filter(r => r.scenario === scenario && r.appVariant === app && r.engine === engine).length, 1);
}
for (const r of results) {
  assert.equal(r.warmupDiscarded, 1); assert.equal(r.perRun.length, 3);
  for (const [i, run] of r.perRun.entries()) {
    checks.runs++;
    const id = [r.scenario, r.appVariant, r.engine, i + 1];
    if (run.pendingInputCount || run.pendingClickCount) checks.pendingInteractions.push(id);
    if (run.warnings.length) checks.refreshWarnings.push([...id, run.warnings]);
    for (const [status, aa] of [['committed',run.raw.updates],['aborted',run.raw.aborts]]) for (const a of aa) {
      if (r.engine === 'stack') { assert(!a.counters); continue; }
      const c = a.counters; assert(c, 'Missing Fiber attempt counters');
      for (const k of keys) if (c.total[k] !== c.inside[k] + c.outside[k]) checks.counterInvariantFailures.push([...id,status,k]);
      for (const scope of scopes) {
        const b = c[scope];
        if (b.bailoutMisses !== b.bailoutMissDifferentVComponent + b.bailoutMissDifferentPosition + b.bailoutMissFallbackShape ||
            b.commitFiberVisits !== b.commitEffectVisits + b.commitAnchorSiblingVisits) checks.counterInvariantFailures.push([...id,status,scope]);
      }
      if (status === 'aborted' && c.total.liveDomWrites !== 0) checks.abortedDomWriteFailures.push(id);
      if (r.scenario === 'S2' && r.appVariant === 'cached' && r.engine === 'fiber-bailout' && a.lane === 1 && status === 'committed') {
        for (const k of ['childCalls','renderFiberVisits','renderWorkUnits','commitFiberVisits','liveDomWrites','detachedDomOps','eventHandlerWrites','bailoutMisses']) {
          if (c.inside[k] !== 0) checks.cachedS2SyncInternalNonzero.push([...id,k,c.inside[k]]);
        }
        assert.equal(c.inside.bailoutHits, 1, 'Sync must actually hit the Heatmap boundary');
      }
    }
  }
}
await mkdir(output, { recursive: true });
const csv = [['scenario','app','engine','status','scope','attempts',...keys].join(',')];
for (const r of results) for (const status of statuses) for (const scope of scopes) {
  const c = sum(r,status,scope);
  csv.push([r.scenario,r.appVariant,r.engine,status,scope,attempts(r,status).length,...keys.map(k => c?.[k] ?? 'N/A')].join(','));
}
await writeFile(join(output,'counters.csv'), csv.join('\n')+'\n');
await writeFile(join(output,'summary.json'), JSON.stringify(results.map(r => ({scenario:r.scenario,app:r.appVariant,engine:r.engine,average:r.average,
  counters:Object.fromEntries(statuses.map(status => [status,Object.fromEntries(scopes.map(scope => [scope,sum(r,status,scope)]))]))})),null,2)+'\n');
await writeFile(join(output,'validation.json'), JSON.stringify(checks,null,2)+'\n');
for (const key of ['pendingInteractions','counterInvariantFailures','abortedDomWriteFailures','cachedS2SyncInternalNonzero']) assert.equal(checks[key].length,0,key);
console.log(JSON.stringify(Object.fromEntries(Object.entries(checks).map(([k,v]) => [k,Array.isArray(v)?v.length:v]))));
