import type { Child } from '../runtime/types';
import { commitRoot } from './commit';
import { performUnitOfWork, prepareRoot } from './workLoop';
import type { EngineEvent, FiberNode, PassiveEffect, RenderHost } from './types';
import type { SliceScheduler } from './scheduler';

export class FiberRoot implements RenderHost {
  current: FiberNode | null = null;
  workInProgress: FiberNode | null = null;
  alive = false;
  rendering = false;
  effects: PassiveEffect[] = [];
  placements: FiberNode[] = [];
  updates: FiberNode[] = [];
  deletions: FiberNode[] = [];
  private scheduled = false;
  private epoch = 0;
  private attempt = 0;
  private passive: PassiveEffect[] = [];
  private raf: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushingPassive = false;
  private passiveChain = 0;
  private nextUnit: FiberNode | null = null;
  private activeMs = 0;
  private lastError: unknown = null;
  private idleWaiters: { resolve(): void; reject(error: unknown): void }[] = [];

  constructor(
    readonly component: (props: any) => Child,
    readonly container: Element,
    readonly label: string,
    readonly props: object,
    private readonly emit: (event: EngineEvent) => void,
    private readonly scheduler?: SliceScheduler,
  ) {}

  mount() {
    if (this.alive) return;
    this.alive = true;
    this.epoch++;
    // Match stack mount's replacement of previous container contents.
    if (this.scheduler) this.schedule();
    else this.update();
  }

  schedule() {
    if (this.scheduled) return true;
    if (this.flushingPassive) {
      if (this.passiveChain >= 100) {
        console.error('Fiber effect의 연속 업데이트가 100회를 넘어 중단했습니다');
        return false;
      }
      this.passiveChain++;
    } else this.passiveChain = 0;
    this.scheduled = true;
    if (this.scheduler) {
      this.scheduler.enqueue(this);
      return true;
    }
    const epoch = this.epoch;
    queueMicrotask(() => {
      if (epoch !== this.epoch || !this.alive) return;
      this.scheduled = false;
      this.update();
    });
    return true;
  }

  update() {
    if (!this.alive || this.rendering) return;
    if (this.scheduler) { this.schedule(); return; }
    this.runSlice(() => false);
  }

  runSlice(shouldYield: () => boolean): boolean {
    if (!this.alive) return false;
    const event = (type: EngineEvent['type'], extra = {}) => this.emit({
      type, root: this, label: this.label, t: performance.now(), attemptId: this.attempt, ...extra,
    });
    const mounted = this.current === null;
    const sliceStart = performance.now();
    this.rendering = true;
    try {
      if (!this.nextUnit) {
        this.scheduled = false;
        this.lastError = null;
        this.attempt++;
        this.activeMs = 0;
        event('renderStart');
        this.nextUnit = prepareRoot(this, this.container);
      }
      // At least one unit even if a host task was delayed. A unit itself cannot be preempted.
      do { this.nextUnit = performUnitOfWork(this, this.nextUnit); }
      while (this.nextUnit && !shouldYield());
    } catch (error) {
      this.lastError = error;
      this.nextUnit = null;
      this.scheduled = false;
      this.workInProgress = null;
      this.effects = [];
      if (mounted) this.alive = false;
      event('renderEnd', { ok: false });
      event('renderError');
      console.error('Fiber 렌더링 실패', error);
      this.settleIdle();
      return false;
    } finally {
      this.rendering = false;
    }
    const sliceMs = performance.now() - sliceStart;
    this.activeMs += sliceMs;
    event('renderSlice', { activeMs: sliceMs });
    if (this.nextUnit) return true;
    event('renderEnd', { ok: true });
    // Commit errors propagate: DOM writes are not rollback-safe. Never report success.
    const patchCount = this.placements.length + this.deletions.length + this.updates.length;
    const commitStart = performance.now();
    try {
      if (mounted) this.container.replaceChildren();
      commitRoot(this);
    } catch (error) {
      this.lastError = error;
      this.scheduled = false;
      event('renderError'); this.settleIdle();
      throw error;
    }
    this.activeMs += performance.now() - commitStart;
    event('commit', { mounted, patchCount, activeMs: this.activeMs });
    this.passive.push(...this.effects);
    this.effects = [];
    this.queuePassive();
    this.settleIdle();
    return this.scheduled;
  }

  whenIdle(): Promise<void> {
    if (!this.nextUnit && !this.scheduled) return this.lastError ? Promise.reject(this.lastError) : Promise.resolve();
    return new Promise((resolve, reject) => this.idleWaiters.push({ resolve, reject }));
  }
  private settleIdle() {
    if (this.nextUnit || this.scheduled) return;
    for (const waiter of this.idleWaiters.splice(0)) {
      if (this.lastError) waiter.reject(this.lastError); else waiter.resolve();
    }
  }

  private queuePassive() {
    if (!this.passive.length || this.raf !== null || this.timer !== null) return;
    const epoch = this.epoch;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      // rAF itself precedes paint. Give the browser a rendering opportunity before the task.
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.alive && epoch === this.epoch) this.flushPassiveEffects();
      }, 0);
    });
  }

  /** Explicit drain for tests; normal operation always uses rAF -> task. */
  flushPassiveEffects() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    if (this.timer !== null) clearTimeout(this.timer);
    this.raf = this.timer = null;
    const effects = this.passive.splice(0);
    const epoch = this.epoch;
    this.flushingPassive = true;
    try {
      for (const { cell, create } of effects) {
        if (!this.alive || epoch !== this.epoch) break;
        try { cell.cleanup?.(); } catch (error) { console.error('Fiber effect cleanup 실패', error); }
        cell.cleanup = undefined;
        try {
          const cleanup = create();
          if (typeof cleanup === 'function') {
            if (!this.alive || epoch !== this.epoch) cleanup();
            else cell.cleanup = cleanup;
          }
        } catch (error) { console.error('Fiber effect 실패', error); }
      }
    } finally {
      this.flushingPassive = false;
    }
  }

  unmount() {
    this.scheduler?.cancel(this);
    this.alive = false;
    this.epoch++;
    this.scheduled = false;
    this.nextUnit = null;
    this.lastError = null;
    this.settleIdle();
    this.passiveChain = 0;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    if (this.timer !== null) clearTimeout(this.timer);
    this.raf = this.timer = null;
    this.passive = [];
    for (const hook of this.current?.hooks ?? []) {
      if (hook.kind === 'state') hook.queue.active = false;
      if (hook.kind === 'effect') {
        try { hook.cell.cleanup?.(); } catch (error) { console.error('Fiber cleanup 실패', error); }
        hook.cell.cleanup = undefined;
      }
    }
    this.current = this.workInProgress = null;
    this.effects = [];
    this.placements = this.updates = this.deletions = [];
    this.container.replaceChildren();
  }
}
