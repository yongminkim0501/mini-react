export const SLICE_MS = 5;
export interface SliceJob { runSlice(shouldYield: () => boolean): boolean }

/** One root per host task, FIFO rotation. No priorities, preemption or restart. */
export class SliceScheduler {
  private queue: SliceJob[] = [];
  private queued = new Set<SliceJob>();
  private posted = false;
  private closed = false;
  private channel: MessageChannel | null = null;
  constructor(
    private readonly now = () => performance.now(),
    private readonly post?: (callback: () => void) => void,
  ) {}

  enqueue(job: SliceJob) {
    if (this.closed) throw new Error('Scheduler is disposed');
    if (!this.queued.has(job)) { this.queued.add(job); this.queue.push(job); }
    this.requestTask();
  }
  cancel(job: SliceJob) {
    this.queued.delete(job);
    this.queue = this.queue.filter((item) => item !== job);
  }
  private requestTask() {
    if (this.posted || !this.queue.length || this.closed) return;
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
    const job = this.queue.shift();
    if (!job) return;
    this.queued.delete(job);
    const deadline = this.now() + SLICE_MS;
    try { if (job.runSlice(() => this.now() >= deadline)) this.enqueue(job); }
    finally { this.requestTask(); }
  }
  dispose() {
    this.closed = true;
    this.queue = []; this.queued.clear();
    this.channel?.port1.close(); this.channel?.port2.close(); this.channel = null;
  }
}
