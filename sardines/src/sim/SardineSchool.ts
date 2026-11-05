import {
  BODY_LENGTH,
  B_ALARM,
  B_BOUNDARY,
  B_CRUISE,
  B_ESCAPE,
  B_FEED,
  B_INITIATE,
  B_ISOLATED,
  B_SCHOOL,
  MAX_NEIGHBORS,
  type SimParams,
} from './config.ts'
import type { Environment } from './Environment.ts'
import { Rng } from './rng.ts'
import { SpatialGrid } from './SpatialGrid.ts'
import { clamp, limitPitch, predatorThreat, rotateToward } from './steering.ts'

/** Layout of the compact predator view passed to the fish update. */
export const PV_STRIDE = 10
// x y z vx vy vz conspicuity above-water(0/1) attacking(0/1) length

/** Known large aggregations (centroid + size) — visible from further away than single fish. */
export interface SchoolBeacons {
  n: number
  data: Float32Array // x y z count
  /** School index per fish from the last analysis (-1 = straggler). */
  label: Int32Array
}

type Arr = Float32Array | Int32Array | Uint8Array

/**
 * Sardine agent state (structure-of-arrays) and the per-agent behavioural
 * update. Every fish perceives only nearby schoolmates (vision with a rear
 * blind zone + a short-range omnidirectional lateral line), the predators it
 * can detect, and local environmental cues.
 */
export class SardineSchool {
  readonly capacity: number
  count = 0
  nextId = 1
  time = 0

  // --- kinematic state ---
  pos: Float32Array
  prevPos: Float32Array
  dir: Float32Array
  prevDir: Float32Array
  speed: Float32Array
  roll: Float32Array
  prevRoll: Float32Array
  tailPhase: Float32Array
  tailFreq: Float32Array
  tailAmp: Float32Array
  bend: Float32Array

  // --- individual traits ---
  ids: Int32Array
  size: Float32Array
  speedPref: Float32Array
  rhythm: Float32Array
  boldness: Float32Array
  seedA: Float32Array
  seedB: Float32Array
  depthOffset: Float32Array

  // --- internal motivational state ---
  threat: Float32Array
  alarm: Float32Array
  esc: Float32Array
  hunger: Float32Array
  fatigue: Float32Array
  food: Float32Array
  initTimer: Float32Array
  initDir: Float32Array
  behavior: Uint8Array
  nearestPred: Float32Array

  // --- neighbourhood (from last tick) ---
  nbr: Int32Array
  nbrDist: Float32Array
  nbrCount: Uint8Array
  nearest: Float32Array
  kthDist: Float32Array

  // --- weighted steering contributions from last tick (for overlays) ---
  fSep: Float32Array
  fAli: Float32Array
  fCoh: Float32Array
  fAvoid: Float32Array

  // --- scratch ---
  private newDir: Float32Array
  private newSpeed: Float32Array
  private alarmNext: Float32Array
  private escNext: Float32Array
  private fields: { a: Arr; s: number }[] = []
  private bestIdx = new Int32Array(MAX_NEIGHBORS)
  private bestD2 = new Float32Array(MAX_NEIGHBORS)
  private cur = new Float32Array(3)
  grid: SpatialGrid
  rng = new Rng(1)
  /** Mean nearest-neighbour distance from the previous tick (drives grid resolution). */
  meanNND = 0.2
  /** Effective visual range used last tick. */
  visualRange = 4
  lateralRange = 1

  constructor(capacity: number) {
    this.capacity = capacity
    const f3 = () => new Float32Array(capacity * 3)
    const f1 = () => new Float32Array(capacity)
    this.pos = f3()
    this.prevPos = f3()
    this.dir = f3()
    this.prevDir = f3()
    this.speed = f1()
    this.roll = f1()
    this.prevRoll = f1()
    this.tailPhase = f1()
    this.tailFreq = f1()
    this.tailAmp = f1()
    this.bend = f1()
    this.ids = new Int32Array(capacity)
    this.size = f1()
    this.speedPref = f1()
    this.rhythm = f1()
    this.boldness = f1()
    this.seedA = f1()
    this.seedB = f1()
    this.depthOffset = f1()
    this.threat = f1()
    this.alarm = f1()
    this.esc = f3()
    this.hunger = f1()
    this.fatigue = f1()
    this.food = f1()
    this.initTimer = f1()
    this.initDir = f3()
    this.behavior = new Uint8Array(capacity)
    this.nearestPred = f1()
    this.nbr = new Int32Array(capacity * MAX_NEIGHBORS)
    this.nbrDist = new Float32Array(capacity * MAX_NEIGHBORS)
    this.nbrCount = new Uint8Array(capacity)
    this.nearest = f1()
    this.kthDist = f1()
    this.fSep = f3()
    this.fAli = f3()
    this.fCoh = f3()
    this.fAvoid = f3()
    this.newDir = f3()
    this.newSpeed = f1()
    this.alarmNext = f1()
    this.escNext = f3()
    const add = (a: Arr, s: number) => this.fields.push({ a, s })
    for (const a of [this.pos, this.prevPos, this.dir, this.prevDir, this.esc, this.initDir, this.fSep, this.fAli, this.fCoh, this.fAvoid])
      add(a, 3)
    for (const a of [
      this.speed,
      this.roll,
      this.prevRoll,
      this.tailPhase,
      this.tailFreq,
      this.tailAmp,
      this.bend,
      this.ids,
      this.size,
      this.speedPref,
      this.rhythm,
      this.boldness,
      this.seedA,
      this.seedB,
      this.depthOffset,
      this.threat,
      this.alarm,
      this.hunger,
      this.fatigue,
      this.food,
      this.initTimer,
      this.behavior,
      this.nearestPred,
      this.nbrCount,
      this.nearest,
      this.kthDist,
    ])
      add(a, 1)
    this.grid = new SpatialGrid(capacity)
  }

