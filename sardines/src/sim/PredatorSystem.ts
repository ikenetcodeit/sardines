import { MIXED_ORDER, SPECIES, type PredatorSpecies, type SimParams, type SpeciesDef } from './config.ts'
import type { Environment } from './Environment.ts'
import { Rng } from './rng.ts'
import { PV_STRIDE, type SardineSchool } from './SardineSchool.ts'
import { clamp, limitPitch, rotateToward } from './steering.ts'

export type PredatorState =
  | 'patrol'
  | 'approach'
  | 'herd'
  | 'stalk'
  | 'attack'
  | 'slash'
  | 'retreat'
  | 'soar'
  | 'dive'
  | 'underwater'
  | 'surfacing'
  | 'resting'
  | 'takeoff'

export const ATTACK_STATES: ReadonlySet<PredatorState> = new Set(['attack', 'slash', 'dive', 'underwater'])

export interface Sensed {
  count: number
  cx: number
  cy: number
  cz: number
  vx: number
  vy: number
  vz: number
  radius: number
  nearest: number
  nearestD: number
  exposed: number
}

export interface Predator {
  id: number
  species: PredatorSpecies
  def: SpeciesDef
  pos: Float32Array
  prevPos: Float32Array
  dir: Float32Array
  prevDir: Float32Array
  speed: number
  roll: number
  prevRoll: number
  state: PredatorState
  timer: number
  cooldown: number
  targetId: number
  attempted: boolean
  captures: number
  misses: number
  tailPhase: number
  /** 0 = wings spread, 1 = folded (birds only). */
  wingFold: number
  homeX: number
  homeZ: number
  sensed: Sensed
  /** True when the sensed information came from a pod-mate rather than own senses. */
  shared: boolean
}

export interface PredatorEvent {
  seq: number
  time: number
  text: string
  kind: 'capture' | 'miss' | 'demo'
  fishId: number
  species: PredatorSpecies
}

const tmpDir = new Float32Array(3)

export class PredatorSystem {
  predators: Predator[] = []
  /** Compact view consumed by the sardine update. */
  pv = new Float32Array(32 * PV_STRIDE)
  events: PredatorEvent[] = []
  totalCaptures = 0
  totalAttempts = 0
  private nextId = 1
  eventSeq = 0
  private rng = new Rng(99)
  private tick = 0
  time = 0

  reset(seed: number) {
    this.predators.length = 0
    this.events.length = 0
    this.totalCaptures = 0
    this.totalAttempts = 0
    this.nextId = 1
    this.rng.seed(seed * 13 + 5)
    this.time = 0
  }

  private speciesFor(i: number, params: SimParams): PredatorSpecies {
    const s = params.predators.species
    return s === 'mixed' ? MIXED_ORDER[i % MIXED_ORDER.length] : s
  }

  /** Match the predator list to the parameters (count/species), spawning at a distance. */
  sync(params: SimParams, school: SardineSchool, spawnDelayed = false) {
    const want = Math.max(0, Math.min(12, Math.round(params.predators.count)))
    for (let i = 0; i < this.predators.length; i++) {
      const sp = this.speciesFor(i, params)
      if (this.predators[i].species !== sp) {
        this.predators[i] = this.create(sp, school, spawnDelayed)
      }
    }
    while (this.predators.length > want) this.predators.pop()
    while (this.predators.length < want) {
      this.predators.push(this.create(this.speciesFor(this.predators.length, params), school, spawnDelayed))
    }
  }

