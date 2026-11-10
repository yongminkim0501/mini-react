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
import { splitLongFrame, summarizeLongFrames } from './loaf.js';
export const METRICS_VERSION = 'B1.5-fixed-pre-run-loaf-v2';

export const LONG_TASK_MS = 50;
/** 끊긴 프레임 = 프레임 예산의 이 배수 + JANK_TOLERANCE_MS 초과 */
export const JANK_FACTOR = 2;
/** 타이머 반올림(16.6~16.8ms 등)으로 정상 프레임이 경계에 걸리지 않게 하는 여유 */
export const JANK_TOLERANCE_MS = 1;
/** 주사율 추정 전 기본값 */
export const DEFAULT_HZ = 60;
const LIVE_FRAMES = 180;

/**
 * rAF 간격으로 주사율을 추정한다. 순수 함수.
 * 간격을 window개씩 나눠 구간별 중앙값을 구하고 그중 가장 작은 값을 쓴다.
 * 프레임은 주사율보다 빨리 올 수 없고, 느린 프레임(마운트·레이아웃)은 간격을 늘리기만 하므로
 * 가장 조용한 구간이 실제 주사율에 가장 가깝다.
 * @param {readonly number[]} intervals ms
 * @param {number} [window] 구간 크기
 * @returns {number} Hz (정수). 표본이 없으면 NaN.
 */
export function estimateRefreshHz(intervals, window = 30) {
  if (intervals.length === 0) return NaN;
  let best = Infinity;
  for (let i = 0; i < intervals.length; i += window) {
    const chunk = intervals.slice(i, i + window);
    // 마지막 조각이 너무 작으면 잡음이 크므로 첫 구간이 아닐 때는 버린다.
    if (i > 0 && chunk.length < window / 2) continue;
    best = Math.min(best, percentile(chunk, 50));
  }
  return Number.isFinite(best) && best > 0 ? Math.round(1000 / best) : NaN;
}

/** 주사율 → 프레임 예산(ms) */
export function frameBudgetMs(hz) {
  return 1000 / (Number.isFinite(hz) && hz > 0 ? hz : DEFAULT_HZ);
}

