import type { SimParams } from './config.ts'
import type { Frame, ToWorker } from './protocol.ts'
import type { ScenarioId } from './scenarios.ts'

/**
 * Main-thread handle to the simulation worker. Keeps the two most recent
 * snapshots so the renderer can interpolate between fixed simulation steps.
 */
export class SimClient {
  private worker: Worker
  prev: Frame | null = null
  cur: Frame | null = null
  /** performance.now() when `cur` arrived. */
  curAt = 0
  /** Real-time duration (ms) the renderer should take to move from prev to cur. */
  span = 33
  frameListeners = new Set<(f: Frame) => void>()
  /** Real ms between incoming frames (EMA) — a measure of simulation throughput. */
  frameInterval = 33

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (ev: MessageEvent<Frame>) => this.receive(ev.data)
  }

  private receive(f: Frame) {
    const now = performance.now()
    if (!this.cur || f.version !== this.cur.version) {
      this.prev = f
    } else if (f.tick !== this.cur.tick) {
      this.prev = this.cur
      this.frameInterval = this.frameInterval * 0.9 + (now - this.curAt) * 0.1
    } else {
      // same tick re-posted (e.g. after a UI message while paused): keep interpolation base
      this.prev = this.prev && this.prev.tick !== f.tick ? this.prev : f
    }
    this.cur = f
    this.curAt = now
    const dtSim = this.prev ? f.simTime - this.prev.simTime : 0
    this.span = dtSim > 0 ? Math.max(8, Math.min(400, (dtSim / Math.max(0.01, f.timeScale)) * 1000)) : 33
    for (const l of this.frameListeners) l(f)
  }

  /** Interpolation factor for "now". */
  alpha(now: number) {
    if (!this.cur || !this.prev || this.prev === this.cur || this.cur.paused) return 1
    return Math.min(1, Math.max(0, (now - this.curAt) / this.span))
  }

  send(msg: ToWorker) {
    this.worker.postMessage(msg)
  }

  load(scenario: ScenarioId, seed: number, params: SimParams) {
    this.send({ type: 'load', scenario, seed, params })
  }
}

export const simClient = new SimClient()