  clear() {
    this.count = 0
    this.nextId = 1
    this.time = 0
  }

  /** Create one fish with individual traits drawn around the population mean. */
  addFish(x: number, y: number, z: number, dx: number, dy: number, dz: number, params: SimParams): number {
    if (this.count >= this.capacity) return -1
    const i = this.count++
    const r = this.rng
    const v = params.school.individualVariation
    const l = Math.hypot(dx, dy, dz) || 1
    this.pos[i * 3] = this.prevPos[i * 3] = x
    this.pos[i * 3 + 1] = this.prevPos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = this.prevPos[i * 3 + 2] = z
    this.dir[i * 3] = this.prevDir[i * 3] = dx / l
    this.dir[i * 3 + 1] = this.prevDir[i * 3 + 1] = dy / l
    this.dir[i * 3 + 2] = this.prevDir[i * 3 + 2] = dz / l
    this.ids[i] = this.nextId++
    this.size[i] = clamp(1 + r.gauss() * 0.07 * (0.3 + v), 0.75, 1.3)
    this.speedPref[i] = clamp(1 + r.gauss() * 0.08 * (0.3 + v), 0.7, 1.35)
    this.rhythm[i] = clamp(1 + r.gauss() * 0.08 * (0.3 + v), 0.75, 1.3)
    this.boldness[i] = clamp(0.5 + r.gauss() * 0.25 * (0.2 + v), 0, 1)
    this.seedA[i] = r.next()
    this.seedB[i] = r.next()
    this.depthOffset[i] = r.gauss() * 1.5 * (0.3 + v)
    this.speed[i] = params.school.cruiseSpeed * this.speedPref[i]
    this.roll[i] = this.prevRoll[i] = 0
    this.tailPhase[i] = r.next() * Math.PI * 2
    this.tailFreq[i] = 4
    this.tailAmp[i] = 0.06
    this.bend[i] = 0
    this.threat[i] = 0
    this.alarm[i] = 0
    this.esc[i * 3] = this.esc[i * 3 + 1] = this.esc[i * 3 + 2] = 0
    this.hunger[i] = r.range(0.2, 0.8)
    this.fatigue[i] = 0
    this.food[i] = 0
    this.initTimer[i] = 0
    this.behavior[i] = B_CRUISE
    this.nearestPred[i] = Infinity
    this.nbrCount[i] = 0
    this.nearest[i] = 1
    this.kthDist[i] = 1
    return i
  }

  /** Remove fish i by moving the last fish into its slot. */
  removeAt(i: number) {
    const last = this.count - 1
    if (i < 0 || i > last) return
    if (i !== last) {
      for (const { a, s } of this.fields) {
        for (let k = 0; k < s; k++) a[i * s + k] = a[last * s + k]
      }
      // neighbour list of the moved fish
      const M = MAX_NEIGHBORS
      for (let k = 0; k < M; k++) {
        this.nbr[i * M + k] = this.nbr[last * M + k]
        this.nbrDist[i * M + k] = this.nbrDist[last * M + k]
      }
    }
    this.count--
  }

  indexOfId(id: number) {
    const ids = this.ids
    for (let i = 0; i < this.count; i++) if (ids[i] === id) return i
    return -1
  }