/** 60Hz에서 ±3Hz를 넘게 벗어나면 경고한다. */
export function isNon60Hz(hz) {
  return !Number.isFinite(hz) || Math.abs(hz - 60) > 3;
}

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
  let refreshHz = NaN;
  /** HUD용 최근 프레임 간격 */
  const liveFrames = [];
  /** HUD용 최근 진행 바 커밋 시각 */
  const liveProgress = [];
  let liveLongest = 0;
  const liveInput = [];
  /** 주사율 추정 대기 */
  let frameWaiters = [];

  let pendingInputs = [];
  let pendingClicks = [];
  let renderStartAt = null;
  let renderEndAt = null;
  let renderRoot = null;
  let renderAttempt = null;

  // ── 프레임 간격 ──
  let lastFrame = null;
  const onFrame = (t) => {
    if (lastFrame !== null) {
      const gap = t - lastFrame;
      liveFrames.push(gap);
      if (liveFrames.length > LIVE_FRAMES) liveFrames.shift();
      if (session && !session.closed && lastFrame >= session.startedAt) {
        session.frames.push(gap);
        session.frameEnds.push(t);
      }
      if (frameWaiters.length) {
        for (const w of frameWaiters) w.intervals.push(gap);
        frameWaiters = frameWaiters.filter((w) => {
          if (w.intervals.length < w.count) return true;
          w.resolve(w.intervals);
          return false;
        });
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

  let longAnimationFrameSupported = false;
  try {
    if (PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > LONG_TASK_MS) session?.loafs.push(splitLongFrame(entry));
        }
      });
      observer.observe({ type: 'long-animation-frame' });
      longAnimationFrameSupported = true;
    }
  } catch { longAnimationFrameSupported = false; }

  // ── 반영 확인 후 첫 rAF까지 기다렸다 기록 ──
  const afterNextFrame = (fn) => requestAnimationFrame(() => fn(performance.now()));
  const openSession = () => (session && !session.closed ? session : null);

  /**
   * 지연 한 건. main은 예정 시각 기준(없으면 실제 발사 시각 기준), event는 실제 발사 시각 기준.
   * 스크립트 이벤트는 dispatch 순간에 timeStamp가 찍혀 메인 스레드가 막혀 기다린 시간이 빠지기 때문이다.
   */
  const latency = (p, now) => ({ main: now - (p.intendedAt ?? p.timeStamp), event: now - p.timeStamp });

  function resolveInputs() {
    if (pendingInputs.length === 0) return;
    const echo = getEchoText();
    const hit = pendingInputs.findIndex((p) => p.value === echo);
    if (hit < 0) return;
    // 이 값보다 먼저 들어온 입력은 더 새로운 값에 덮여 반영된 것으로 본다.
    const done = pendingInputs.slice(0, hit + 1);
    pendingInputs = pendingInputs.slice(hit + 1);
    const target = openSession();
    afterNextFrame((now) => {
      for (const p of done) {
        const l = latency(p, now);
        liveInput.push(l.main);
        if (liveInput.length > 50) liveInput.shift();
        target?.input.push(l);
      }
    });
  }

  function resolveClicks() {
    if (pendingClicks.length === 0) return;
    const seq = getSelectedSeq();
    const done = pendingClicks.filter((p) => seq >= p.expectedSeq);
    if (done.length === 0) return;
    pendingClicks = pendingClicks.filter((p) => seq < p.expectedSeq);
    const target = openSession();
    afterNextFrame((now) => {
      for (const p of done) target?.click.push(latency(p, now));
    });
  }

  /**
   * 어댑터 계측 이벤트
   * @param {{ type: string, label: string, t: number, patchCount?: number, mounted?: boolean, root?: object, attemptId?: number, ok?: boolean, activeMs?: number }} event
   */
  function onEngineEvent(event) {
    if (event.label === progressLabel) {
      if (event.type === 'commit') {
        liveProgress.push(event.t);
        while (liveProgress.length && event.t - liveProgress[0] > 1000) liveProgress.shift();
        openSession()?.progressCommits.push(event.t);
      }
      return;
    }
    if (event.label !== appLabel) return;
    if (event.type === 'renderSlice') {
      openSession()?.renderSlices.push({ start: event.t - event.activeMs, duration: event.activeMs, attemptId: event.attemptId });
      return;
    }
    if (event.type === 'renderStart') {
      renderStartAt = event.t;
      renderEndAt = null;
      renderRoot = event.root;
      renderAttempt = event.attemptId;
    } else if (event.type === 'renderEnd') {
      if (event.root !== renderRoot || event.attemptId !== renderAttempt) return;
      if (event.ok === false) { renderStartAt = renderEndAt = null; return; }
      renderEndAt = event.t;
    } else if (event.type === 'commit') {
      if (event.root !== renderRoot || event.attemptId !== renderAttempt) return;
      const target = openSession();
      if (renderStartAt !== null && renderEndAt !== null && target) {
        target.updates.push({
          render: renderEndAt - renderStartAt,
          commit: event.t - renderEndAt,
          total: event.t - renderStartAt,
          // Fiber excludes yielded time. Active JS elapsed time, not OS CPU accounting.
          activeMs: event.activeMs ?? event.t - renderStartAt,
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
    longAnimationFrameSupported,
    onEngineEvent,

    /**
     * 다음 count개 rAF 간격으로 주사율을 추정해 저장한다(estimateRefreshHz).
     * @param {number} [count]
     */
    calibrateRefresh(count = 120) {
      return new Promise((resolve) => {
        frameWaiters.push({
          count,
          intervals: [],
          resolve: (intervals) => {
            refreshHz = estimateRefreshHz(intervals);
            resolve(refreshHz);
          },
        });
      });
    },

    /** 추정한 주사율. 추정 전이면 NaN. */
    get refreshHz() {
      return refreshHz;
    },

    /**
     * 검색 입력 발생. 캡처 단계에서 앱 핸들러보다 먼저 부른다.
     * @param {string} value
     * @param {number} timeStamp event.timeStamp (performance.now 기준)
     * @param {number | null} intendedAt 스크립트가 입력하려던 예정 시각. 사람 입력이면 null.
     */
    markInput(value, timeStamp, intendedAt = null) {
      pendingInputs.push({ value, timeStamp, intendedAt });
    },

    /** Each click requires its own sequence, even when several arrive before a Commit. */
    markClick(timeStamp, intendedAt = null) {
      const seqBefore = getSelectedSeq();
      const previousExpected = pendingClicks[pendingClicks.length - 1]?.expectedSeq ?? seqBefore;
      pendingClicks.push({ seqBefore, expectedSeq: Math.max(seqBefore, previousExpected) + 1, timeStamp, intendedAt });
    },

    /** 기록 시작. 이전 기록과 대기 중인 입력은 버린다. */
    start() {
      renderStartAt = renderEndAt = null;
      renderRoot = renderAttempt = null;
      pendingInputs = [];
      pendingClicks = [];
      session = {
        startedAt: performance.now(),
        preRunHz: refreshHz,
        preRunBudgetMs: frameBudgetMs(refreshHz),
        closed: false,
        frames: [],
        frameEnds: [],
        longTasks: [],
        loafs: [],
        renderSlices: [],
        receivedUpdates: 0,
        input: [],
        click: [],
        updates: [],
        progressCommits: [],
      };
      liveLongest = 0;
      liveInput.length = 0;
    },

    /**
     * 기록을 끝내고 요약을 돌려준다. Long Task 항목은 늦게 전달되므로 잠시 기다린다.
     * 기다리는 동안 다른 기록은 닫는다.
     */
    async stop() {
      const current = session;
      if (!current) throw new Error('기록 중이 아닙니다');
      const endedAt = performance.now();
      current.closed = true;
      current.pendingInputCount = pendingInputs.length;
      current.pendingClickCount = pendingClicks.length;
      await new Promise((r) => setTimeout(r, 200));
      session = null;
      return summarizeSession(current, endedAt, longTaskSupported, current.preRunBudgetMs, longAnimationFrameSupported);
    },

    markRegenerate() { if (openSession()) session.receivedUpdates++; },

    /** HUD용 실시간 값 */
    live() {
      const now = performance.now();
      return {
        frames: liveFrames,
        refreshHz,
        budgetMs: frameBudgetMs(refreshHz),
        longest: longTaskSupported ? liveLongest : NaN,
        inputP95: percentile(liveInput, 95),
        progressFps: liveProgress.filter((t) => now - t <= 1000).length,
        recording: session !== null,
      };
    },
  };
}

/**
 * 기록 구간을 숫자 요약으로 바꾼다. 순수 함수.
 * 지연은 예정 시각 기준이 메인(input*, click*), 실제 발사 시각 기준이 보조(*Event*)다.
 * @param {any} s
 * @param {number} endedAt
 * @param {boolean} longTaskSupported
 * @param {number} budgetMs 실행 전 추정으로 고정한 프레임 예산.
 * @param {boolean} [loafSupported]
 */
export function summarizeSession(s, endedAt, longTaskSupported, budgetMs, loafSupported = false) {
  const duration = endedAt - s.startedAt;
  // Diagnostic only: workload can lower rAF cadence without a display change.
  const observedHz = estimateRefreshHz(s.frames, Infinity);
  // 가장 조용한 30프레임 구간 기준 주사율. 중앙값 기준과 다르면 실행 도중 주사율이 바뀐 것이다.
  const quietestHz = estimateRefreshHz(s.frames);
  const runBudgetMs = budgetMs;
  const preRunHz = s.preRunHz ?? 1000 / budgetMs;
  const refreshUnstable = Number.isFinite(observedHz) && (
    Math.abs(observedHz - preRunHz) > 3 || Number.isFinite(quietestHz) && Math.abs(observedHz - quietestHz) > 3
  ) ? 1 : 0;
  const jankMs = runBudgetMs * JANK_FACTOR + JANK_TOLERANCE_MS;
  // Include intervals crossing a boundary; keep timestamps and flag full durations.
  const tasks = s.longTasks.filter((t) => t.start + t.duration > s.startedAt && t.start <= endedAt)
    .map((t) => ({ ...t, windowOverlap: t.start < s.startedAt || t.start + t.duration > endedAt }));
  const updates = s.updates.filter((u) => !u.mounted);
  const progressGaps = [];
  for (let i = 1; i < s.progressCommits.length; i++) progressGaps.push(s.progressCommits[i] - s.progressCommits[i - 1]);
  const frames = summarize(s.frames);
  const input = summarize(s.input.map((l) => l.main));
  const inputEvent = summarize(s.input.map((l) => l.event));
  const click = summarize(s.click.map((l) => l.main));
  const clickEvent = summarize(s.click.map((l) => l.event));
  const totals = summarize(updates.map((u) => u.total));
  const active = updates.map((u) => u.activeMs ?? u.total);
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  const loafs = (s.loafs ?? []).filter((f) => f.startTime + f.duration > s.startedAt && f.startTime <= endedAt && f.duration > LONG_TASK_MS)
    .map((f) => ({ ...f, windowOverlap: f.startTime < s.startedAt || f.startTime + f.duration > endedAt }));
  const warnings = [];
  if (isNon60Hz(preRunHz)) warnings.push('pre-run-not-60Hz');
  if (refreshUnstable) warnings.push('in-run-refresh-unstable');
  if (!Number.isFinite(observedHz)) warnings.push('no-frame-samples');

  return {
    metricsVersion: METRICS_VERSION,
    preRunHz,
    warnings,
    durationMs: duration,
    /** 끊김 판정에 쓴 프레임 예산 */
    frameBudgetMs: runBudgetMs,
    /** 진단값만. 끊김 예산을 바꾸지 않는다. */
    refreshHzObserved: observedHz,
    /** 가장 조용한 구간 기준 주사율과 3Hz 넘게 다르면 1 (실행 도중 주사율 변경). 평균하면 그런 실행의 비율이 된다. */
    refreshUnstable,
    /** 실행 시작 전 추정으로 정한 예산 (비교용) */
    preRunBudgetMs: budgetMs,
    frameP50: frames.p50,
    frameP95: frames.p95,
    frameMax: frames.max,
    framesJank: s.frames.filter((f) => f > jankMs).length,
    /** 가장 긴 프레임이 끝난 시각 (구간 시작 기준, 진단용) */
    frameMaxAt: s.frames.length ? s.frameEnds[s.frames.indexOf(frames.max)] - s.startedAt : NaN,
    longTaskCount: longTaskSupported ? tasks.length : NaN,
    longTaskMax: longTaskSupported ? (tasks.length ? max(tasks.map((t) => t.duration)) : 0) : NaN,
    inputCount: input.count,
    inputP50: input.p50,
    inputP95: input.p95,
    inputMax: input.max,
    inputEventP95: inputEvent.p95,
    clickCount: click.count,
    clickP50: click.p50,
    clickP95: click.p95,
    clickMax: click.max,
    clickEventP95: clickEvent.p95,
    updateCount: totals.count,
    receivedUpdates: s.receivedUpdates ?? 0,
    updatesPerSecond: duration > 0 ? totals.count / duration * 1000 : NaN,
    updateWallTotalMs: sum(updates.map((u) => u.total)),
    activeTotalMs: sum(active),
    updateMean: totals.mean,
    activeMean: summarize(active).mean,
    updateP95: totals.p95,
    updateMax: totals.max,
    renderMean: summarize(updates.map((u) => u.render)).mean,
    commitMean: summarize(updates.map((u) => u.commit)).mean,
    patchMean: summarize(updates.map((u) => u.patchCount)).mean,
    progressFps: duration > 0 ? (s.progressCommits.length / duration) * 1000 : NaN,
    progressDropped: progressGaps.filter((g) => g > jankMs).length,
    progressGapMax: max(progressGaps),
    ...summarizeLongFrames(loafs, loafSupported),
    renderSliceMax: s.renderSlices?.length ? max(s.renderSlices.map((f) => f.duration)) : NaN,
    renderJsLongSliceCount: s.renderSlices?.length ? s.renderSlices.filter((f) => f.duration > LONG_TASK_MS).length : NaN,
    pendingInputCount: s.pendingInputCount ?? 0,
    pendingClickCount: s.pendingClickCount ?? 0,
    raw: {
      startedAt: s.startedAt, endedAt, frames: s.frames, frameEnds: s.frameEnds,
      progressCommits: s.progressCommits, updates: s.updates, input: s.input, click: s.click,
      longTasks: tasks, loafs, renderSlices: s.renderSlices ?? [],
    },
  };
}