  private create(species: PredatorSpecies, school: SardineSchool, far: boolean): Predator {
    const def = SPECIES[species]
    const r = this.rng
    // spawn at a distance from the fish so encounters develop naturally
    let cx = 0
    let cy = -12
    let cz = 0
    const n = school.count
    if (n > 0) {
      const step = Math.max(1, Math.floor(n / 200))
      let k = 0
      cx = cy = cz = 0
      for (let i = 0; i < n; i += step) {
        cx += school.pos[i * 3]
        cy += school.pos[i * 3 + 1]
        cz += school.pos[i * 3 + 2]
        k++
      }
      cx /= k
      cy /= k
      cz /= k
    }
    const a = r.range(0, Math.PI * 2)
    const d = far ? r.range(55, 70) : r.range(38, 50)
    const x = cx + Math.cos(a) * d
    const z = cz + Math.sin(a) * d
    const y = def.airborne ? r.range(16, 24) : Math.min(-2, cy + r.range(-6, 4))
    const dx = cx - x
    const dz = cz - z
    const l = Math.hypot(dx, dz) || 1
    const p: Predator = {
      id: this.nextId++,
      species,
      def,
      pos: new Float32Array([x, y, z]),
      prevPos: new Float32Array([x, y, z]),
      dir: new Float32Array([dx / l, 0, dz / l]),
      prevDir: new Float32Array([dx / l, 0, dz / l]),
      speed: def.cruise,
      roll: 0,
      prevRoll: 0,
      state: def.airborne ? 'soar' : 'patrol',
      timer: 0,
      cooldown: r.range(3, 8),
      targetId: -1,
      attempted: false,
      captures: 0,
      misses: 0,
      tailPhase: r.range(0, 6.28),
      wingFold: 0,
      homeX: x * 0.5,
      homeZ: z * 0.5,
      sensed: { count: 0, cx: 0, cy: 0, cz: 0, vx: 0, vy: 0, vz: 0, radius: 0, nearest: -1, nearestD: Infinity, exposed: -1 },
      shared: false,
    }
    return p
  }

