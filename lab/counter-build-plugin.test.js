import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {parseSync} from 'rolldown/utils';
import {stripCounters} from './dev/counter-build-plugin.js';
describe('measurement-only counter erasure',()=>{
 for(const file of ['root','workLoop','commit','dom'])it(`removes counters from ${file}, preserving product operations`,()=>{
  const source=readFileSync(`src/fiber/${file}.ts`,'utf8');
  const {code,edits}=stripCounters(source,`${file}.ts`);expect(edits).toBeGreaterThan(0);expect(parseSync(`${file}.ts`,code).errors).toEqual([]);
  expect(code).not.toMatch(/\bcount\??\.?(?:\(|\s*\()/);expect(code).not.toMatch(/\bnewCounters\(/);
  expect(code).not.toMatch(/\b(?:inside|relocated|visit|byVNode)\s*=/);expect(code).not.toContain('boundaryVNodes');
  for(const op of ['createElement','createElementNS','createTextNode','setAttribute','removeAttribute','syncFormProp','addEventListener','removeChild','insertBefore','appendChild','replaceChildren','commitRoot','performUnitOfWork','diffProps','renderRoot','setEvent']) {
   expect((code.match(new RegExp(`\\b${op}\\(`,'g'))??[]).length,op).toBe((source.match(new RegExp(`\\b${op}\\(`,'g'))??[]).length);
  }
 });
});
