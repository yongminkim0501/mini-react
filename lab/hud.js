/**
 * 녹화용 HUD (?hud=record). Vanilla DOM + canvas. 엔진을 거치지 않는다.
 * 상단 고정 오버레이에 엔진·시나리오 이름, 주사율, 프레임 간격 그래프(추정 주사율 기준 예산선),
 * 핵심 숫자를 보인다. 1280×720 창에서 잘리지 않게 맞췄다.
 */
import { JANK_FACTOR, isNon60Hz } from './metrics.js';

const GRAPH_MAX_MS = 100;
const GRAPH_BARS = 180;

/**
 * @param {{ engine: string, metrics: ReturnType<import('./metrics.js').createMetrics> }} options
 */
export function createHud({ engine, metrics }) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud-title">
      <span class="hud-engine"></span>
      <span class="hud-scenario">대기</span>
      <span class="hud-hz"></span>
    </div>
    <canvas class="hud-graph" width="360" height="72" aria-label="프레임 간격 그래프"></canvas>
    <div class="hud-numbers">
      <div><span class="hud-label">최장 Long Task</span><b class="hud-long">-</b></div>
      <div><span class="hud-label">입력 지연 p95</span><b class="hud-input">-</b></div>
      <div><span class="hud-label">수신 표시 fps</span><b class="hud-fps">-</b></div>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('has-hud');

  const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  const engineEl = $('.hud-engine');
  const scenarioEl = $('.hud-scenario');
  const hzEl = $('.hud-hz');
  const longEl = $('.hud-long');
  const inputEl = $('.hud-input');
  const fpsEl = $('.hud-fps');
  engineEl.textContent = engine;
  const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
  const ctx = canvas.getContext('2d');

  const draw = () => {
    const live = metrics.live();
    const budget = live.budgetMs;
    longEl.textContent = Number.isNaN(live.longest) ? '측정 불가' : `${live.longest.toFixed(0)}ms`;
    inputEl.textContent = Number.isNaN(live.inputP95) ? '-' : `${live.inputP95.toFixed(0)}ms`;
    fpsEl.textContent = String(live.progressFps);
    const hz = live.refreshHz;
    hzEl.textContent = Number.isFinite(hz) ? `${hz}Hz · 예산 ${budget.toFixed(1)}ms${isNon60Hz(hz) ? ' ⚠ 60Hz 아님' : ''}` : '주사율 추정 중';
    hzEl.classList.toggle('hud-warn', Number.isFinite(hz) && isNon60Hz(hz));

    if (ctx) {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const barW = width / GRAPH_BARS;
      live.frames.forEach((gap, i) => {
        const h = (Math.min(gap, GRAPH_MAX_MS) / GRAPH_MAX_MS) * height;
        ctx.fillStyle = gap > budget * JANK_FACTOR ? '#ff5252' : gap > budget * 1.2 ? '#ffb300' : '#4caf50';
        ctx.fillRect(i * barW, height - h, Math.max(1, barW - 0.5), h);
      });
      const y = height - (budget / GRAPH_MAX_MS) * height;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px system-ui';
      ctx.fillText(`${budget.toFixed(1)}ms`, 4, Math.max(11, y - 3));
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  return {
    /** @param {string | null} name @param {string | null} [mode] */
    setScenario(name, mode) {
      scenarioEl.textContent = name ?? '대기';
      if (mode) engineEl.textContent = mode;
    },
  };
}
