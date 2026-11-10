/**
 * 히트맵 탐색기 페이지 진입점. 엔진·앱·측정 도구를 연결한다.
 * 앱 두 개(히트맵, 진행 바)는 엔진으로, 러너·결과 표·HUD는 Vanilla DOM으로 그린다.
 */
import { createHeatmapApp, createProgressApp } from './app/heatmap-app.js';
import { createEngine } from './engine-adapter.js';
import { createHud } from './hud.js';
import { calibrate } from './load.js';
import { createMetrics } from './metrics.js';
import { parseParams } from './params.js';
import { createRunner, downloadJson, renderResults } from './runner.js';
import { SCENARIOS } from './scenarios.js';

const params = parseParams(location.search);
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 요소가 없습니다`);
  return el;
};

function showFatal(message) {
  const box = $('fatal');
  box.hidden = false;
  box.textContent = message;
}

function main() {
  let engine;
  try {
    engine = createEngine(params.engine);
  } catch (error) {
    showFatal(String(error instanceof Error ? error.message : error));
    return;
  }

  if (params.cellCost > 0) calibrate();

  const metrics = createMetrics({
    getEchoText: () => document.getElementById('echo')?.textContent ?? null,
    getSelectedSeq: () => Number(document.getElementById('detail')?.dataset.seq ?? 0),
  });
  engine.subscribe(metrics.onEngineEvent);

  // 사람이 직접 입력·클릭한 것도 같은 방식으로 잰다. 캡처 단계라 앱 핸들러보다 먼저 실행된다.
  // 스크립트 입력(isTrusted=false)은 시나리오가 예정 시각과 함께 직접 표시한다.
  document.addEventListener(
    'input',
    (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (e.isTrusted && t.id === 'search') metrics.markInput(t.value, e.timeStamp);
    },
    true,
  );
  document.addEventListener(
    'click',
    (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (e.isTrusted && t.dataset?.cat && t.closest('#heatmap')) metrics.markClick(e.timeStamp);
    },
    true,
  );

  const { ProgressApp } = createProgressApp(engine);
  engine.createRoot(ProgressApp, $('progress-root'), { label: 'progress' }).mount();

  const { App } = createHeatmapApp(engine);
  const appProps = { size: params.size, seed: params.seed, cellCost: params.cellCost };
  let appRoot = engine.createRoot(App, $('app-root'), { label: 'heatmap', props: appProps });
  appRoot.mount();

  /** 실행마다 처음 상태로: 루트를 내리고 같은 props로 다시 올린 뒤 안정될 때까지 기다린다. */
  const resetApp = async () => {
    appRoot.unmount();
    appRoot = engine.createRoot(App, $('app-root'), { label: 'heatmap', props: appProps });
    appRoot.mount();
    await new Promise((r) => setTimeout(r, 500));
  };

  const hud = params.hud === 'record' ? createHud({ engine: engine.mode, metrics }) : null;
  const runner = createRunner({
    metrics,
    resetApp,
    info: { engine: engine.mode, size: params.size, seed: params.seed, cellCost: params.cellCost },
    onScenario: (id) => {
      hud?.setScenario(id);
      $('run-status').textContent = id ? `${id} 실행 중…` : '대기';
    },
  });

  // 자동화에서 결과를 읽을 수 있게 노출한다.
  const lab = { params, results: runner.results, done: false, error: null };
  Object.assign(window, { __lab: lab });

  setupPanel(runner);
  $('engine-name').textContent = engine.mode;
  $('param-summary').textContent = `size=${params.size} seed=${params.seed} cellCost=${params.cellCost}`;

  if (params.autorun) {
    const ids = params.scenario ? params.scenario.split(',') : Object.keys(SCENARIOS);
    (async () => {
      try {
        // 첫 마운트 직후 JIT 워밍업과 레이아웃 안정화를 기다린다.
        await new Promise((r) => setTimeout(r, 1000));
        for (const id of ids) {
          await runner.runScenario(id, params.runs);
          renderResults($('results'), runner.results);
        }
      } catch (error) {
        lab.error = String(error);
        showFatal(String(error));
      } finally {
        lab.done = true;
      }
    })();
  }
}

/** @param {ReturnType<typeof createRunner>} runner */
function setupPanel(runner) {
  const select = /** @type {HTMLSelectElement} */ ($('scenario-select'));
  for (const [id, s] of Object.entries(SCENARIOS)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${s.title} — ${s.description}`;
    if (id === params.scenario) option.selected = true;
    select.appendChild(option);
  }
  const runsInput = /** @type {HTMLInputElement} */ ($('runs-input'));
  runsInput.value = String(params.runs);
  const runButton = /** @type {HTMLButtonElement} */ ($('run-button'));

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    try {
      await runner.runScenario(select.value, Math.max(1, Number(runsInput.value) || 1));
    } catch (error) {
      showFatal(String(error));
    } finally {
      runButton.disabled = false;
      renderResults($('results'), runner.results);
    }
  });
  $('download-button').addEventListener('click', () => downloadJson(runner.results));
  renderResults($('results'), runner.results);
}

main();