  /** What prey a predator can currently perceive (local information only). */
  private sense(p: Predator, school: SardineSchool, params: SimParams, env: Environment) {
    const s = p.sensed
    const n = school.count
    const pos = school.pos
    const pp = params.predators
    let R = pp.detectionRange
    if (p.species === 'shark' || p.species === 'sailfish') R = Math.min(R, env.params.visibility * 1.2)
    // dolphins echolocate, so turbidity limits them less
    if (p.species === 'dolphin') R = Math.min(R, Math.max(env.params.visibility * 2, 20))
    const bird = p.def.airborne
    if (bird) R = Math.min(R * 1.2, 60)
    const R2 = R * R
    const px = p.pos[0]
    const py = p.pos[1]
    const pz = p.pos[2]
    let cnt = 0
    let cx = 0
    let cy = 0
    let cz = 0
    let vx = 0
    let vy = 0
    let vz = 0
    let nearest = -1
    let nearestD = Infinity
    let exposed = -1
    let exposedScore = Infinity
    const shallowLimit = -3 - env.params.visibility * 0.08
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const fy = pos[i3 + 1]
      if (bird && fy < shallowLimit) continue
      const dx = pos[i3] - px
      const dy = bird ? 0 : fy - py
      const dz = pos[i3 + 2] - pz
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 > R2) continue
      cnt++
      cx += pos[i3]
      cy += fy
      cz += pos[i3 + 2]
      const spd = school.speed[i]
      vx += school.dir[i3] * spd
      vy += school.dir[i3 + 1] * spd
      vz += school.dir[i3 + 2] * spd
      const d3 = bird ? d2 + (fy - py) * (fy - py) * 0.05 : d2
      if (d3 < nearestD) {
        nearestD = d3
        nearest = i
      }
      // exposed: few neighbours and close
      const sc = Math.sqrt(d3) * (0.6 + school.nbrCount[i] / 8) * (1 - 0.4 * Math.min(1, school.kthDist[i]))
      if (sc < exposedScore) {
        exposedScore = sc
        exposed = i
      }
    }
    s.count = cnt
    s.nearest = nearest
    s.nearestD = Math.sqrt(nearestD)
    s.exposed = exposed
    if (cnt > 0) {
      s.cx = cx / cnt
      s.cy = cy / cnt
      s.cz = cz / cnt
      s.vx = vx / cnt
      s.vy = vy / cnt
      s.vz = vz / cnt
      // RMS radius from a subsample
      let r2 = 0
      let m = 0
      const step = Math.max(1, Math.floor(n / 400))
      for (let i = 0; i < n; i += step) {
        const i3 = i * 3
        const dx = pos[i3] - s.cx
        const dy = pos[i3 + 1] - s.cy
        const dz = pos[i3 + 2] - s.cz
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 < R2) {
          r2 += d2
          m++
        }
      }
      s.radius = m > 0 ? Math.sqrt(r2 / m) : 2
    }
    p.shared = false
  }

  private steer(p: Predator, tx: number, ty: number, tz: number, targetSpeed: number, turnMul: number, dt: number) {
    const d = p.def
    rotateToward(p.dir, 0, tx, ty, tz, d.turnRate * turnMul * dt, tmpDir, 0)
    const ox = p.dir[0]
    const oz = p.dir[2]
    p.dir[0] = tmpDir[0]
    p.dir[1] = tmpDir[1]
    p.dir[2] = tmpDir[2]
    if (!d.airborne || p.state === 'underwater' || p.state === 'surfacing') limitPitch(p.dir, 0, 0.6)
    const yawRate = (oz * p.dir[0] - ox * p.dir[2]) / dt
    p.prevRoll = p.roll
    const rollT = clamp(-yawRate * (d.airborne ? 0.9 : 0.35), -1.0, 1.0)
    p.roll += (rollT - p.roll) * Math.min(1, dt * 3)
    const acc = d.accel
    p.speed += clamp(targetSpeed - p.speed, -acc * dt, acc * dt)
  }

  step(dt: number, params: SimParams, school: SardineSchool, env: Environment) {
    this.time += dt
    this.tick++
    const pp = params.predators
    const intensity = pp.huntingIntensity
    const smul = pp.speedMultiplier
    const r = this.rng
    const preds = this.predators
    const floorY = env.seafloorY
    const Rh = env.habitatRadius * 1.3

    for (let k = 0; k < preds.length; k++) {
      const p = preds[k]
      if ((this.tick + k) % 3 === 0) this.sense(p, school, params, env)
    }

    // Dolphin pods share information (calls/whistles) and coordinate herding.
    const dolphins = preds.filter((p) => p.species === 'dolphin')
    let podCount = 0
    let podX = 0
    let podY = 0
    let podZ = 0
    let podR = 0
    for (const d of dolphins) {
      if (d.sensed.count > 5) {
        podCount++
        podX += d.sensed.cx
        podY += d.sensed.cy
        podZ += d.sensed.cz
        podR += d.sensed.radius
      }
    }
    if (podCount > 0) {
      podX /= podCount
      podY /= podCount
      podZ /= podCount
      podR /= podCount
    }

    let dolphinSlot = 0
    for (let k = 0; k < preds.length; k++) {
      const p = preds[k]
      const d = p.def
      const s = p.sensed
      p.prevPos[0] = p.pos[0]
      p.prevPos[1] = p.pos[1]
      p.prevPos[2] = p.pos[2]
      p.prevDir[0] = p.dir[0]
      p.prevDir[1] = p.dir[1]
      p.prevDir[2] = p.dir[2]
      p.timer += dt
      p.cooldown -= dt * (0.4 + intensity)
      const cruise = d.cruise * smul
      const vmax = d.maxSpeed * smul
      const px = p.pos[0]
      const py = p.pos[1]
      const pz = p.pos[2]
      let tx = p.dir[0]
      let ty = p.dir[1]
      let tz = p.dir[2]
      let tSpeed = cruise
      let turnMul = 1
      const hunting = intensity > 0.04

      switch (p.species) {
        case 'dolphin': {
          const hasPod = podCount > 0
          if (p.state === 'attack') {
            const ti = school.indexOfId(p.targetId)
            if (ti < 0 || p.timer > 2.6 || p.attempted) {
              p.state = hasPod ? 'herd' : 'patrol'
              p.timer = 0
              p.cooldown = (36 - 20 * intensity) * r.range(0.7, 1.3)
            } else {
              const t3 = ti * 3
              tx = school.pos[t3] + school.dir[t3] * school.speed[ti] * 0.3 - px
              ty = school.pos[t3 + 1] - py
              tz = school.pos[t3 + 2] + school.dir[t3 + 2] * school.speed[ti] * 0.3 - pz
              tSpeed = vmax
              turnMul = 1.6
              this.tryCapture(p, ti, school, params, env)
            }
          } else if (hasPod && hunting) {
            p.state = 'herd'
            // Coordinated encirclement: each dolphin takes a slot around the
            // aggregation, mostly beside and below it, pushing fish together and upward.
            const m = Math.max(1, dolphins.length)
            const slot = dolphinSlot++
            const ang = (slot / m) * Math.PI * 2 + this.time * 0.22
            const tighten = 1 - 0.35 * intensity * Math.min(1, p.timer / 40)
            const Ro = clamp(podR * 1.1 + 4, 5, 15) * tighten
            const below = slot % 2 === 0 ? 0.55 : 0.15
            const sx = podX + Math.cos(ang) * Ro
            const sz = podZ + Math.sin(ang) * Ro
            const sy = Math.min(-1.2, podY - Ro * below)
            tx = sx - px
            ty = sy - py
            tz = sz - pz
            // keep moving tangentially when on station
            const dd = Math.hypot(tx, ty, tz)
            tx += -Math.sin(ang) * 3
            tz += Math.cos(ang) * 3
            tSpeed = clamp(dd * 0.7, cruise * 0.9, vmax * 0.85)
            if (p.cooldown <= 0 && s.nearest >= 0 && s.nearestD < Ro * 1.6) {
              p.state = 'attack'
              p.timer = 0
              p.attempted = false
              p.targetId = school.ids[s.nearest]
            }
          } else if (hasPod) {
            // not hunting: follow at a distance
            tx = podX - px
            ty = podY - 4 - py
            tz = podZ - pz
            if (Math.hypot(tx, tz) < 18) {
              const sx = tx
              tx = -tz
              tz = sx
            }
            p.state = 'approach'
          } else {
            p.state = 'patrol'
            this.patrol(p, dt, Rh)
            tx = p.homeX - px
            ty = -8 - py
            tz = p.homeZ - pz
          }
          break
        }
        case 'shark': {
          if (p.state === 'attack') {
            const ti = s.nearest
            if (ti < 0 || p.timer > 3 || p.attempted) {
              p.state = 'retreat'
              p.timer = 0
              p.cooldown = (26 - 20 * intensity) * r.range(0.7, 1.3)
            } else {
              const t3 = ti * 3
              tx = school.pos[t3] - px
              ty = school.pos[t3 + 1] - py
              tz = school.pos[t3 + 2] - pz
              tSpeed = vmax
              this.tryCapture(p, ti, school, params, env)
            }
          } else if (p.state === 'retreat') {
            tSpeed = cruise
            if (p.timer > 5) p.state = 'patrol'
          } else if (s.count > 0) {
            p.state = 'approach'
            tx = s.cx - px
            ty = s.cy - py
            tz = s.cz - pz
            const dd = Math.hypot(tx, ty, tz)
            // slow, curious circling at range when not hungry
            if (!hunting || p.cooldown > 0) {
              if (dd < s.radius + 9) {
                const sx = tx
                tx = -tz
                tz = sx
              }
              tSpeed = cruise
            } else {
              tSpeed = cruise * 1.3
              if (s.nearestD < 9) {
                p.state = 'attack'
                p.timer = 0
                p.attempted = false
              }
            }
          } else {
            p.state = 'patrol'
            this.patrol(p, dt, Rh)
            tx = p.homeX - px
            ty = -10 - py
            tz = p.homeZ - pz
          }
          break
        }
        case 'sailfish': {
          if (p.state === 'attack') {
            const ti = school.indexOfId(p.targetId)
            if (ti < 0 || p.timer > 3) {
              p.state = 'retreat'
              p.timer = 0
            } else {
              const t3 = ti * 3
              tx = school.pos[t3] - px
              ty = school.pos[t3 + 1] - py
              tz = school.pos[t3 + 2] - pz
              tSpeed = vmax
              turnMul = 1.4
              if (Math.hypot(tx, ty, tz) < 2.6) {
                p.state = 'slash'
                p.timer = 0
                p.attempted = false
              }
            }
          } else if (p.state === 'slash') {
            // rapid lateral bill swipes into the school's edge
            const sw = Math.sin(p.timer * 28) * 2.2
            tx = p.dir[0] + -p.dir[2] * sw
            ty = p.dir[1]
            tz = p.dir[2] + p.dir[0] * sw
            tSpeed = cruise * 1.4
            turnMul = 4
            const bx = px + p.dir[0] * d.length * 0.6
            const by = py + p.dir[1] * d.length * 0.6
            const bz = pz + p.dir[2] * d.length * 0.6
            if ((this.tick & 3) === 0) env.addDisturbance(bx, by, bz, 3.5, 0.9, 0.6)
            if (!p.attempted) {
              let best = -1
              let bd = d.captureRadius
              school.grid.query(school.pos, bx, by, bz, d.captureRadius, (i, d2) => {
                const dd = Math.sqrt(d2)
                if (dd < bd && i < school.count) {
                  bd = dd
                  best = i
                }
              })
              if (best >= 0) this.tryCapture(p, best, school, params, env, true)
            }
            if (p.timer > 0.7) {
              if (!p.attempted) {
                p.misses++
                this.totalAttempts++
              }
              p.state = 'retreat'
              p.timer = 0
              p.cooldown = (18 - 14 * intensity) * r.range(0.7, 1.3)
            }
          } else if (p.state === 'retreat') {
            tSpeed = cruise
            if (s.count > 0) {
              tx = px - s.cx
              ty = 0
              tz = pz - s.cz
            }
            if (p.timer > 3.5) p.state = 'stalk'
          } else if (s.count > 0) {
            p.state = 'stalk'
            // patrol around the edge of the school
            const dx = px - s.cx
            const dz = pz - s.cz
            const dh = Math.hypot(dx, dz) || 1
            const ring = s.radius + 8
            tx = (-dz / dh) * 1.0 + (dx / dh) * (ring - dh) * 0.15
            tz = (dx / dh) * 1.0 + (dz / dh) * (ring - dh) * 0.15
            ty = (s.cy - py) * 0.1
            tSpeed = cruise
            if (hunting && p.cooldown <= 0 && s.exposed >= 0) {
              p.state = 'attack'
              p.timer = 0
              p.targetId = school.ids[s.exposed]
            }
          } else {
            p.state = 'patrol'
            this.patrol(p, dt, Rh)
            tx = p.homeX - px
            ty = -9 - py
            tz = p.homeZ - pz
          }
          break
        }
        case 'seabird': {
          this.stepBird(p, dt, params, school, env, hunting)
          continue
        }
      }

      this.steer(p, tx, ty, tz, tSpeed, turnMul, dt)
      // keep predators in the water, above the seabed, and inside the observed area
      for (let k2 = 0; k2 < preds.length; k2++) {
        const o = preds[k2]
        if (o === p || o.def.airborne) continue
        const dx = px - o.pos[0]
        const dy = py - o.pos[1]
        const dz = pz - o.pos[2]
        const dd = Math.hypot(dx, dy, dz)
        if (dd < 2.5 && dd > 1e-3) {
          p.pos[0] += (dx / dd) * (2.5 - dd) * 0.25
          p.pos[2] += (dz / dd) * (2.5 - dd) * 0.25
        }
      }
      p.pos[0] += p.dir[0] * p.speed * dt
      p.pos[1] += p.dir[1] * p.speed * dt
      p.pos[2] += p.dir[2] * p.speed * dt
      if (p.pos[1] > -0.7) {
        p.pos[1] = -0.7
        if (p.dir[1] > 0) p.dir[1] *= 0.5
      }
      if (p.pos[1] < floorY + 1.5) p.pos[1] = floorY + 1.5
      const rh = Math.hypot(p.pos[0], p.pos[2])
      if (rh > Rh) {
        p.homeX = -p.pos[0] * 0.3
        p.homeZ = -p.pos[2] * 0.3
        if (p.state === 'patrol') p.timer = 0
      }
      p.tailPhase += dt * Math.PI * 2 * (0.6 + p.speed / d.length) * (p.species === 'dolphin' ? 0.5 : 0.7)
      // large bodies moving fast leave a pressure wake fish can feel
      if (p.speed > cruise * 1.5 && (this.tick + k) % 6 === 0) env.addDisturbance(px, py, pz, 2.5 + d.length, 0.35, 0.5)
    }

    // build compact view for fish perception
    const pv = this.pv
    for (let k = 0; k < preds.length; k++) {
      const p = preds[k]
      const o = k * PV_STRIDE
      pv[o] = p.pos[0]
      pv[o + 1] = p.pos[1]
      pv[o + 2] = p.pos[2]
      pv[o + 3] = p.dir[0] * p.speed
      pv[o + 4] = p.dir[1] * p.speed
      pv[o + 5] = p.dir[2] * p.speed
      pv[o + 6] = p.def.conspicuity
      pv[o + 7] = p.pos[1] > 0.15 ? 1 : 0
      pv[o + 8] = ATTACK_STATES.has(p.state) ? 1 : 0
      pv[o + 9] = p.def.length
    }
    if (this.events.length > 20) this.events.splice(0, this.events.length - 20)
  }

  private patrol(p: Predator, _dt: number, Rh: number) {
    const dx = p.homeX - p.pos[0]
    const dz = p.homeZ - p.pos[2]
    if (Math.hypot(dx, dz) < 6 || p.timer > 25) {
      const a = this.rng.range(0, Math.PI * 2)
      const r = this.rng.range(0, Rh * 0.6)
      p.homeX = Math.cos(a) * r
      p.homeZ = Math.sin(a) * r
      p.timer = 0
    }
  }

  private stepBird(p: Predator, dt: number, params: SimParams, school: SardineSchool, env: Environment, hunting: boolean) {
    const d = p.def
    const s = p.sensed
    const r = this.rng
    const intensity = params.predators.huntingIntensity
    const smul = params.predators.speedMultiplier
    const px = p.pos[0]
    const py = p.pos[1]
    const pz = p.pos[2]
    let tx = p.dir[0]
    let ty = 0
    let tz = p.dir[2]
    let tSpeed = d.cruise * smul
    let turnMul = 1
    switch (p.state) {
      case 'soar':
      case 'takeoff': {
        p.wingFold = Math.max(0, p.wingFold - dt * 2)
        const cxh = s.count > 0 ? s.cx : p.homeX
        const czh = s.count > 0 ? s.cz : p.homeZ
        const dx = px - cxh
        const dz = pz - czh
        const dh = Math.hypot(dx, dz) || 1
        const ring = 16
        tx = (-dz / dh) * 1.0 + (dx / dh) * (ring - dh) * 0.08
        tz = (dx / dh) * 1.0 + (dz / dh) * (ring - dh) * 0.08
        const alt = 18 + 4 * Math.sin(this.time * 0.2 + p.id)
        ty = (alt - py) * 0.12
        if (p.state === 'takeoff' && py > alt - 3) p.state = 'soar'
        if (s.count === 0) this.patrol(p, dt, env.habitatRadius)
        if (hunting && p.state === 'soar' && p.cooldown <= 0 && s.nearest >= 0 && s.nearestD < 22) {
          p.state = 'dive'
          p.timer = 0
          p.attempted = false
          p.targetId = school.ids[s.nearest]
        }
        break
      }
      case 'dive': {
        p.wingFold = Math.min(1, p.wingFold + dt * 3)
        const ti = school.indexOfId(p.targetId)
        if (ti >= 0) {
          const t3 = ti * 3
          tx = school.pos[t3] + school.dir[t3] * school.speed[ti] * 0.8 - px
          ty = school.pos[t3 + 1] - py
          tz = school.pos[t3 + 2] + school.dir[t3 + 2] * school.speed[ti] * 0.8 - pz
        } else {
          tx = p.dir[0]
          ty = -1
          tz = p.dir[2]
        }
        tSpeed = d.maxSpeed * smul
        turnMul = 2.2
        if (py < 0) {
          // plunge: splash disturbance felt by nearby fish
          p.state = 'underwater'
          p.timer = 0
          env.addDisturbance(px, -0.5, pz, 6, 1.0, 1.2)
        }
        break
      }
      case 'underwater': {
        // drag rapidly slows the bird; it can reach only a few metres deep
        p.speed *= Math.exp(-dt * 2.6)
        tSpeed = p.speed
        const ti = school.indexOfId(p.targetId)
        if (ti >= 0) {
          const t3 = ti * 3
          tx = school.pos[t3] - px
          ty = school.pos[t3 + 1] - py
          tz = school.pos[t3 + 2] - pz
          turnMul = 1.5
          this.tryCapture(p, ti, school, params, env)
        }
        if (p.timer > 1.4 || p.speed < 1.2 || py < -9) {
          if (!p.attempted) {
            p.misses++
            this.totalAttempts++
          }
          p.state = 'surfacing'
          p.timer = 0
        }
        break
      }
      case 'surfacing': {
        tx = p.dir[0]
        ty = 1
        tz = p.dir[2]
        tSpeed = 1.6
        turnMul = 3
        if (py >= -0.05) {
          p.state = 'resting'
          p.timer = 0
          p.pos[1] = 0.05
          p.speed = 0.3
        }
        break
      }
      case 'resting': {
        p.wingFold = 1
        ty = 0
        tSpeed = 0.3
        if (p.timer > 1.6 + r.next()) {
          p.state = 'takeoff'
          p.timer = 0
          p.speed = 6
          p.cooldown = (16 - 13 * intensity) * r.range(0.7, 1.3)
        }
        break
      }
      default:
        p.state = 'soar'
    }
    rotateToward(p.dir, 0, tx, ty, tz, d.turnRate * turnMul * dt, tmpDir, 0)
    const ox = p.dir[0]
    const oz = p.dir[2]
    p.dir[0] = tmpDir[0]
    p.dir[1] = tmpDir[1]
    p.dir[2] = tmpDir[2]
    if (p.state === 'soar') limitPitch(p.dir, 0, 0.35)
    if (p.state === 'takeoff') limitPitch(p.dir, 0, 0.5)
    if (p.state === 'resting') p.dir[1] = 0
    const yawRate = (oz * p.dir[0] - ox * p.dir[2]) / dt
    p.prevRoll = p.roll
    p.roll += (clamp(-yawRate * 0.8, -0.9, 0.9) - p.roll) * Math.min(1, dt * 3)
    if (p.state !== 'underwater') p.speed += clamp(tSpeed - p.speed, -d.accel * dt, d.accel * dt)
    p.pos[0] += p.dir[0] * p.speed * dt
    p.pos[1] += p.dir[1] * p.speed * dt
    p.pos[2] += p.dir[2] * p.speed * dt
    if ((p.state === 'soar' || p.state === 'takeoff') && p.pos[1] < 2) p.pos[1] = 2
    if (p.state === 'resting') p.pos[1] = 0.05
    p.tailPhase += dt * (p.state === 'soar' ? 1.5 + 0.5 * Math.sin(this.time * 0.3 + p.id) : p.state === 'takeoff' ? 4 : 0)
  }

  private pushEvent(text: string, kind: PredatorEvent['kind'], fishId: number, species: PredatorSpecies) {
    this.events.push({ seq: ++this.eventSeq, time: this.time, text, kind, fishId, species })
  }

  /** A capture needs the predator's mouth/bill physically at the fish. */
  private tryCapture(p: Predator, fi: number, school: SardineSchool, params: SimParams, env: Environment, slash = false) {
    if (p.attempted || fi < 0 || fi >= school.count) return
    const d = p.def
    const mx = p.pos[0] + p.dir[0] * d.length * (slash ? 0.6 : 0.45)
    const my = p.pos[1] + p.dir[1] * d.length * (slash ? 0.6 : 0.45)
    const mz = p.pos[2] + p.dir[2] * d.length * (slash ? 0.6 : 0.45)
    const f3 = fi * 3
    const dist = Math.hypot(school.pos[f3] - mx, school.pos[f3 + 1] - my, school.pos[f3 + 2] - mz)
    if (dist > d.captureRadius) return
    p.attempted = true
    this.totalAttempts++
    const pp = params.predators
    const alarm = school.alarm[fi]
    const prob = d.captureSkill * (0.55 + 0.45 * pp.huntingIntensity) * (1 - 0.35 * alarm)
    const id = school.ids[fi]
    env.addDisturbance(mx, my, mz, 3, 1.0, 0.8)
    if (this.rng.next() < prob) {
      p.captures++
      this.totalCaptures++
      if (pp.captureEnabled) {
        school.removeAt(fi)
        this.pushEvent(`${d.label} caught sardine #${id}`, 'capture', id, p.species)
      } else {
        school.alarm[fi] = 1
        school.threat[fi] = 1
        this.pushEvent(`${d.label} strike on #${id} (non-lethal demo)`, 'demo', id, p.species)
      }
    } else {
      p.misses++
      this.pushEvent(`${d.label} missed sardine #${id}`, 'miss', id, p.species)
    }
  }
}
