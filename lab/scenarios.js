/**
 * 측정 시나리오. 앱은 DOM 이벤트로만 조작한다(사람이 하는 것과 같은 경로).
 * 시각은 시작 시각 기준 절대 예정 시각으로 잡는다. 메인 스레드가 막혀 타이머가 늦게 실행되면
 * 그 지연이 "예정 시각 기준 지연"에 드러난다.
 */
import { mulberry32, randInt } from './prng.js';

/** @typedef {ReturnType<typeof createScenarioContext>} ScenarioContext */

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const sleepUntil = (t) => sleep(t - performance.now());

/**
 * @param {{ metrics: ReturnType<import('./metrics.js').createMetrics>, seed: number }} options
 */
export function createScenarioContext({ metrics, seed }) {
  const rand = mulberry32(seed);
  const byId = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`#${id} 요소가 없습니다`);
    return el;
  };

  return {
    sleep,
    sleepUntil,
    markInteractionEnd: (kind) => metrics.markInteractionEnd?.(kind),

    /** 새 데이터 수신 버튼 클릭 */
    regenerate() {
      metrics.markRegenerate?.();
      /** @type {HTMLButtonElement} */ (byId('regen')).click();
    },

    /**
     * 검색창에 값을 넣고 input 이벤트를 보낸다. 측정용 표시는 이벤트를 보내기 직전에 남긴다.
     * @param {string} value
     * @param {number | null} intendedAt
     */
    typeValue(value, intendedAt = null) {
      const input = /** @type {HTMLInputElement} */ (byId('search'));
      input.value = value;
      const event = new Event('input', { bubbles: true });
      metrics.markInput(value, event.timeStamp, intendedAt);
      input.dispatchEvent(event);
    },

    /**
     * 시드 기반으로 셀 하나를 골라 클릭한다. 전체 셀을 querySelectorAll하지 않고 행·열 인덱스로 바로 찾는다.
     * @param {number | null} intendedAt
     */
    clickRandomCell(intendedAt = null) {
      const heatmap = byId('heatmap');
      const row = heatmap.children[randInt(rand, heatmap.children.length)];
      if (!row) return;
      // 첫 자식은 행 이름표다.
      const cell = row.children[1 + randInt(rand, row.children.length - 1)];
      if (!cell) return;
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      metrics.markClick(event.timeStamp, intendedAt);
      cell.dispatchEvent(event);
    },
  };
}

/**
 * 타이핑할 19글자. 장애 대응자가 "새 배포 + 503"이 겹친 칸을 찾는 검색어다.
 * 'd'에서 모든 셀이 매칭되고, '2'에서 새 배포 셀로, ' err-503'에서 에러 셀로 좁혀진다.
 */
export const TYPING_TEXT = 'deploy-1742 err-503';

/**
 * @type {Record<string, { title: string, description: string, run: (ctx: ScenarioContext) => Promise<void> }>}
 */
export const SCENARIOS = {
  S1: {
    title: 'S1 대규모 업데이트',
    description: '새 데이터 수신을 2초 간격으로 3회',
    async run(ctx) {
      const t0 = performance.now();
      for (let i = 0; i < 3; i++) {
        await ctx.sleepUntil(t0 + i * 2000);
        ctx.regenerate();
      }
      await ctx.sleepUntil(t0 + 6000);
    },
  },
  S2: {
    title: 'S2 타이핑',
    description: `100ms 간격으로 ${TYPING_TEXT.length}글자 입력 ("${TYPING_TEXT}")`,
    async run(ctx) {
      const t0 = performance.now();
      for (let i = 0; i < TYPING_TEXT.length; i++) {
        const at = t0 + i * 100;
        await ctx.sleepUntil(at);
        ctx.typeValue(TYPING_TEXT.slice(0, i + 1), at);
      }
      ctx.markInteractionEnd('input');
      await ctx.sleep(1000);
    },
  },
  S3: {
    title: 'S3 클릭',
    description: '새 데이터 수신 직후 200ms 간격으로 셀 클릭 10회',
    async run(ctx) {
      ctx.regenerate();
      const t0 = performance.now();
      for (let i = 0; i < 10; i++) {
        const at = t0 + i * 200;
        await ctx.sleepUntil(at);
        ctx.clickRandomCell(at);
      }
      ctx.markInteractionEnd('click');
      await ctx.sleep(1000);
    },
  },
  S4: {
    title: 'S4 애니메이션',
    description: '5초 동안 새 데이터 수신을 연속 실행하며 실시간 수신 표시 fps와 끊긴 프레임 측정',
    async run(ctx) {
      const end = performance.now() + 5000;
      while (performance.now() < end) {
        ctx.regenerate();
        // 다음 태스크로 넘겨 재생성 사이에 브라우저가 프레임을 그릴 기회를 준다.
        await ctx.sleep(0);
      }
      await ctx.sleep(500);
    },
  },
};