  /**
   * Advance every fish by dt. Decisions are computed from the state at the
   * start of the tick (synchronous update) so information spreads one
   * neighbourhood "hop" per tick — producing travelling waves.
   */
  step(
    dt: number,
    params: SimParams,
    env: Environment,
    predCount: number,
    pv: Float32Array,
    beacons: SchoolBeacons,
  ) {
    this.time += dt
    const n = this.count
    if (n === 0) return
    const sp = params.school
    const ep = env.params
    const BL = BODY_LENGTH
    const K = Math.max(1, Math.min(MAX_NEIGHBORS, Math.round(sp.neighborLimit)))
    const visibility = ep.visibility
    const Rvis = Math.max(0.6, Math.min(sp.sensoryRange, visibility * 0.6))
    const Rll = 5 * BL
    this.visualRange = Rvis
    this.lateralRange = Rll
    const Rvis2 = Rvis * Rvis
    const Rll2 = Rll * Rll
    const blindCos = -0.94 // ~20° rear blind zone either side of the tail
    const predRange = Math.min(32, visibility * 0.9)
    const variation = sp.individualVariation
    const dr = sp.densityResponse
    const cruise = sp.cruiseSpeed
    const burst = Math.max(cruise * 1.2, sp.burstSpeed)
    const t = this.time
    const rng = this.rng
    const floorY = env.seafloorY
    const Rh = env.habitatRadius
    const prefDepthBase = ep.preferredDepth
    const migFrac = params.migration.fraction
    const migAng = (params.migration.heading * Math.PI) / 180
    const migX = Math.sin(migAng)
    const migZ = Math.cos(migAng)
    const startleRate = 0.00004 * (0.5 + variation)
    const initRate = 0.0004 * (0.4 + variation)
    const foodDetect = Math.min(visibility * 0.6, 18)
    const food = env.food
    const obstacles = env.obstacles
    const dist = env.disturbances

    const pos = this.pos
    const dir = this.dir
    const speed = this.speed
    const alarm = this.alarm
    const esc = this.esc
    const nbr = this.nbr
    const nbrDist = this.nbrDist
    const nbrCount = this.nbrCount
    const newDir = this.newDir
    const newSpeed = this.newSpeed
    const alarmNext = this.alarmNext
    const escNext = this.escNext
    const bestIdx = this.bestIdx
    const bestD2 = this.bestD2

    // ---- 1. spatial index ----
    const cs = clamp(this.meanNND * 1.8, 0.3, Math.max(0.5, Rvis / 2))
    const grid = this.grid
    grid.build(pos, n, cs)
    const gcs = grid.cellSize
    const gnx = grid.nx
    const gny = grid.ny
    const gnz = grid.nz
    const cellStart = grid.cellStart
    const items = grid.items
    const rMax = Math.min(12, Math.ceil(Rvis / gcs))
    const maxCand = 240
    let nndSum = 0
    let nndN = 0

    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const px = pos[i3]
      const py = pos[i3 + 1]
      const pz = pos[i3 + 2]
      const hx = dir[i3]
      const hy = dir[i3 + 1]
      const hz = dir[i3 + 2]
      const si = this.size[i]
      const spd = speed[i]
      const ai = alarm[i]

      // ---- 2. perception: K nearest visible / lateral-line neighbours ----
      let found = 0
      let examined = 0
      const ccx = grid.cellX(px)
      const ccy = grid.cellY(py)
      const ccz = grid.cellZ(pz)
      for (let r = 0; r <= rMax; r++) {
        const y0 = Math.max(0, ccy - r)
        const y1 = Math.min(gny - 1, ccy + r)
        const z0 = Math.max(0, ccz - r)
        const z1 = Math.min(gnz - 1, ccz + r)
        const x0 = Math.max(0, ccx - r)
        const x1 = Math.min(gnx - 1, ccx + r)
        for (let cy = y0; cy <= y1; cy++) {
          const oy = cy - ccy < 0 ? ccy - cy : cy - ccy
          for (let cz = z0; cz <= z1; cz++) {
            const oz = cz - ccz < 0 ? ccz - cz : cz - ccz
            const row = (cy * gnz + cz) * gnx
            for (let cx = x0; cx <= x1; cx++) {
              const ox = cx - ccx < 0 ? ccx - cx : cx - ccx
              // only the shell of ring r
              if (ox !== r && oy !== r && oz !== r) continue
              const c = row + cx
              for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
                const j = items[k]
                if (j === i) continue
                examined++
                const dx = pos[j * 3] - px
                const dy = pos[j * 3 + 1] - py
                const dz = pos[j * 3 + 2] - pz
                const d2 = dx * dx + dy * dy + dz * dz
                if (d2 > Rvis2) continue
                if (found === K && d2 >= bestD2[K - 1]) continue
                if (d2 > Rll2) {
                  // outside lateral-line range: must be visible (not in the rear blind zone)
                  const d = Math.sqrt(d2)
                  if ((dx * hx + dy * hy + dz * hz) / d < blindCos) continue
                }
                // insertion into sorted best list
                let p = found < K ? found++ : K - 1
                while (p > 0 && bestD2[p - 1] > d2) {
                  bestD2[p] = bestD2[p - 1]
                  bestIdx[p] = bestIdx[p - 1]
                  p--
                }
                bestD2[p] = d2
                bestIdx[p] = j
              }
            }
          }
        }
        if (examined >= maxCand) break
        if (found === K && bestD2[K - 1] <= (r + 0.5) * (r + 0.5) * gcs * gcs) break
      }
      const nb = i * MAX_NEIGHBORS
      nbrCount[i] = found
      for (let k = 0; k < found; k++) {
        nbr[nb + k] = bestIdx[k]
        nbrDist[nb + k] = Math.sqrt(bestD2[k])
      }
      this.nearest[i] = found > 0 ? Math.sqrt(bestD2[0]) : Rvis
      this.kthDist[i] = found > 0 ? Math.sqrt(bestD2[found - 1]) : Rvis
      if (found > 0) {
        nndSum += Math.min(2, Math.sqrt(bestD2[0]))
        nndN++
      }

