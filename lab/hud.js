/**
 * 녹화용 HUD (?hud=record). Vanilla DOM + canvas. 엔진을 거치지 않는다.
 * 상단 고정 오버레이에 엔진·시나리오 이름, 프레임 간격 그래프(16.7ms 예산선), 핵심 숫자를 보인다.
 */
const BUDGET_MS = 1000 / 60;
const GRAPH_MAX_MS = 100;

/**
 * @param {{ engine: string, metrics: ReturnType<import('./metrics.js').createMetrics> }} options
 */
export function createHud({ engine, metrics }) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud-title"><span class="hud-engine"></span><span class="hud-scenario"></span></div>
    <canvas class="hud-graph" width="480" height="96" aria-label="프레임 간격 그래프"></canvas>
    <div class="hud-numbers">
      <div><span class="hud-label">최장 Long Task</span><b class="hud-long">-</b></div>
      <div><span class="hud-label">입력 지연 p95</span><b class="hud-input">-</b></div>
      <div><span class="hud-label">진행 바 fps</span><b class="hud-fps">-</b></div>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('has-hud');

  const $ = (sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  $('.hud-engine').textContent = `engine=${engine}`;
  const scenarioEl = $('.hud-scenario');
  const longEl = $('.hud-long');
  const inputEl = $('.hud-input');
  const fpsEl = $('.hud-fps');
  const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
  const ctx = canvas.getContext('2d');

  const fmt = (v, unit) => (Number.isNaN(v) ? (unit === 'ms' ? '측정 불가' : '-') : `${v.toFixed(0)}${unit}`);

  const draw = () => {
    const live = metrics.live();
    longEl.textContent = fmt(live.longest, 'ms');
    inputEl.textContent = Number.isNaN(live.inputP95) ? '-' : `${live.inputP95.toFixed(0)}ms`;
    fpsEl.textContent = String(live.progressFps);

    if (ctx) {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const barW = width / 180;
      live.frames.forEach((gap, i) => {
        const h = Math.min(gap, GRAPH_MAX_MS) / GRAPH_MAX_MS * height;
        ctx.fillStyle = gap > 33 ? '#ff5252' : gap > BUDGET_MS + 1 ? '#ffb300' : '#4caf50';
        ctx.fillRect(i * barW, height - h, Math.max(1, barW - 0.5), h);
      });
      const y = height - (BUDGET_MS / GRAPH_MAX_MS) * height;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px system-ui';
      ctx.fillText('16.7ms', 4, y - 3);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  return {
    /** @param {string | null} name */
    setScenario(name) {
      scenarioEl.textContent = name ? `scenario=${name}` : '';
    },
  };
}
