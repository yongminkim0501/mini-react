import { percentile } from './stats.js';

export function latencySample(p, frameAt, commitAt) {
  const plannedAt = p.intendedAt ?? p.timeStamp;
  const eventAt = p.executedAt ?? p.timeStamp;
  const renderAt = p.renderStartAt ?? NaN;
  return {
    main: frameAt - plannedAt, event: frameAt - p.timeStamp,
    plannedAt, eventAt, renderAt, commitAt, frameAt,
    plannedToEvent: eventAt - plannedAt,
    eventToRender: renderAt - eventAt,
    renderToCommit: commitAt - renderAt,
    commitToFrame: frameAt - commitAt,
  };
}

export function summarizeBreakdown(samples, prefix) {
  const complete = samples.filter((s) => [s.plannedToEvent,s.eventToRender,s.renderToCommit,s.commitToFrame].every(Number.isFinite));
  return {
    [`${prefix}BreakdownCount`]: complete.length,
    ...Object.fromEntries(['plannedToEvent','eventToRender','renderToCommit','commitToFrame'].map((key) => [
      `${prefix}${key[0].toUpperCase()}${key.slice(1)}P95`, percentile(complete.map((s)=>s[key]),95),
    ])),
  };
}