      // ---- 3. predator & disturbance threat (own perception) ----
      // exposure: how far the fish sits from its neighbours' centroid (edge fish are exposed)
      let cxs = 0
      let cys = 0
      let czs = 0
      for (let k = 0; k < found; k++) {
        const j = bestIdx[k]
        cxs += pos[j * 3]
        cys += pos[j * 3 + 1]
        czs += pos[j * 3 + 2]
      }
      const spacing = sp.preferredSpacing * BL * si * (1 - 0.45 * dr * Math.min(1, ai))
      let exposure = 1
      let cvx = 0
      let cvy = 0
      let cvz = 0
      let cvd = 0
      if (found > 0) {
        cvx = cxs / found - px
        cvy = cys / found - py
        cvz = czs / found - pz
        cvd = Math.sqrt(cvx * cvx + cvy * cvy + cvz * cvz)
        exposure = found < 3 ? 1 : clamp(cvd / (spacing * 2 + 1e-3), 0, 1)
      }

      let T = 0
      let eTot = 0
      let ex = 0
      let ey = 0
      let ez = 0
      let nearestPred = Infinity
      for (let k = 0; k < predCount; k++) {
        const o = k * PV_STRIDE
        const qx = pv[o]
        const qy = pv[o + 1]
        const qz = pv[o + 2]
        let dx = px - qx
        let dy = py - qy
        let dz = pz - qz
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4
        if (d < nearestPred) nearestPred = d
        const above = pv[o + 7] > 0.5
        let range = predRange
        if (above) {
          // birds above the surface are only noticed by fish close to the surface (silhouettes/shadows)
          if (py < -7) continue
          range = Math.min(14, range)
        }
        if (d > range) continue
        dx /= d
        dy /= d
        dz /= d
        // vision has a rear blind zone; the lateral line detects large moving bodies close by
        const plen = pv[o + 9]
        const vxq = pv[o + 3]
        const vyq = pv[o + 4]
        const vzq = pv[o + 5]
        const pspeed = Math.sqrt(vxq * vxq + vyq * vyq + vzq * vzq)
        const llPred = 2 + plen + pspeed * 0.5
        const seen = -(dx * hx + dy * hy + dz * hz) > blindCos
        if (!seen && d > llPred) continue
        const approach = vxq * dx + vyq * dy + vzq * dz
        const tk = predatorThreat(d, range, approach, pv[o + 6], exposure, pv[o + 8] > 0.5)
        if (tk <= 0) continue
        // Escape: away from the predator plus a sideways component relative to
        // its line of travel ("fountain" / flash expansion).
        let lx = dx
        let ly = dy
        let lz = dz
        if (pspeed > 0.1) {
          const ux = vxq / pspeed
          const uy = vyq / pspeed
          const uz = vzq / pspeed
          const al = dx * ux + dy * uy + dz * uz
          lx = dx - ux * al
          ly = dy - uy * al
          lz = dz - uz * al
          const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1
          lx /= ll
          ly /= ll
          lz /= ll
        }
        const latW = approach > 0.5 ? 1.2 : 0.4
        let sx = dx * 0.6 + lx * latW
        let sy = dy * 0.6 + ly * latW
        let sz = dz * 0.6 + lz * latW
        if (above || qy > -1.5) sy -= 0.9 // threats from the air: dive
        // the surface is a wall: near it, upward escape turns into sideways escape
        if (sy > 0 && py > -4) {
          const k = clamp(-py / 4, 0, 1)
          sx *= 1 + (1 - k) * 0.5
          sz *= 1 + (1 - k) * 0.5
          sy *= k
        }
        const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1
        sx /= sl
        sy /= sl
        sz /= sl
        ex += sx * tk
        ey += sy * tk
        ez += sz * tk
        eTot += tk
        T = 1 - (1 - T) * (1 - Math.min(1, tk))
      }
      for (let k = 0; k < dist.length; k++) {
        const D = dist[k]
        let dx = px - D.x
        let dy = py - D.y
        let dz = pz - D.z
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4
        if (d > D.radius) continue
        const tk = D.strength * (1 - d / D.radius) * (1 - D.age / D.life)
        dx /= d
        dy /= d
        dz /= d
        ex += dx * tk
        ey += dy * tk
        ez += dz * tk
        T = 1 - (1 - T) * (1 - Math.min(1, tk))
      }
      // Rare spontaneous startles (false alarms) — common in real schools and a
      // source of travelling waves even without predators.
      if (rng.next() < startleRate * dt) {
        const a = rng.range(-1, 1) > 0 ? 1 : -1
        ex += -hz * a * 0.5
        ez += hx * a * 0.5
        ey += rng.range(-0.15, 0.15)
        T = Math.max(T, 0.45 + 0.2 * rng.next())
      }
      this.threat[i] = Math.max(T, this.threat[i] * Math.exp(-dt / 0.6))
      this.nearestPred[i] = nearestPred

