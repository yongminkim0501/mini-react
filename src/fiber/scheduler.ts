import { DefaultLane, SyncLane } from './lanes';
export const SLICE_MS = 5;
export interface SliceJob { runSlice(shouldYield: () => boolean): boolean; getPriority?(): number }

/** FIFO for fiber-slice; optional global lane selection + Sync microtask drain for fiber. */
export class SliceScheduler {
  private queue: SliceJob[] = [];
  private queued = new Set<SliceJob>();
  private posted = false;
  private closed = false;
  private channel: MessageChannel | null = null;
  private syncPosted = false;
  private flushingHost = false;
  constructor(
    private readonly now = () => performance.now(),
    private readonly post?: (callback: () => void) => void,
    private readonly prioritized = false,
    private readonly postSync = (callback: () => void) => queueMicrotask(callback),
  ) {}

  enqueue(job: SliceJob) {
    if (this.closed) throw new Error('Scheduler is disposed');
    if (!this.queued.has(job)) { this.queued.add(job); this.queue.push(job); }
    if (this.prioritized && job.getPriority?.() === SyncLane && !this.syncPosted) {
      this.syncPosted = true;
      this.postSync(() => {
        this.syncPosted = false;
        if (this.closed) return;
        while (this.queue.some((job) => job.getPriority?.() === SyncLane)) this.runNext(true);
      });
    }
    this.requestTask();
  }
  cancel(job: SliceJob) {
    this.queued.delete(job);
    this.queue = this.queue.filter((item) => item !== job);
  }
  private requestTask() {
    if (this.posted || !this.queue.length || this.closed || this.flushingHost) return;
    this.posted = true;
    if (this.post) this.post(() => this.flush());
    else {
      if (!this.channel) {
        this.channel = new MessageChannel();
        this.channel.port1.onmessage = () => this.flush();
      }
      this.channel.port2.postMessage(null);
    }
  }
  private flush() {
    this.posted = false;
    if (this.closed) return;
    if (!this.prioritized) { this.runNext(false); return; }
    const deadline = this.now() + SLICE_MS;
    this.flushingHost = true;
    try {
      do { this.runNext(false, deadline); }
      while (this.queue.length && this.now() < deadline);
    } finally {
      this.flushingHost = false;
      this.requestTask();
    }
  }
  private runNext(sync: boolean, hostDeadline?: number) {
    let index = 0;
    if (this.prioritized) {
      for (let i = 1; i < this.queue.length; i++) {
        if ((this.queue[i]!.getPriority?.() ?? DefaultLane) < (this.queue[index]!.getPriority?.() ?? DefaultLane)) index = i;
      }
    }
    const job = this.queue.splice(index, 1)[0];
    if (!job) return;
    this.queued.delete(job);
    const deadline = hostDeadline ?? this.now() + SLICE_MS;
    try { if (job.runSlice(() => !sync && this.now() >= deadline)) this.enqueue(job); }
    finally { this.requestTask(); }
  }
  dispose() {
    this.closed = true;
    this.queue = []; this.queued.clear();
    this.channel?.port1.close(); this.channel?.port2.close(); this.channel = null;
  }
}
