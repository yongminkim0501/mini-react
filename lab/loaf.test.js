import { describe, expect, it } from 'vitest';
import { splitLongFrame, summarizeLongFrames } from './loaf.js';
import { summarizeSession } from './metrics.js';
import { formatValue } from './runner.js';

describe('B-1.5 long frame attribution', () => {
  it('separates rAF, style/layout and forced layout from attributed JS', () => {
    const f = splitLongFrame({ startTime: 100, duration: 120, renderStart: 170, styleAndLayoutStart: 180,
      scripts: [{ startTime: 100, duration: 80, forcedStyleAndLayoutDuration: 10 }] });
    expect(f).toMatchObject({ beforeRenderMs: 70, rafPhaseMs: 10, scriptMs: 70,
      renderPhaseMs: 50, styleAndLayoutMs: 40, renderingMs: 50, cause: 'js' });
    const r = splitLongFrame({ startTime: 300, duration: 90, renderStart: 320, styleAndLayoutStart: 330,
      scripts: [{ duration: 20 }] });
    const summary = summarizeLongFrames([f, r], true);
    expect(summary).toMatchObject({ loafCount: 2, loafJsCount: 1, loafJsFrameMs: 120,
      loafRenderingCount: 1, loafRenderingFrameMs: 90, loafScriptMs: 90, loafRenderingMs: 110 });
  });
  it('does not invent JS time from idle/wait intervals, handles no render and unsupported API', () => {
    expect(splitLongFrame({ startTime: 100, duration: 80, renderStart: 0, styleAndLayoutStart: 0, scripts: [] }))
      .toMatchObject({ scriptMs: 0, renderingMs: 0, beforeRenderMs: 80, cause: 'unknown' });
    expect(summarizeLongFrames([], true).loafJsCount).toBe(0);
    expect(Number.isNaN(summarizeLongFrames([], false).loafJsCount)).toBe(true);
    expect(formatValue('loafJsCount', NaN, 1)).toBe('측정 불가');
  });
  it('keeps the pre-run budget under workload and retains recalculable raw intervals', () => {
    const session = { startedAt: 0, preRunHz: 60, frames: [16, 16, 100, 100, 100], frameEnds: [16,32,132,232,332],
      updates: [{ total: 200, activeMs: 60, mounted: false }], input: [], click: [],
      longTasks: [], loafs: [], progressCommits: [0,16,116], receivedUpdates: 7 };
    const s = summarizeSession(session, 1000, false, 1000 / 60, true);
    expect(s.frameBudgetMs).toBeCloseTo(16.667); expect(s.refreshHzObserved).toBe(10);
    expect(s.framesJank).toBe(3); expect(s.progressDropped).toBe(1);
    expect(s.warnings).toContain('in-run-refresh-unstable');
    expect(s).toMatchObject({ updateCount: 1, receivedUpdates: 7, activeMean: 60, activeTotalMs: 60, updateWallTotalMs: 200 });
    expect(s.raw.frames).toEqual(session.frames);
  });
});