      // ---- 4. social forces ----
      let sepx = 0
      let sepy = 0
      let sepz = 0
      let alx = 0
      let aly = 0
      let alz = 0
      let wA = 0
      let spSum = 0
      let propAlarm = 0
      let pex = 0
      let pey = 0
      let pez = 0
      let crowdFront = 0
      for (let k = 0; k < found; k++) {
        const j = bestIdx[k]
        const j3 = j * 3
        const d = Math.sqrt(bestD2[k]) + 1e-5
        const dx = pos[j3] - px
        const dy = pos[j3 + 1] - py
        const dz = pos[j3 + 2] - pz
        // separation: repulsion grows steeply as neighbours get dangerously close
        const sj = spacing * (0.5 + 0.5 * this.size[j] / si)
        if (d < sj) {
          const w = Math.min(6, sj / d - 1)
          sepx -= (dx / d) * w
          sepy -= (dy / d) * w
          sepz -= (dz / d) * w
          if ((dx * hx + dy * hy + dz * hz) / d > 0.6) crowdFront += w
        }
        // alignment (lateral line improves coordination with very close neighbours)
        const aj = alarm[j]
        let wa = 1 + (d < Rll ? 1.5 * (1 - d / Rll) : 0)
        wa *= 1 + 3 * aj
        alx += dir[j3] * wa
        aly += dir[j3 + 1] * wa
        alz += dir[j3 + 2] * wa
        wA += wa
        spSum += speed[j] * wa
        // information transfer: alarmed neighbours pass on their evasive state
        if (aj > 0.1) {
          const tr = aj * (d < Rll ? 0.86 : 0.74)
          if (tr > propAlarm) propAlarm = tr
          pex += esc[j3] * aj
          pey += esc[j3 + 1] * aj
          pez += esc[j3 + 2] * aj
        }
      }
      const isolated = found < 2

      // alarm & escape direction for next tick
      const decayed = ai * Math.exp(-dt / 0.9)
      const aNext = Math.min(1, Math.max(this.threat[i], propAlarm, decayed))
      alarmNext[i] = aNext
      let qx = ex * 2 + pex
      let qy = ey * 2 + pey
      let qz = ez * 2 + pez
      let ql = Math.sqrt(qx * qx + qy * qy + qz * qz)
      if (ql > 1e-4) {
        qx /= ql
        qy /= ql
        qz /= ql
      } else {
        qx = esc[i3]
        qy = esc[i3 + 1]
        qz = esc[i3 + 2]
        ql = Math.sqrt(qx * qx + qy * qy + qz * qz)
      }
      escNext[i3] = qx
      escNext[i3 + 1] = qy
      escNext[i3 + 2] = qz

      // ---- 5. feeding ----
      let fx = 0
      let fy = 0
      let fz = 0
      let feeding = 0
      const hunger = this.hunger[i]
      if (food.length > 0 && ai < 0.25) {
        let bestScore = 0
        for (let k = 0; k < food.length; k++) {
          const F = food[k]
          if (F.density <= 0.02) continue
          const dx = F.x - px
          const dy = F.y - py
          const dz = F.z - pz
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-4
          if (d < F.radius) {
            const lvl = F.density * (1 - (d * d) / (F.radius * F.radius))
            if (lvl > feeding) feeding = lvl
            // inside: stay within the richer interior, without converging on one point
            const inward = Math.max(0, d / F.radius - 0.55) * 1.2
            fx += (dx / d) * inward
            fy += (dy / d) * inward
            fz += (dz / d) * inward
            F.density = Math.max(0, F.density - dt * 0.00004 * hunger)
          } else if (d < F.radius + foodDetect && hunger > 0.3) {
            const score = (F.density * hunger) / (1 + d * 0.05)
            if (score > bestScore) {
              bestScore = score
              const w = 0.55 * hunger * F.density
              fx = (dx / d) * w
              fy = (dy / d) * w
              fz = (dz / d) * w
            }
          }
        }
      }
      const isFeeding = feeding > 0.05 && hunger > 0.15
      this.food[i] = isFeeding ? feeding : 0
      this.hunger[i] = clamp(hunger + dt * (isFeeding ? -0.03 * feeding : 0.006), 0, 1)

      // ---- 6. boundaries, depth preference, obstacles ----
      let bx = 0
      let by = 0
      let bz = 0
      if (py > -3.5) {
        const k = (py + 3.5) / 3.5
        by -= k * k * 4
      }
      if (py < floorY + 4) {
        const k = (floorY + 4 - py) / 4
        by += k * k * 2.5
      }
      const pd = -env.preferredDepthAt(px, pz, prefDepthBase) - this.depthOffset[i]
      by += clamp((pd - py) * 0.05, -0.3, 0.3) * (1 - Math.min(1, ai * 1.5))
      const rh = Math.sqrt(px * px + pz * pz)
      if (rh > Rh) {
        const k = Math.min(2, (rh - Rh) / 25)
        bx -= (px / rh) * k * k * 1.5 + (px / rh) * 0.1
        bz -= (pz / rh) * k * k * 1.5 + (pz / rh) * 0.1
      }
      for (let k = 0; k < obstacles.length; k++) {
        const O = obstacles[k]
        if (py > O.y + O.radius + 3) continue
        const dx = px - O.x
        const dz = pz - O.z
        let dh = Math.sqrt(dx * dx + dz * dz)
        const vy = py > O.y ? py - O.y : 0
        const dd = Math.sqrt(dh * dh + vy * vy) - O.radius
        if (dd < 4) {
          dh = dh || 1e-3
          const w = ((4 - Math.max(0, dd)) / 4) ** 2 * 3
          // push out + slide around (tangent chosen by current heading)
          const nx = dx / dh
          const nz = dz / dh
          const side = nx * hz - nz * hx > 0 ? 1 : -1
          bx += (nx + -nz * side * 0.8) * w
          bz += (nz + nx * side * 0.8) * w
          if (vy > 0) by += (vy / (dd + O.radius)) * w
        }
      }
      const boundaryMag = Math.abs(bx) + Math.abs(by) + Math.abs(bz)

