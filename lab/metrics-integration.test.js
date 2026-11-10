import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMetrics } from './metrics.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function harness() {
  vi.useFakeTimers();
  const now = vi.spyOn(performance, 'now').mockReturnValue(10);
  const frames = [];
  vi.stubGlobal('requestAnimationFrame', (fn) => { frames.push(fn); return frames.length; });
  const observers = new Map();
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['longtask', 'long-animation-frame'];
    constructor(fn) { this.fn = fn; }
    observe({ type }) { observers.set(type, this.fn); }
  });
  let seq = 0;
  let echo = '';
  const metrics = createMetrics({ getEchoText: () => echo, getSelectedSeq: () => seq });
  const root = {};
  const commit = () => {
    for (const [type,t] of [['renderStart',13], ['renderEnd',15], ['commit',16]])
      metrics.onEngineEvent({ type, t, label:'heatmap', root });
  };
  const finish = async () => {
    now.mockReturnValue(100);
    // Skip the perpetual metrics onFrame callback; drain only response callbacks.
    for (const fn of frames.slice(1)) fn(100);
    const stopped = metrics.stop(); await vi.advanceTimersByTimeAsync(200); return stopped;
  };
  metrics.start();
  return { metrics, setSeq: (n) => { seq = n; }, commit, finish,
    setEcho: (value) => { echo = value; },
    send: (type,t,extra={}) => metrics.onEngineEvent({type,t,label:'heatmap',root,...extra}),
    notify: (type, entries) => observers.get(type)({ getEntries: () => entries }) };
}

describe('sliced measurements', () => {
  it('associates input with its Sync attempt, keeps discarded cost and waits for final idle Commit', async () => {
    const {metrics,setEcho,send,finish}=harness();
    metrics.markInput('new',11,10);metrics.markInteractionEnd('input');
    send('renderStart',20,{lane:4,attemptId:1});
    send('renderAbort',25,{lane:4,attemptId:1,activeMs:5});
    send('renderStart',30,{lane:1,attemptId:2});send('renderEnd',40,{lane:1,attemptId:2});
    setEcho('new');send('commit',45,{lane:1,attemptId:2,activeMs:15,renderActiveMs:10,idle:false});
    send('renderStart',50,{lane:4,attemptId:3});send('renderEnd',60,{lane:4,attemptId:3});
    send('commit',65,{lane:4,attemptId:3,activeMs:15,renderActiveMs:10,idle:true});
    const result=await finish();
    expect(result.raw.input[0]).toMatchObject({eventAt:10,renderAt:30,commitAt:45,frameAt:100});
    expect(result).toMatchObject({abortedTransitionCount:1,discardedTransitionMs:5,syncRenderActiveMean:10,inputBreakdownCount:1,heatmapSettleMs:90});
  });
  it('does not resolve two queued clicks when only the first click has committed', async () => {
    const { metrics, setSeq, commit, finish } = harness();
    metrics.markClick(11,11); metrics.markClick(12,12);
    setSeq(1); commit();
    const result = await finish();
    expect(result.clickCount).toBe(1); expect(result.pendingClickCount).toBe(1);
  });
  it('retains long frames/tasks overlapping the start boundary with original timestamps', async () => {
    const { notify, finish } = harness();
    notify('longtask', [{ startTime:5, duration:60 }]);
    notify('long-animation-frame', [{ startTime:5, duration:80, renderStart:65, styleAndLayoutStart:70,
      scripts:[{ startTime:5,duration:60,forcedStyleAndLayoutDuration:0 }] }]);
    const result = await finish();
    expect(result.longTaskCount).toBe(1); expect(result.loafCount).toBe(1);
    expect(result.raw.loafs[0].startTime).toBe(5);
    expect(result.raw.loafs[0].windowOverlap).toBe(true);
  });
});
