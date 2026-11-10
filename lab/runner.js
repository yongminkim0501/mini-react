/**
 * 시나리오 러너와 결과 표. Vanilla DOM으로 그린다.
 * 매 실행 전에 앱을 처음 상태로 다시 마운트해 실행끼리 같은 데이터에서 시작하게 한다.
 */
import { SCENARIOS, createScenarioContext } from './scenarios.js';
import { averageRuns } from './stats.js';

/** 표에 보일 열. 나머지 값은 JSON에 모두 들어간다. */
export const TABLE_COLUMNS = [
  ['updateCount', '업데이트 수', 0],
  ['updateMean', '업데이트당 렌더+커밋 평균(ms)', 1],
  ['updateMax', '업데이트 최대(ms)', 1],
  ['renderMean', '렌더 평균(ms)', 1],
  ['commitMean', 'diff+patch 평균(ms)', 1],
  ['patchMean', 'patch 수 평균', 0],
  ['longTaskCount', 'Long Task 수', 1],
  ['longTaskMax', '최장 Long Task(ms)', 1],
  ['frameP95', '프레임 p95(ms)', 1],
  ['frameMax', '프레임 최대(ms)', 1],
  ['framesOver33', '33ms 초과 프레임', 1],
  ['inputP95', '입력 지연 p95(ms)', 1],
  ['inputFromIntendedP95', '입력 지연 p95, 예정 시각 기준(ms)', 1],
  ['clickP95', '클릭 지연 p95(ms)', 1],
  ['clickFromIntendedP95', '클릭 지연 p95, 예정 시각 기준(ms)', 1],
  ['progressFps', '진행 바 fps', 1],
  ['progressDropped', '진행 바 끊김(>33ms)', 1],
];

/**
 * @param {{
 *   metrics: ReturnType<import('./metrics.js').createMetrics>,
 *   resetApp: () => Promise<void>,
 *   info: { engine: string, size: number, seed: number, cellCost: number },
 *   onScenario?: (id: string | null) => void,
 * }} options
 */
export function createRunner({ metrics, resetApp, info, onScenario }) {
  let running = false;
  /** @type {any[]} */
  const results = [];

  /**
   * @param {string} id
   * @param {number} runs
   */
  async function runScenario(id, runs) {
    const scenario = SCENARIOS[id];
    if (!scenario) throw new Error(`알 수 없는 시나리오: ${id}`);
    if (running) throw new Error('이미 실행 중입니다');
    running = true;
    onScenario?.(id);
    try {
      const perRun = [];
      for (let run = 0; run < runs; run++) {
        await resetApp();
        const ctx = createScenarioContext({ metrics, seed: info.seed * 1000 + run });
        metrics.start();
        await scenario.run(ctx);
        perRun.push(await metrics.stop());
      }
      const result = {
        scenario: id,
        title: scenario.title,
        description: scenario.description,
        ...info,
        runs,
        userAgent: navigator.userAgent,
        finishedAt: new Date().toISOString(),
        average: averageRuns(perRun),
        perRun,
      };
      results.push(result);
      return result;
    } finally {
      running = false;
      onScenario?.(null);
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
 * 결과 표를 그린다.
 * @param {HTMLElement} root
 * @param {any[]} results
 */
export function renderResults(root, results) {
  root.replaceChildren();
  if (results.length === 0) {
    root.textContent = '아직 결과가 없습니다.';
    return;
  }
  const table = document.createElement('table');
  table.className = 'results';
  const head = table.createTHead().insertRow();
  for (const label of ['시나리오', '엔진', '셀 수', 'cellCost', '반복', ...TABLE_COLUMNS.map((c) => c[1])]) {
    const th = document.createElement('th');
    th.textContent = label;
    head.appendChild(th);
  }
  const body = table.createTBody();
  for (const r of results) {
    const row = body.insertRow();
    for (const v of [r.scenario, r.engine, r.size.toLocaleString(), String(r.cellCost), String(r.runs)]) {
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
