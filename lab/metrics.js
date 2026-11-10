/**
 * 측정 도구. Vanilla DOM과 브라우저 API만 쓰고 엔진을 거치지 않는다.
 * 측정 도구가 엔진으로 그려지면 측정 대상의 렌더링 비용·지연에 섞이고,
 * 엔진이 멈추면 측정 도구도 함께 멈춰 기록이 사라진다.
 *
 * 엔진과 닿는 곳은 두 군데뿐이다.
 * - onEngineEvent: 어댑터의 계측 이벤트(renderStart/renderEnd/commit)를 받는다.
 * - getEchoText/getSelectedSeq: 커밋 직후 실제 DOM을 읽어 입력·클릭이 반영됐는지 확인한다.
 */
import { max, percentile, summarize } from './stats.js';

export const JANK_FRAME_MS = 33;
export const LONG_TASK_MS = 50;
const LIVE_FRAMES = 180;

/**
 * @param {{
 *   getEchoText: () => string | null,
 *   getSelectedSeq: () => number,
 *   appLabel?: string,
 *   progressLabel?: string,
 * }} options
 */
export function createMetrics({ getEchoText, getSelectedSeq, appLabel = 'heatmap', progressLabel = 'progress' }) {
  /** 지금 기록 중인 구간. null이면 기록하지 않는다(라이브 HUD 값만 갱신). */
  let session = null;
  /** HUD용 최근 프레임 간격 */
  const liveFrames = [];
  /** HUD용 최근 진행 바 커밋 시각 */
  const liveProgress = [];
  let liveLongest = 0;
  const liveInput = [];

  let pendingInputs = [];
  let pendingClicks = [];
  let renderStartAt = null;
  let renderEndAt = null;

  // ── 프레임 간격 ──
  let lastFrame = null;
  const onFrame = (t) => {
    if (lastFrame !== null) {
      const gap = t - lastFrame;
      liveFrames.push(gap);
      if (liveFrames.length > LIVE_FRAMES) liveFrames.shift();
      if (session && !session.closed) {
        session.frames.push(gap);
        session.frameEnds.push(t);
      }
    }
    lastFrame = t;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  // ── Long Task ──
  let longTaskSupported = false;
  try {
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          liveLongest = Math.max(liveLongest, entry.duration);
          session?.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ type: 'longtask' });
      longTaskSupported = true;
    }
  } catch {
    longTaskSupported = false;
  }

  // ── 반영 확인 후 첫 rAF까지 기다렸다 기록 ──
  const afterNextFrame = (fn) => requestAnimationFrame(() => fn(performance.now()));

  function resolveInputs() {
    if (pendingInputs.length === 0) return;
    const echo = getEchoText();
    const hit = pendingInputs.findIndex((p) => p.value === echo);
    if (hit < 0) return;
    // 이 값보다 먼저 들어온 입력은 더 새로운 값에 덮여 반영된 것으로 본다.
    const done = pendingInputs.slice(0, hit + 1);
    pendingInputs = pendingInputs.slice(hit + 1);
    const target = session && !session.closed ? session : null;
    afterNextFrame((now) => {
      for (const p of done) {
        const latency = now - p.timeStamp;
        liveInput.push(latency);
        if (liveInput.length > 50) liveInput.shift();
        if (target) {
          target.input.push(latency);
          if (p.intendedAt !== null) target.inputFromIntended.push(now - p.intendedAt);
        }
      }
    });
  }

  function resolveClicks() {
    if (pendingClicks.length === 0) return;
    const seq = getSelectedSeq();
    const done = pendingClicks.filter((p) => seq > p.seqBefore);
    if (done.length === 0) return;
    pendingClicks = pendingClicks.filter((p) => seq <= p.seqBefore);
    const target = session && !session.closed ? session : null;
    afterNextFrame((now) => {
      for (const p of done) {
        target?.click.push(now - p.timeStamp);
        if (target && p.intendedAt !== null) target.clickFromIntended.push(now - p.intendedAt);
      }
    });
  }

  /**
   * 어댑터 계측 이벤트
   * @param {{ type: string, label: string, t: number, patchCount?: number, mounted?: boolean }} event
   */
  function onEngineEvent(event) {
    if (event.label === progressLabel) {
      if (event.type === 'commit') {
        liveProgress.push(event.t);
        while (liveProgress.length && event.t - liveProgress[0] > 1000) liveProgress.shift();
        if (session && !session.closed) session.progressCommits.push(event.t);
      }
      return;
    }
    if (event.label !== appLabel) return;
    if (event.type === 'renderStart') {
      renderStartAt = event.t;
      renderEndAt = null;
    } else if (event.type === 'renderEnd') {
      renderEndAt = event.t;
    } else if (event.type === 'commit') {
      if (renderStartAt !== null && renderEndAt !== null && session && !session.closed) {
        session.updates.push({
          render: renderEndAt - renderStartAt,
          commit: event.t - renderEndAt,
          total: event.t - renderStartAt,
          patchCount: event.patchCount ?? 0,
          mounted: Boolean(event.mounted),
        });
      }
      renderStartAt = null;
      renderEndAt = null;
      resolveInputs();
      resolveClicks();
    }
  }

  return {
    longTaskSupported,
    onEngineEvent,

    /**
     * 검색 입력 발생. 캡처 단계에서 앱 핸들러보다 먼저 부른다.
     * @param {string} value
     * @param {number} timeStamp event.timeStamp (performance.now 기준)
     * @param {number | null} intendedAt 스크립트가 입력하려던 예정 시각. 사람 입력이면 null.
     */
    markInput(value, timeStamp, intendedAt = null) {
      pendingInputs.push({ value, timeStamp, intendedAt });
    },

    /** 셀 클릭 발생. 클릭 전 선택 번호를 기억해 두고 그보다 커지면 반영된 것으로 본다. */
    markClick(timeStamp, intendedAt = null) {
      pendingClicks.push({ seqBefore: getSelectedSeq(), timeStamp, intendedAt });
    },

    /** 기록 시작. 이전 기록과 대기 중인 입력은 버린다. */
    start() {
      pendingInputs = [];
      pendingClicks = [];
      session = {
        startedAt: performance.now(),
        closed: false,
        frames: [],
        frameEnds: [],
        longTasks: [],
        input: [],
        inputFromIntended: [],
        click: [],
        clickFromIntended: [],
        updates: [],
        progressCommits: [],
      };
      liveLongest = 0;
      liveInput.length = 0;
    },

    /**
     * 기록을 끝내고 요약을 돌려준다. Long Task 항목은 늦게 전달되므로 잠시 기다린다.
     * @returns {Promise<ReturnType<typeof summarizeSession>>}
     */
    async stop() {
      const current = session;
      if (!current) throw new Error('기록 중이 아닙니다');
      const endedAt = performance.now();
      // 이후로는 Long Task만 받는다. 항목이 늦게 전달되므로 잠시 기다린 뒤 구간 안의 것만 센다.
      current.closed = true;
      await new Promise((r) => setTimeout(r, 200));
      session = null;
      return summarizeSession(current, endedAt, longTaskSupported);
    },

    /** HUD용 실시간 값 */
    live() {
      return {
        frames: liveFrames,
        longest: longTaskSupported ? liveLongest : NaN,
        inputP95: percentile(liveInput, 95),
        progressFps: liveProgress.filter((t) => performance.now() - t <= 1000).length,
        recording: session !== null,
      };
    },
  };
}

