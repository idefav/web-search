import { WebToolError } from "./errors.js";

interface Waiter { resolve: (slot: number) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }

export class SlotSemaphore {
  private readonly available: number[];
  private readonly waiters: Waiter[] = [];
  constructor(size: number, private readonly maxQueue = 20, private readonly queueTimeoutMs = 5_000) {
    this.available = Array.from({ length: size }, (_, index) => index + 1);
  }

  async acquire(): Promise<{ slot: number; release: () => void }> {
    const immediate = this.available.shift();
    if (immediate !== undefined) return { slot: immediate, release: () => this.release(immediate) };
    if (this.waiters.length >= this.maxQueue) throw new WebToolError("busy", "The browser queue is full", true);
    const slot = await new Promise<number>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new WebToolError("busy", "Timed out waiting for a browser slot", true));
        }, this.queueTimeoutMs)
      };
      this.waiters.push(waiter);
    });
    return { slot, release: () => this.release(slot) };
  }

  private release(slot: number): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(slot);
    } else {
      this.available.push(slot);
    }
  }
}
