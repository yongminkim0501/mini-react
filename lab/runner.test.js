import { describe, expect, it } from 'vitest';
import { createRunner } from './runner.js';

/** 측정 없이 호출 순서만 기록하는 가짜 metrics */
function fakeMetrics(log) {
  return {
    longTaskSupported: false,
    calibrateRefresh: async () => 60,
    start: () => log.push('start'),
    stop: async () => ({ updateMean: 1 }),
  };
}

describe('러너', () => {
  it('엔진별 워밍업 1회 후 실행 단위로 번갈아 돈다', async () => {
    const log = [];
    let active = null;
    const runner = createRunner({
      metrics: /** @type {any} */ (fakeMetrics([])),
      host: {
        isImplemented: (m) => m !== 'fiber-slice',
        activate: (m) => {
          active = m;
        },
        resetApp: async () => {},
      },
      info: { size: 2000, seed: 1, cellCost: 0 },
      scenarios: { X: { title: 'X', description: '', run: async () => log.push(active) } },
    });
    const results = await runner.runScenario('X', 2, ['stack', 'fiber-slice', 'fiber']);
    // 워밍업(stack, fiber) → run1(stack, fiber) → run2(stack, fiber)
    expect(log).toEqual(['stack', 'fiber', 'stack', 'fiber', 'stack', 'fiber']);
    expect(results.map((r) => r.engine)).toEqual(['stack', 'fiber']);
    expect(results[0]).toMatchObject({ runs: 2, warmupDiscarded: 1, order: 'alternating', skippedEngines: ['fiber-slice'] });
    expect(results[0].perRun).toHaveLength(2);
    expect(results[0].environment.refreshHz).toBe(60);
  });

  it('실행할 수 있는 엔진이 없으면 오류', async () => {
    const runner = createRunner({
      metrics: /** @type {any} */ (fakeMetrics([])),
      host: { isImplemented: () => false, activate: () => {}, resetApp: async () => {} },
      info: { size: 2000, seed: 1, cellCost: 0 },
      scenarios: { X: { title: 'X', description: '', run: async () => {} } },
    });
    await expect(runner.runScenario('X', 1, ['fiber'])).rejects.toThrow('실행할 수 있는 엔진이 없습니다');
  });
});

it('alternates all six app/engine configurations after one warmup each', async () => {
  const log=[];let active;
  const runner=createRunner({
    metrics:fakeMetrics([]), appVariants:['current','cached'],
    host:{isImplemented:()=>true, activate:(mode,app)=>{active=`${app}/${mode}`;},resetApp:async()=>{}},
    info:{size:20000,seed:42,cellCost:0},
    scenarios:{X:{title:'X',description:'',run:async()=>log.push(active)}},
  });
  const results=await runner.runScenario('X',3,['stack','fiber','fiber-bailout']);
  const order=['current/stack','current/fiber','current/fiber-bailout','cached/stack','cached/fiber','cached/fiber-bailout'];
  expect(log).toEqual([...order,...order,...order,...order]);
  expect(results.map(r=>`${r.appVariant}/${r.engine}`)).toEqual(order);
  for(const result of results){expect(result.perRun).toHaveLength(3);expect(result.warmupDiscarded).toBe(1);}
});
