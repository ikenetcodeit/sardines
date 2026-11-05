import type { EnvironmentParams } from './config.ts'
import { Rng } from './rng.ts'

export interface FoodPatch {
  x: number
  y: number
  z: number
  radius: number
  /** 0–1 remaining plankton richness. */
  density: number
  /** Seconds until a depleted patch re-blooms elsewhere. */
  regrow: number
  seed: number
}

export interface Obstacle {
  x: number
  y: number
  z: number
  radius: number
  /** Rocks are vertical columns from the seafloor up to y. */
  height: number
}

export interface Disturbance {
  x: number
  y: number
  z: number
  radius: number
  strength: number
  age: number
  life: number
}

/**
 * Environmental fields: ocean currents, plankton patches, obstacles, the
 * surface/seafloor boundaries and short-lived hydrodynamic disturbances
 * (splashes, strikes). Pure data + math; rendering reads from it.
 */
export class Environment {
  time = 0
  params: EnvironmentParams
  food: FoodPatch[] = []
  obstacles: Obstacle[] = []
  disturbances: Disturbance[] = []
  /** Soft horizontal radius of the observed patch of ocean. */
  habitatRadius = 70
  /** Rotation of the mean current caused by slow variability (radians). */
  currentDrift = 0
  private rng = new Rng(7)

  constructor(params: EnvironmentParams) {
    this.params = params
  }

  get seafloorY() {
    return -this.params.oceanDepth
  }

  reset(seed: number, withObstacles: boolean) {
    this.rng.seed(seed * 7 + 3)
    this.time = 0
    this.currentDrift = 0
    this.disturbances.length = 0
    this.food.length = 0
    this.obstacles.length = 0
    this.syncFood()
    if (withObstacles) {
      const n = 7
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.rng.range(-0.3, 0.3)
        const r = this.rng.range(12, 50)
        const radius = this.rng.range(2.5, 6)
        this.obstacles.push({
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          y: this.seafloorY + this.rng.range(0.35, 0.8) * this.params.oceanDepth * 0.7,
          radius,
          height: 0,
        })
      }
    }
  }

  /** Add or remove plankton patches to match the plankton parameter. */
  syncFood() {
    const target = Math.round(this.params.plankton * 6)
    while (this.food.length > target) this.food.pop()
    while (this.food.length < target) {
      const p: FoodPatch = { x: 0, y: 0, z: 0, radius: 8, density: 1, regrow: 0, seed: this.rng.next() }
      this.placePatch(p)
      this.food.push(p)
    }
  }

  private placePatch(p: FoodPatch) {
    const a = this.rng.range(0, Math.PI * 2)
    const r = this.rng.range(8, this.habitatRadius * 0.75)
    p.x = Math.cos(a) * r
    p.z = Math.sin(a) * r
    const d = Math.min(this.params.oceanDepth - 6, this.rng.range(5, 24))
    p.y = -d
    p.radius = this.rng.range(6, 12)
    p.density = 0.6 + 0.4 * this.rng.next()
    p.regrow = 0
    p.seed = this.rng.next()
  }

  /**
   * Divergence-free (in the horizontal plane) current field: a mean flow that
   * weakens with depth, plus slowly evolving eddies derived from a stream
   * function so the flow stays physically coherent rather than jittery.
   */
  currentAt(x: number, y: number, z: number, out: Float32Array | number[], o = 0) {
    const p = this.params
    const t = this.time
    const ang = (p.currentDirection * Math.PI) / 180 + this.currentDrift
    // Shear: currents are typically stronger near the surface.
    const shear = 0.45 + 0.55 * Math.exp(y / 45)
    const U = p.currentStrength * shear
    let ux = Math.sin(ang) * U
    let uz = Math.cos(ang) * U
    // Eddies from stream function psi = A [sin(a x + w t) cos(b z) + sin(c z + w2 t) cos(d x + 1.3)]
    const A = (0.04 + p.currentVariability * (0.35 * p.currentStrength + 0.08)) * shear
    const a = 0.045
    const b = 0.038
    const c = 0.052
    const d = 0.031
    const w = 0.035
    const w2 = 0.027
    const s1 = Math.sin(a * x + w * t)
    const c1 = Math.cos(a * x + w * t)
    const cb = Math.cos(b * z)
    const sb = Math.sin(b * z)
    const s2 = Math.sin(c * z + w2 * t)
    const c2 = Math.cos(c * z + w2 * t)
    const cd = Math.cos(d * x + 1.3)
    const sd = Math.sin(d * x + 1.3)
    // u = dpsi/dz, w = -dpsi/dx  (scaled to velocity units by 1/k)
    const dpsidz = A * (-s1 * sb * b + c2 * c * cd) * 18
    const dpsidx = A * (c1 * a * cb - s2 * sd * d) * 18
    ux += dpsidz
    uz -= dpsidx
    const uy = 0.05 * A * Math.sin(x * 0.05 + t * 0.1) * Math.cos(z * 0.04 - t * 0.07) * 8
    out[o] = ux
    out[o + 1] = uy
    out[o + 2] = uz
  }

  /** A smooth, slowly varying preferred-depth field (thermocline-like structure). */
  preferredDepthAt(x: number, z: number, base: number) {
    const t = this.time
    return (
      base +
      3.5 * Math.sin(x * 0.04 + t * 0.03) * Math.cos(z * 0.05 - t * 0.02) +
      2.0 * Math.sin((x + z) * 0.021 + t * 0.011)
    )
  }

  /** Slow change of mean current direction (stronger with variability). */
  updateDrift() {
    this.currentDrift =
      this.params.currentVariability * (0.9 * Math.sin(this.time * 0.013) + 0.4 * Math.sin(this.time * 0.031 + 1.7))
  }

  addDisturbance(x: number, y: number, z: number, radius: number, strength: number, life = 1.2) {
    if (this.disturbances.length > 48) this.disturbances.shift()
    this.disturbances.push({ x, y, z, radius, strength, age: 0, life })
  }

  step(dt: number) {
    this.time += dt
    const p = this.params
    this.updateDrift()

    for (let i = this.disturbances.length - 1; i >= 0; i--) {
      const d = this.disturbances[i]
      d.age += dt
      if (d.age > d.life) this.disturbances.splice(i, 1)
    }

    const tmp = [0, 0, 0]
    for (const f of this.food) {
      // Plankton drifts passively with the water.
      this.currentAt(f.x, f.y, f.z, tmp)
      f.x += tmp[0] * dt
      f.y += tmp[1] * dt
      f.z += tmp[2] * dt
      const r = Math.hypot(f.x, f.z)
      if (r > this.habitatRadius * 1.4) {
        f.density -= dt * 0.05
      }
      if (f.density <= 0.03) {
        f.density = 0
        f.regrow += dt
        if (f.regrow > 12) this.placePatch(f)
      } else if (f.density < 1) {
        f.density = Math.min(1, f.density + dt * 0.004 * (0.5 + p.plankton))
      }
    }
  }

  /** Plankton richness at a point (0–1) and index of the strongest patch. */
  foodAt(x: number, y: number, z: number): number {
    let best = 0
    for (const f of this.food) {
      if (f.density <= 0) continue
      const dx = x - f.x
      const dy = y - f.y
      const dz = z - f.z
      const d2 = dx * dx + dy * dy * 2 + dz * dz
      const r2 = f.radius * f.radius
      if (d2 < r2) {
        const v = f.density * (1 - d2 / r2)
        if (v > best) best = v
      }
    }
    return best
  }
}