      // ---- 7. individual motivation: wandering, turn initiation, migration ----
      const sa = this.seedA[i]
      const sb = this.seedB[i]
      const wanderAmp = (0.06 + 0.22 * variation) * (isFeeding ? 3 : 1)
      const wx = Math.sin(t * (0.35 + sa * 0.5) + sb * 40) * wanderAmp
      const wy = Math.sin(t * (0.27 + sb * 0.4) + sa * 30) * wanderAmp * 0.35
      const wz = Math.cos(t * (0.31 + sa * 0.45) + sb * 25) * wanderAmp
      let ix = 0
      let iy = 0
      let iz = 0
      let initiating = false
      if (this.initTimer[i] > 0) {
        this.initTimer[i] -= dt
        initiating = true
        const w = 0.6 * (0.5 + this.boldness[i])
        ix = this.initDir[i3] * w
        iy = this.initDir[i3 + 1] * w
        iz = this.initDir[i3 + 2] * w
      } else if (ai < 0.1 && !isFeeding && rng.next() < initRate * dt) {
        // spontaneously decide to head somewhere else (an "initiator")
        const yaw = rng.range(0.6, 2.0) * (rng.next() < 0.5 ? -1 : 1)
        const c = Math.cos(yaw)
        const s = Math.sin(yaw)
        let dx = hx * c - hz * s
        let dz = hx * s + hz * c
        const dy = rng.range(-0.25, 0.25)
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz)
        dx /= l
        dz /= l
        this.initDir[i3] = dx
        this.initDir[i3 + 1] = dy / l
        this.initDir[i3 + 2] = dz
        this.initTimer[i] = rng.range(2, 5)
      }
      if (migFrac > 0 && sa < migFrac) {
        ix += migX * 0.35
        iz += migZ * 0.35
      }

      // Stragglers and small groups try to reconnect: a large school is a big,
      // flashing object that is visible much further away than a single fish.
      let rx = 0
      let ry = 0
      let rz = 0
      let rw = 0
      // centre of own school (seeking a less exposed position when threatened)
      let ocx = 0
      let ocy = 0
      let ocz = 0
      if (beacons.n > 0) {
        const lab = i < beacons.label.length ? beacons.label[i] : -1
        if (lab >= 0 && lab < beacons.n && ai > 0.05) {
          const o = lab * 4
          const dx = beacons.data[o] - px
          const dy = beacons.data[o + 1] - py
          const dz = beacons.data[o + 2] - pz
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d > 0.3) {
            const k = Math.min(1, d / 2) / d
            ocx = dx * k
            ocy = dy * k
            ocz = dz * k
          }
        }
        const own = lab >= 0 && lab < beacons.n ? beacons.data[lab * 4 + 3] : lab >= 0 ? 15 : 1
        const range = Math.min(visibility * 0.7, 30)
        let bd = range
        for (let k = 0; k < beacons.n; k++) {
          if (k === lab) continue
          const o = k * 4
          if (beacons.data[o + 3] < own * 0.7) continue
          const dx = beacons.data[o] - px
          const dy = beacons.data[o + 1] - py
          const dz = beacons.data[o + 2] - pz
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < bd && d > 0.5) {
            bd = d
            rx = dx / d
            ry = dy / d
            rz = dz / d
            rw = (isolated ? 0.9 : own < 60 ? 0.5 : 0.28) * (1 + Math.min(1, ai))
          }
        }
      }

      // ---- 8. combine ----
      const aBoost = Math.min(1, aNext)
      const ws = sp.separation * (1 + 0.5 * aBoost)
      // Confinement: threatened from several sides with no clear escape route.
      // Alignment then weakens (orientation zone shrinks) while cohesion holds —
      // the local conditions under which swarming/milling bait balls appear.
      const escNet = Math.sqrt(ex * ex + ey * ey + ez * ez)
      const escMag = Math.min(1, escNet)
      // threats from opposing sides cancel in the net escape vector
      const confinement = eTot > 0.2 ? clamp(1 - escNet / eTot, 0, 1) * Math.min(1, eTot * 1.5) : 0
      const wa = sp.alignment * (isFeeding ? 0.4 : 1) * (1 + 0.6 * aBoost * (1 - confinement)) * (1 - 0.8 * confinement)
      const wc = sp.cohesion * (1 + 1.6 * dr * aBoost) * (isolated ? 2 : 1) * (isFeeding ? 0.55 : 1)
      const wav = 2.6 * (0.6 + 0.8 * this.boldness[i])

      let ax2 = 0
      let ay2 = 0
      let az2 = 0
      if (wA > 0) {
        const il = 1 / wA
        ax2 = (alx * il - hx) * wa
        ay2 = (aly * il - hy) * wa
        az2 = (alz * il - hz) * wa
      }
      let chx = 0
      let chy = 0
      let chz = 0
      if (found > 0 && cvd > 1e-4) {
        // attraction only beyond the preferred spacing, so the school never collapses to a point
        const f = clamp((cvd - spacing * 0.3) / (spacing * 2), 0, 1)
        chx = (cvx / cvd) * f * wc
        chy = (cvy / cvd) * f * wc
        chz = (cvz / cvd) * f * wc
      }
      chx += rx * wc * rw
      chy += ry * wc * rw
      chz += rz * wc * rw
      const selfish = wc * 0.6 * dr * aBoost * (0.3 + exposure)
      chx += ocx * selfish
      chy += ocy * selfish
      chz += ocz * selfish
      // direct threat drives full escape; second-hand alarm a weaker version of it
      // Own perception: threats from several sides partly cancel (so a
      // surrounded fish stays put and packs in). Second-hand alarm adds a
      // weaker push along the direction neighbours are fleeing.
      let ox = ex
      let oy = ey
      let oz = ez
      const ol = Math.sqrt(ox * ox + oy * oy + oz * oz)
      if (ol > 1.2) {
        ox *= 1.2 / ol
        oy *= 1.2 / ol
        oz *= 1.2 / ol
      }
      const social = propAlarm > this.threat[i] ? 0.45 * propAlarm : 0.2 * ai
      const avx = (ox + qx * social) * wav
      const avy = (oy + qy * social) * wav
      const avz = (oz + qz * social) * wav
      const s3x = sepx * ws * 0.5
      const s3y = sepy * ws * 0.5
      const s3z = sepz * ws * 0.5

      this.fSep[i3] = s3x
      this.fSep[i3 + 1] = s3y
      this.fSep[i3 + 2] = s3z
      this.fAli[i3] = ax2
      this.fAli[i3 + 1] = ay2
      this.fAli[i3 + 2] = az2
      this.fCoh[i3] = chx
      this.fCoh[i3 + 1] = chy
      this.fCoh[i3 + 2] = chz
      this.fAvoid[i3] = avx
      this.fAvoid[i3 + 1] = avy
      this.fAvoid[i3 + 2] = avz

      const Sx = s3x + ax2 + chx + avx + bx + fx + ix + wx
      const Sy = s3y + ay2 + chy + avy + by + fy + iy + wy
      const Sz = s3z + az2 + chz + avz + bz + fz + iz + wz

      // ---- 9. biomechanically constrained turning ----
      const maxTurn = Math.min(14, sp.turnResponsiveness * (1.0 + 1.4 * (spd / cruise) + 10 * aBoost))
      const desx = hx + Sx
      const desy = hy + Sy
      const desz = hz + Sz
      const dl = Math.sqrt(desx * desx + desy * desy + desz * desz) || 1
      const cang = clamp((hx * desx + hy * desy + hz * desz) / dl, -1, 1)
      const ang = Math.acos(cang)
      const omega = Math.min(maxTurn, ang * (3 + 6 * aBoost) * sp.turnResponsiveness)
      rotateToward(dir, i3, desx, desy, desz, omega * dt, newDir, i3)
      limitPitch(newDir, i3, Math.sin(0.55 + 0.45 * aBoost))

      // ---- 10. speed (energy-conscious cruising, bursts when alarmed) ----
      let target = cruise * this.speedPref[i]
      if (isFeeding) target *= 0.72
      if (isolated) target *= 1.25
      if (initiating) target *= 1.12
      if (wA > 0) target += (spSum / wA - target) * 0.35
      const burstAvail = burst * (1 - 0.45 * this.fatigue[i])
      const urgency = Math.max(escMag, 0.6 * aBoost)
      target += (burstAvail - target) * Math.min(1, Math.pow(urgency, 0.8) * 1.15)
      if (crowdFront > 0.5) target *= 0.85
      const acc = spd < target ? 1.2 + 10 * aBoost : 1.6
      const dv = clamp(target - spd, -acc * dt, acc * dt)
      const ns = Math.max(0.05, spd + dv)
      newSpeed[i] = ns
      this.fatigue[i] = clamp(this.fatigue[i] + dt * (ns > cruise * 1.7 ? 0.09 * (ns / burst) : -0.04), 0, 1)

      // ---- 11. body kinematics for rendering ----
      const odx = newDir[i3]
      const odz = newDir[i3 + 2]
      const yawRate = (hz * odx - hx * odz) / dt // + = turning right
      const rollTarget = clamp(-yawRate * 0.3, -0.75, 0.75) + Math.sin(t * (1.1 + sa * 0.6) + sb * 50) * 0.1
      this.prevRoll[i] = this.roll[i]
      this.roll[i] += (rollTarget - this.roll[i]) * Math.min(1, dt * 5)
      this.bend[i] = clamp(yawRate * 0.05, -0.14, 0.14)
      const L = BL * si
      const freq = Math.min(15, this.rhythm[i] * (1.8 + 1.4 * (ns / L) * 0.5))
      this.tailFreq[i] = freq
      const thrust = clamp((target - ns) / 0.4 + 0.6 * aBoost + (ns / cruise) * 0.25, 0, 1.3)
      const ampTarget = ns > target * 1.05 && aBoost < 0.2 ? 0.03 : 0.05 + 0.06 * thrust
      this.tailAmp[i] += (ampTarget - this.tailAmp[i]) * Math.min(1, dt * 4)
      this.tailPhase[i] = (this.tailPhase[i] + Math.PI * 2 * freq * dt) % (Math.PI * 200)

      // ---- behaviour label ----
      let b = B_CRUISE
      if (aNext > 0.45 && this.threat[i] > 0.15) b = B_ESCAPE
      else if (aNext > 0.15) b = B_ALARM
      else if (isFeeding) b = B_FEED
      else if (isolated) b = B_ISOLATED
      else if (boundaryMag > 0.8) b = B_BOUNDARY
      else if (initiating) b = B_INITIATE
      else if (found >= 3) b = B_SCHOOL
      this.behavior[i] = b
    }
    this.meanNND = nndN > 0 ? nndSum / nndN : this.meanNND

    // ---- 12. commit synchronously & integrate relative to moving water ----
    const prevPos = this.prevPos
    const prevDir = this.prevDir
    const cur = this.cur
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      prevPos[i3] = pos[i3]
      prevPos[i3 + 1] = pos[i3 + 1]
      prevPos[i3 + 2] = pos[i3 + 2]
      prevDir[i3] = dir[i3]
      prevDir[i3 + 1] = dir[i3 + 1]
      prevDir[i3 + 2] = dir[i3 + 2]
      dir[i3] = newDir[i3]
      dir[i3 + 1] = newDir[i3 + 1]
      dir[i3 + 2] = newDir[i3 + 2]
      speed[i] = newSpeed[i]
      alarm[i] = alarmNext[i]
      esc[i3] = escNext[i3]
      esc[i3 + 1] = escNext[i3 + 1]
      esc[i3 + 2] = escNext[i3 + 2]
      env.currentAt(pos[i3], pos[i3 + 1], pos[i3 + 2], cur)
      const s = newSpeed[i]
      pos[i3] += (dir[i3] * s + cur[0]) * dt
      pos[i3 + 1] += (dir[i3 + 1] * s + cur[1]) * dt
      pos[i3 + 2] += (dir[i3 + 2] * s + cur[2]) * dt
      // hard limits: never leave the water or enter the seabed
      if (pos[i3 + 1] > -0.25) {
        pos[i3 + 1] = -0.25
        if (dir[i3 + 1] > 0) dir[i3 + 1] *= 0.3
      }
      if (pos[i3 + 1] < floorY + 0.4) pos[i3 + 1] = floorY + 0.4
    }

    // ---- 13. resolve physical overlaps (bodies cannot intersect) ----
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const nb = i * MAX_NEIGHBORS
      const cnt = Math.min(nbrCount[i], 4)
      const hx = dir[i3]
      const hy = dir[i3 + 1]
      const hz = dir[i3 + 2]
      for (let k = 0; k < cnt; k++) {
        const j = nbr[nb + k]
        if (j >= n) continue
        const j3 = j * 3
        const dx = pos[i3] - pos[j3]
        const dy = pos[i3 + 1] - pos[j3 + 1]
        const dz = pos[i3 + 2] - pos[j3 + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6
        const along = (dx * hx + dy * hy + dz * hz) / d
        const dmin = BL * 0.5 * (this.size[i] + this.size[j]) * (0.28 + 0.6 * along * along)
        if (d < dmin) {
          const push = ((dmin - d) * 0.5) / d
          pos[i3] += dx * push
          pos[i3 + 1] += dy * push
          pos[i3 + 2] += dz * push
          pos[j3] -= dx * push
          pos[j3 + 1] -= dy * push
          pos[j3 + 2] -= dz * push
        }
      }
    }

    // obstacles: hard collision
    for (let k = 0; k < obstacles.length; k++) {
      const O = obstacles[k]
      for (let i = 0; i < n; i++) {
        const i3 = i * 3
        const py = pos[i3 + 1]
        if (py > O.y + O.radius) continue
        const dx = pos[i3] - O.x
        const dz = pos[i3 + 2] - O.z
        const vy = py > O.y ? py - O.y : 0
        const d = Math.sqrt(dx * dx + dz * dz + vy * vy)
        if (d < O.radius + 0.2 && d > 1e-4) {
          const k2 = (O.radius + 0.2) / d
          pos[i3] = O.x + dx * k2
          pos[i3 + 2] = O.z + dz * k2
          if (vy > 0) pos[i3 + 1] = O.y + vy * k2
        }
      }
    }
  }
}
