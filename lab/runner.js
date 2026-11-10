/**
 * 시나리오 러너와 결과 표. Vanilla DOM으로 그린다.
 *
 * - 매 실행 전에 앱을 처음 상태로 다시 마운트해 실행끼리 같은 데이터에서 시작하게 한다.
 * - 시나리오마다 엔진별 워밍업 1회를 먼저 돌리고 버린다(JIT, 레이아웃 캐시).
 * - 엔진이 여럿이면 실행 단위로 번갈아 돈다: stack, fiber, stack, fiber …
 *   한 엔진을 몰아서 돌리면 그동안의 기기 상태 변화(발열, 클럭)가 한쪽에만 실린다.
 */
import { isNon60Hz } from './metrics.js';
import { SCENARIOS, createScenarioContext } from './scenarios.js';
import { averageRuns } from './stats.js';

/** 표에 보일 열. [키, 이름, 소수 자릿수]. 나머지 값은 JSON에 모두 들어간다. */
export const TABLE_COLUMNS = [
  ['updateCount', '업데이트 수', 0],
  ['updateMean', '렌더+커밋 평균(ms)', 1],
  ['updateMax', '렌더+커밋 최대(ms)', 1],
  ['renderMean', '렌더(ms)', 1],
  ['commitMean', 'diff+patch(ms)', 1],
  ['patchMean', 'patch 수', 0],
  ['longTaskCount', 'Long Task 수', 1],
  ['longTaskMax', '최장 Long Task(ms)', 1],
  ['inputP95', '입력 지연 p95(ms)', 1],
  ['inputEventP95', '└ 발사 시각 기준', 1],
  ['clickP95', '클릭 지연 p95(ms)', 1],
  ['clickEventP95', '└ 발사 시각 기준', 1],
  ['frameP95', '프레임 p95(ms)', 1],
  ['framesJank', '끊긴 프레임', 1],
  ['progressFps', '진행 바 fps', 1],
  ['progressDropped', '진행 바 끊김', 1],
];

/**
 * 측정 환경. 브라우저에서 얻을 수 있는 것만 기록한다.
 * @param {ReturnType<import('./metrics.js').createMetrics>} metrics
 */
export async function collectEnvironment(metrics) {
  const refreshHz = await metrics.calibrateRefresh();
  /** @type {{ charging: boolean | null, level: number | null }} */
  let power = { charging: null, level: null };
  try {
    const nav = /** @type {any} */ (navigator);
    if (nav.getBattery) {
      const b = await nav.getBattery();
      power = { charging: b.charging, level: b.level };
    }
  } catch {
    // 지원하지 않으면 null로 남긴다.
  }
  let browserVersion = null;
  try {
    const uaData = /** @type {any} */ (navigator).userAgentData;
    if (uaData?.getHighEntropyValues) {
      const v = await uaData.getHighEntropyValues(['fullVersionList', 'platformVersion']);
      browserVersion = v.fullVersionList?.map((b) => `${b.brand} ${b.version}`).join(', ') ?? null;
    }
  } catch {
    browserVersion = null;
  }
  return {
    measuredAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    browserVersion,
    refreshHz,
    refreshWarning: isNon60Hz(refreshHz),
    power,
    viewport: `${innerWidth}x${innerHeight}`,
    devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    longTaskSupported: metrics.longTaskSupported,
  };
}

/**
 * @param {{
 *   metrics: ReturnType<import('./metrics.js').createMetrics>,
 *   host: {
 *     isImplemented: (mode: string) => boolean,
 *     activate: (mode: string) => void,
 *     resetApp: () => Promise<void>,
 *   },
 *   info: { size: number, seed: number, cellCost: number },
 *   onScenario?: (id: string | null, engine: string | null) => void,
 * }} options
 */
