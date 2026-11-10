/** Diagnostic attribution, not causal proof. Short/cross-origin scripts can be omitted. */
export function splitLongFrame(entry) {
  const start = entry.startTime, end = start + entry.duration;
  const renderStart = entry.renderStart > 0 ? Math.min(end, Math.max(start, entry.renderStart)) : end;
  const styleStart = entry.styleAndLayoutStart > 0 ? Math.min(end, Math.max(renderStart, entry.styleAndLayoutStart)) : end;
  const scripts = Array.from(entry.scripts ?? [], (s) => ({
    startTime: s.startTime, duration: s.duration,
    forcedStyleAndLayoutDuration: s.forcedStyleAndLayoutDuration ?? 0,
    invoker: s.invoker ?? '', sourceURL: s.sourceURL ?? '',
  }));
  const scriptMs = scripts.reduce((sum, s) => sum + Math.max(0, s.duration - s.forcedStyleAndLayoutDuration), 0);
  const forcedStyleAndLayoutMs = scripts.reduce((sum, s) => sum + s.forcedStyleAndLayoutDuration, 0);
  const styleAndLayoutMs = end - styleStart;
  const renderingMs = styleAndLayoutMs + forcedStyleAndLayoutMs;
  return {
    startTime: start, duration: entry.duration, renderStart: entry.renderStart,
    styleAndLayoutStart: entry.styleAndLayoutStart, blockingDuration: entry.blockingDuration,
    beforeRenderMs: renderStart - start, rafPhaseMs: styleStart - renderStart,
    renderPhaseMs: end - renderStart, styleAndLayoutMs, forcedStyleAndLayoutMs,
    scriptMs, renderingMs,
    cause: scriptMs === 0 && renderingMs === 0 ? 'unknown' : scriptMs >= renderingMs ? 'js' : 'rendering',
    scripts,
  };
}

export function summarizeLongFrames(frames, supported) {
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  const category = (cause) => frames.filter((f) => f.cause === cause);
  const js = category('js'), rendering = category('rendering'), unknown = category('unknown');
  return {
    loafCount: supported ? frames.length : NaN,
    loafJsCount: supported ? js.length : NaN,
    loafJsFrameMs: supported ? sum(js.map((f) => f.duration)) : NaN,
    loafRenderingCount: supported ? rendering.length : NaN,
    loafRenderingFrameMs: supported ? sum(rendering.map((f) => f.duration)) : NaN,
    loafUnknownCount: supported ? unknown.length : NaN,
    loafScriptMs: supported ? sum(frames.map((f) => f.scriptMs)) : NaN,
    loafRenderingMs: supported ? sum(frames.map((f) => f.renderingMs)) : NaN,
  };
}