/**
 * 기록 구간을 숫자 요약으로 바꾼다. 순수 함수.
 * @param {any} s
 * @param {number} endedAt
 * @param {boolean} longTaskSupported
 */
export function summarizeSession(s, endedAt, longTaskSupported) {
  const duration = endedAt - s.startedAt;
  const tasks = s.longTasks.filter((t) => t.start >= s.startedAt && t.start <= endedAt);
  const updates = s.updates.filter((u) => !u.mounted);
  const progressGaps = [];
  for (let i = 1; i < s.progressCommits.length; i++) progressGaps.push(s.progressCommits[i] - s.progressCommits[i - 1]);
  const frames = summarize(s.frames);
  const inputs = summarize(s.input);
  const inputsIntended = summarize(s.inputFromIntended);
  const clicks = summarize(s.click);
  const clicksIntended = summarize(s.clickFromIntended);
  const totals = summarize(updates.map((u) => u.total));

  return {
    durationMs: duration,
    frameP50: frames.p50,
    frameP95: frames.p95,
    frameMax: frames.max,
    framesOver33: s.frames.filter((f) => f > JANK_FRAME_MS).length,
    /** 가장 긴 프레임이 끝난 시각 (구간 시작 기준, 진단용) */
    frameMaxAt: s.frames.length ? s.frameEnds[s.frames.indexOf(frames.max)] - s.startedAt : NaN,
    longTaskCount: longTaskSupported ? tasks.length : NaN,
    longTaskMax: longTaskSupported ? (tasks.length ? max(tasks.map((t) => t.duration)) : 0) : NaN,
    inputCount: inputs.count,
    inputP50: inputs.p50,
    inputP95: inputs.p95,
    inputMax: inputs.max,
    inputFromIntendedP95: inputsIntended.p95,
    clickCount: clicks.count,
    clickP50: clicks.p50,
    clickP95: clicks.p95,
    clickMax: clicks.max,
    clickFromIntendedP95: clicksIntended.p95,
    updateCount: totals.count,
    updateMean: totals.mean,
    updateP95: totals.p95,
    updateMax: totals.max,
    renderMean: summarize(updates.map((u) => u.render)).mean,
    commitMean: summarize(updates.map((u) => u.commit)).mean,
    patchMean: summarize(updates.map((u) => u.patchCount)).mean,
    progressFps: duration > 0 ? (s.progressCommits.length / duration) * 1000 : NaN,
    progressDropped: progressGaps.filter((g) => g > JANK_FRAME_MS).length,
    progressGapMax: max(progressGaps),
  };
}