export function createRunner({ metrics, host, info, onScenario }) {
  let running = false;
  /** @type {any[]} */
  const results = [];

  /** 한 번 실행하고 요약을 돌려준다. */
  async function runOnce(scenario, mode, run) {
    host.activate(mode);
    await host.resetApp();
    const ctx = createScenarioContext({ metrics, seed: info.seed * 1000 + run });
    metrics.start();
    await scenario.run(ctx);
    return metrics.stop();
  }

  /**
   * @param {string} id
   * @param {number} runs 워밍업 제외 반복 수
   * @param {readonly string[]} engines
   */
  async function runScenario(id, runs, engines) {
    const scenario = SCENARIOS[id];
    if (!scenario) throw new Error(`알 수 없는 시나리오: ${id}`);
    if (running) throw new Error('이미 실행 중입니다');
    const modes = engines.filter((m) => host.isImplemented(m));
    const skipped = engines.filter((m) => !host.isImplemented(m));
    if (modes.length === 0) throw new Error(`실행할 수 있는 엔진이 없습니다: ${engines.join(', ')}`);

    running = true;
    try {
      const environment = await collectEnvironment(metrics);
      // 워밍업: 엔진마다 1회, 결과는 버린다.
      for (const mode of modes) {
        onScenario?.(`${id} 워밍업`, mode);
        await runOnce(scenario, mode, -1);
      }
      /** @type {Record<string, any[]>} */
      const perEngine = Object.fromEntries(modes.map((m) => [m, []]));
      for (let run = 0; run < runs; run++) {
        for (const mode of modes) {
          onScenario?.(`${id} ${run + 1}/${runs}`, mode);
          perEngine[mode].push(await runOnce(scenario, mode, run));
        }
      }
      const created = modes.map((mode) => ({
        scenario: id,
        title: scenario.title,
        description: scenario.description,
        engine: mode,
        ...info,
        runs,
        warmupDiscarded: 1,
        order: modes.length > 1 ? 'alternating' : 'single',
        skippedEngines: skipped,
        environment,
        average: averageRuns(perEngine[mode]),
        perRun: perEngine[mode],
      }));
      results.push(...created);
      return created;
    } finally {
      running = false;
      onScenario?.(null, null);
    }
  }

  return {
    results,
    runScenario,
    isRunning: () => running,
  };
}

/** 숫자 표시. NaN은 "측정 불가"(지원 안 됨) 또는 "-"(해당 없음) */
export function formatValue(key, value, digits) {
  if (typeof value !== 'number' || Number.isNaN(value)) return key.startsWith('longTask') ? '측정 불가' : '-';
  return value.toFixed(digits);
}

/**
 * 결과 표를 그린다. 주사율이 60Hz가 아니면 행에 경고를 붙인다.
 * @param {HTMLElement} root
 * @param {any[]} results
 */
export function renderResults(root, results) {
  root.replaceChildren();
  if (results.length === 0) {
    root.textContent = '아직 결과가 없습니다.';
    return;
  }
  if (results.some((r) => r.environment?.refreshWarning)) {
    const warn = document.createElement('p');
    warn.className = 'warn';
    warn.textContent = '⚠ 60Hz가 아닌 화면에서 측정한 결과가 있습니다. 프레임 예산과 끊김 기준이 달라 60Hz 결과와 바로 비교할 수 없습니다.';
    root.appendChild(warn);
  }
  const table = document.createElement('table');
  table.className = 'results';
  const head = table.createTHead().insertRow();
  for (const label of ['시나리오', '엔진', '셀 수', '주사율', '반복', ...TABLE_COLUMNS.map((c) => c[1])]) {
    const th = document.createElement('th');
    th.textContent = label;
    head.appendChild(th);
  }
  const body = table.createTBody();
  for (const r of results) {
    const row = body.insertRow();
    const hz = r.environment?.refreshHz;
    const hzText = `${Number.isFinite(hz) ? hz : '?'}Hz${r.environment?.refreshWarning ? ' ⚠' : ''}`;
    for (const v of [r.scenario, r.engine, r.size.toLocaleString(), hzText, `${r.runs}(+워밍업 ${r.warmupDiscarded})`]) {
      row.insertCell().textContent = v;
    }
    for (const [key, , digits] of TABLE_COLUMNS) {
      row.insertCell().textContent = formatValue(key, r.average[key], digits);
    }
  }
  root.appendChild(table);
}

/** 결과 JSON 내려받기 */
export function downloadJson(results, filename = 'lab-results.json') {
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 개발 서버에 결과를 저장한다(vite.config.ts의 /__lab/results). 개발 서버가 아니면 실패한다.
 * @returns {Promise<string>} 저장된 파일 경로
 */
export async function saveToDevServer(results) {
  const response = await fetch('/__lab/results', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(results, null, 2),
  });
  if (!response.ok) throw new Error(`저장 실패: HTTP ${response.status}`);
  return (await response.json()).path;
}
