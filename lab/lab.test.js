import { describe, expect, it } from 'vitest';
import {
  MINUTE_COUNT,
  NEW_VERSION,
  OLD_VERSION,
  ROLLOUT_START,
  clampSize,
  generateData,
  matchCells,
  minuteLabel,
} from './data.js';
import { burn, calibrate } from './load.js';
import { estimateRefreshHz, frameBudgetMs, isNon60Hz, summarizeSession } from './metrics.js';
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
    expect(data.servers.length * data.servers[0].cells.length).toBe(5000);
    expect(data.servers[0].cells.length).toBe(MINUTE_COUNT);
  });

  it('서버 이름과 분 라벨', () => {
    const data = generateData(2000, 1);
    expect(data.servers[0].name).toMatch(/^web-(ne|nw|se|sw|c)-\d{2}$/);
    expect(new Set(data.servers.map((s) => s.id)).size).toBe(data.servers.length);
    expect(minuteLabel(0)).toBe('14:00');
    expect(minuteLabel(99)).toBe('15:39');
  });

  it('검색은 태그 부분 문자열, 빈 검색어는 null', () => {
    const data = generateData(2000, 7);
    expect(matchCells(data, '  ')).toBeNull();
    const tag = data.servers[0].cells[0].tag;
    expect(matchCells(data, tag)?.[0][0]).toBe(true);
  });
});

describe('장애 시나리오', () => {
  const data = generateData(20000, 42);

  it('배포 전에는 이전 버전, 배포 후에는 새 버전이다 (되돌아가지 않음)', () => {
    for (const server of data.servers) {
      expect(server.deployAt).toBeGreaterThanOrEqual(ROLLOUT_START);
      server.cells.forEach((cell, m) => {
        expect(cell.version).toBe(m >= server.deployAt ? NEW_VERSION : OLD_VERSION);
      });
    }
  });

  it('배포가 계단식으로 퍼진다: 여러 시점에 나뉘어 배포된다', () => {
    const times = new Set(data.servers.map((s) => s.deployAt));
    expect(times.size).toBeGreaterThan(5);
  });

  it('err-503은 새 배포를 받은 영향 서버에서만 난다', () => {
    let count = 0;
    for (const server of data.servers) {
      for (const cell of server.cells) {
        if (cell.status === 'err-503') {
          count++;
          expect(cell.version).toBe(NEW_VERSION);
          expect(server.affected).toBe(true);
        }
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it('영향 서버는 배포 후 지연이 오른다', () => {
    const affected = data.servers.filter((s) => s.affected);
    const unaffected = data.servers.filter((s) => !s.affected);
    expect(affected.length).toBeGreaterThan(0);
    const late = (servers) => {
      const values = servers.flatMap((s) => s.cells.slice(-10).map((c) => c.value));
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    expect(late(affected)).toBeGreaterThan(late(unaffected) * 2);
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

describe('주사율과 프레임 예산', () => {
  it('rAF 간격 중앙값으로 추정한다', () => {
    expect(estimateRefreshHz([16.6, 16.7, 16.7, 33.4, 16.6])).toBe(60);
    expect(estimateRefreshHz([8.3, 8.4, 8.3])).toBe(120);
    expect(estimateRefreshHz([])).toBeNaN();
  });

  it('예산과 60Hz 경고', () => {
    expect(frameBudgetMs(60)).toBeCloseTo(16.67, 1);
    expect(frameBudgetMs(120)).toBeCloseTo(8.33, 1);
    expect(frameBudgetMs(NaN)).toBeCloseTo(16.67, 1);
    expect(isNon60Hz(60)).toBe(false);
    expect(isNon60Hz(59)).toBe(false);
    expect(isNon60Hz(120)).toBe(true);
    expect(isNon60Hz(NaN)).toBe(true);
  });

  it('끊긴 프레임은 예산의 2배 초과로 센다', () => {
    const session = {
      startedAt: 0,
      frames: [10, 20, 30, 40],
      frameEnds: [10, 30, 60, 100],
      longTasks: [],
      input: [{ main: 300, event: 100 }],
      click: [],
      updates: [],
      progressCommits: [0, 10, 40, 60],
    };
    const at60 = summarizeSession(session, 100, true, 1000 / 60);
    expect(at60.framesJank).toBe(1); // 40 > 33.3
    expect(at60.progressDropped).toBe(0);
    const at120 = summarizeSession(session, 100, true, 1000 / 120);
    expect(at120.framesJank).toBe(3); // 20, 30, 40 > 16.7
    expect(at120.progressDropped).toBe(2); // 30, 20 > 16.7
    expect(at60.inputP95).toBe(300);
    expect(at60.inputEventP95).toBe(100);
  });
});

describe('URL 파라미터', () => {
  it('기본값과 해석', () => {
    expect(parseParams('')).toMatchObject({ engine: 'stack', engines: ['stack'], size: 20000, seed: 42, cellCost: 0, runs: 3, autorun: false, save: false });
    expect(parseParams('?engine=fiber&size=5000&seed=7&cellCost=0.01&scenario=S2&runs=2&autorun=1&hud=record&save=1')).toEqual({
      engine: 'fiber',
      engines: ['fiber'],
      size: 5000,
      seed: 7,
      cellCost: 0.01,
      scenario: 'S2',
      runs: 2,
      autorun: true,
      hud: 'record',
      save: true,
    });
  });

  it('engines는 engine보다 우선하고 중복을 없앤다', () => {
    expect(parseParams('?engine=fiber&engines=stack, fiber,stack')).toMatchObject({ engine: 'stack', engines: ['stack', 'fiber'] });
  });
});
