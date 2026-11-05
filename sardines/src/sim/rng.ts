/** Small, fast, seedable PRNG (mulberry32) so scenarios are reproducible. */
export class Rng {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0 || 1
  }
  seed(seed: number) {
    this.s = seed >>> 0 || 1
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next()
  }
  int(n: number) {
    return Math.floor(this.next() * n)
  }
  /** Approximately normal(0,1). */
  gauss() {
    let u = 0
    let v = 0
    while (u === 0) u = this.next()
    while (v === 0) v = this.next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  /** Uniform random unit vector written into out[o..o+2]. */
  unit(out: Float32Array | number[], o = 0) {
    const z = this.range(-1, 1)
    const a = this.range(0, Math.PI * 2)
    const r = Math.sqrt(1 - z * z)
    out[o] = r * Math.cos(a)
    out[o + 1] = z
    out[o + 2] = r * Math.sin(a)
  }
}
