/**
 * 배포 지연 추적 페이지 진입점. 엔진·앱·측정 도구를 연결한다.
 * 앱 두 개(히트맵, 실시간 수신 표시)는 엔진으로, 러너·결과 표·HUD는 Vanilla DOM으로 그린다.
 */
import { createHeatmapApp, createProgressApp } from './app/heatmap-app.js';
import { createEngine, isImplemented } from './engine-adapter.js';
import { createHud } from './hud.js';
import { calibrate } from './load.js';
import { createMetrics } from './metrics.js';
import { parseParams } from './params.js';
import { createRunner, downloadJson, renderResults, saveToDevServer } from './runner.js';
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
  const metrics = createMetrics({
    getEchoText: () => document.getElementById('echo')?.textContent ?? null,
    getSelectedSeq: () => Number(document.getElementById('detail')?.dataset.seq ?? 0),
  });

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
      if (e.isTrusted && t.dataset?.server && t.closest('#heatmap')) metrics.markClick(e.timeStamp);
    },
    true,
  );

  if (params.cellCost > 0) calibrate();
  const appProps = { size: params.size, seed: params.seed, cellCost: params.cellCost };

  /**
   * 엔진 하나와 그 위의 루트 두 개. 엔진을 바꿀 때는 루트를 모두 내리고 새 엔진으로 다시 만든다.
   * @type {{ mode: string, engine: any, App: Function, progress: any, app: any, unsubscribe: () => void } | null}
   */
  let current = null;

  /** @param {string} mode */
  const activate = (mode) => {
    if (current?.mode === mode) return;
    if (current) {
      current.app.unmount();
      current.progress.unmount();
      current.unsubscribe();
    }
    const engine = createEngine(mode);
    const unsubscribe = engine.subscribe(metrics.onEngineEvent);
    const { ProgressApp } = createProgressApp(engine);
    const { App } = createHeatmapApp(engine);
    const progress = engine.createRoot(ProgressApp, $('progress-root'), { label: 'progress' });
    progress.mount();
    const app = engine.createRoot(App, $('app-root'), { label: 'heatmap', props: appProps });
    app.mount();
    current = { mode, engine, App, progress, app, unsubscribe };
    $('engine-name').textContent = mode;
  };

  /** 실행마다 처음 상태로: 히트맵 루트를 내리고 같은 props로 다시 올린 뒤 안정될 때까지 기다린다. */
  const resetApp = async () => {
    if (!current) throw new Error('엔진이 없습니다');
    current.app.unmount();
    current.app = current.engine.createRoot(current.App, $('app-root'), { label: 'heatmap', props: appProps });
    current.app.mount();
    await new Promise((r) => setTimeout(r, 500));
  };

  try {
    activate(params.engine);
  } catch (error) {
    showFatal(String(error instanceof Error ? error.message : error));
    return;
  }

  const hud = params.hud === 'record' ? createHud({ engine: params.engine, metrics }) : null;
  // HUD 예산선을 위해 첫 마운트가 끝나고 안정된 뒤 한 번 추정한다(마운트 중에 재면 느린 프레임이 섞인다).
  // 측정 때는 시나리오마다 다시 잰다.
  setTimeout(() => metrics.calibrateRefresh(), 1500);

  const runner = createRunner({
    metrics,
    host: { isImplemented, activate, resetApp },
    info: { size: params.size, seed: params.seed, cellCost: params.cellCost },
    onScenario: (label, mode) => {
      hud?.setScenario(label, mode);
      $('run-status').textContent = label ? `${label} (${mode}) 실행 중…` : '대기';
    },
  });

  // 자동화에서 결과를 읽을 수 있게 노출한다.
  const lab = { params, results: runner.results, done: false, error: null, savedPath: null };
  Object.assign(window, { __lab: lab });

  setupPanel(runner);
  $('param-summary').textContent = `engines=${params.engines.join(',')} size=${params.size} seed=${params.seed} cellCost=${params.cellCost}`;
  const skipped = params.engines.filter((m) => !isImplemented(m));
  if (skipped.length) $('run-status').textContent = `구현되지 않은 엔진은 건너뜀: ${skipped.join(', ')}`;

  if (params.autorun) {
    const ids = params.scenario ? params.scenario.split(',') : Object.keys(SCENARIOS);
    (async () => {
      try {
        // 첫 마운트 직후 레이아웃 안정화를 기다린다.
        await new Promise((r) => setTimeout(r, 1000));
        for (const id of ids) {
          await runner.runScenario(id, params.runs, params.engines);
          renderResults($('results'), runner.results);
        }
        if (params.save) lab.savedPath = await saveToDevServer(runner.results);
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
      await runner.runScenario(select.value, Math.max(1, Number(runsInput.value) || 1), params.engines);
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
