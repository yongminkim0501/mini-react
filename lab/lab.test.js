import { describe, expect, it } from 'vitest';
import { clampSize, generateData, matchCells } from './data.js';
import { burn, calibrate } from './load.js';
import { parseParams } from './params.js';
import { mulberry32 } from './prng.js';
import { averageRuns, percentile, summarize } from './stats.js';

describe('percentile', () => {
  it('정렬 후 선형 보간한다', () => {
    const values = [5, 1, 4, 2, 3];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 50)).toBe(3);
    expect(percentile(values, 100)).toBe(5);
    expect(percentile(values, 25)).toBe(2);
    expect(percentile([10, 20], 95)).toBeCloseTo(19.5);
  });

  it('빈 배열은 NaN, 원본은 바꾸지 않는다', () => {
    expect(percentile([], 50)).toBeNaN();
    const values = [3, 1, 2];
    percentile(values, 50);
    expect(values).toEqual([3, 1, 2]);
  });

  it('summarize와 averageRuns', () => {
    expect(summarize([1, 2, 3, 4])).toMatchObject({ count: 4, mean: 2.5, max: 4 });
    expect(averageRuns([{ a: 1, b: NaN }, { a: 3, b: 4 }])).toEqual({ a: 2, b: 4 });
  });
});

describe('시드 기반 데이터', () => {
  it('같은 시드 → 같은 수열·같은 데이터', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
    expect(generateData(2000, 42)).toEqual(generateData(2000, 42));
  });

  it('다른 시드 → 다른 데이터', () => {
    expect(generateData(2000, 42)).not.toEqual(generateData(2000, 43));
  });

  it('셀 수는 범위와 단계에 맞춘다', () => {
    expect(clampSize(10)).toBe(2000);
    expect(clampSize(99999)).toBe(20000);
    expect(clampSize(10400)).toBe(10000);
    const data = generateData(5000, 1);
    expect(data.categories.length * data.categories[0].cells.length).toBe(5000);
  });

  it('검색은 태그 부분 문자열, 빈 검색어는 null', () => {
    const data = generateData(2000, 7);
    expect(matchCells(data, '  ')).toBeNull();
    const tag = data.categories[0].cells[0].tag;
    expect(matchCells(data, tag)?.[0][0]).toBe(true);
  });
});

describe('burn', () => {
  it('burn(2)가 burn(1)보다 오래 걸린다 (중앙값 비교)', () => {
    calibrate({ samples: 3, iterations: 500_000 });
    const time = (ms) => {
      const samples = [];
      for (let i = 0; i < 7; i++) {
        const start = performance.now();
        burn(ms);
        samples.push(performance.now() - start);
      }
      return percentile(samples, 50);
    };
    burn(1); // 워밍업
    expect(time(2)).toBeGreaterThan(time(1));
  });

  it('0 이하이면 아무것도 하지 않는다', () => {
    expect(burn(0)).toBe(0);
    expect(burn(-1)).toBe(0);
  });
});

describe('URL 파라미터', () => {
  it('기본값과 해석', () => {
    expect(parseParams('')).toMatchObject({ engine: 'stack', size: 10000, seed: 42, cellCost: 0, runs: 3, autorun: false });
    expect(parseParams('?engine=fiber&size=5000&seed=7&cellCost=0.01&scenario=S2&runs=2&autorun=1&hud=record')).toEqual({
      engine: 'fiber',
      size: 5000,
      seed: 7,
      cellCost: 0.01,
      scenario: 'S2',
      runs: 2,
      autorun: true,
      hud: 'record',
    });
  });
});
