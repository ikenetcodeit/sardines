import { SpatialGrid } from './SpatialGrid'
import { rotateToward } from './steering'
import type { EnvironmentParams, FoodParams, SchoolingParams } from './config'

const FIXED_DT = 1 / 60

/**
 * Core autonomous boids-style sardine simulation.
 *
 * Every agent is independent: it only perceives neighbors within its own
 * sensory radius (via the spatial grid) and reacts to them. There is no
 * global steering command — collective motion is a side effect of many
 * local decisions made every tick.
 */
export class SardineSimulation {
  readonly count: number

  posX: Float32Array
  posY: Float32Array
  posZ: Float32Array
  velX: Float32Array
  velY: Float32Array
  velZ: Float32Array

  // Per-agent individuality so the school never reads as identical clones.
  speedBias: Float32Array
  phaseOffset: Float32Array
  tailPhase: Float32Array
  size: Float32Array

  // 1 = active, 0 = captured. Captured fish are skipped by steering, grid
  // insertion, and rendering, but stay in the typed arrays (no reindexing)
  // so every other index stays stable for the lifetime of this engine.
  alive: Uint8Array
  private aliveCount: number

  // Scratch buffers reused every tick (avoid per-frame allocation at 10k agents).
  private accX: Float32Array
  private accY: Float32Array
  private accZ: Float32Array
  // Public (read-only by convention) so the inspection UI can show a
  // selected fish's current threat/forage level without a special accessor.
  fear: Float32Array
  forage: Float32Array

  // Per-agent breakdown of the last tick's steering forces, kept around only
  // for the scientific-inspection UI (selected-fish overlays). Writing them
  // is free since the values already exist mid-computation; nothing here
  // feeds back into the simulation itself.
  debugSepX: Float32Array; debugSepY: Float32Array; debugSepZ: Float32Array
  debugAliX: Float32Array; debugAliY: Float32Array; debugAliZ: Float32Array
  debugCohX: Float32Array; debugCohY: Float32Array; debugCohZ: Float32Array
  debugFearX: Float32Array; debugFearY: Float32Array; debugFearZ: Float32Array
  debugNeighborCount: Int32Array
  debugNearestPredatorDist: Float32Array

  // Scratch for school-cluster flood fill — allocated lazily since this is
  // only computed periodically for the stats overlay, not every tick.
  private clusterVisited: Uint8Array | null = null
  private clusterStack: number[] = []

  private grid: SpatialGrid
  private time = 0
  private accumulator = 0

  // Predator threat state, pushed in each frame from PredatorSystem. Fixed
  // capacity avoids reallocating when predator count changes mid-session.
  private static readonly MAX_PREDATORS = 16
  private predatorX = new Float32Array(SardineSimulation.MAX_PREDATORS)
  private predatorY = new Float32Array(SardineSimulation.MAX_PREDATORS)
  private predatorZ = new Float32Array(SardineSimulation.MAX_PREDATORS)
  private predatorRange = new Float32Array(SardineSimulation.MAX_PREDATORS)
  private predatorCount = 0

  // Plankton-rich feeding patches. Small fixed capacity, regenerated only
  // when patch count/radius actually change (see seedFoodPatches), not
  // every tick.
  private static readonly MAX_FOOD = 4
  foodX = new Float32Array(SardineSimulation.MAX_FOOD)
  foodY = new Float32Array(SardineSimulation.MAX_FOOD)
  foodZ = new Float32Array(SardineSimulation.MAX_FOOD)
  foodRadius = new Float32Array(SardineSimulation.MAX_FOOD)
  foodCount = 0
  food: FoodParams

  params: SchoolingParams
  env: EnvironmentParams

  constructor(params: SchoolingParams, env: EnvironmentParams, food: FoodParams) {
    this.params = params
    this.env = env
    this.food = food
    this.count = params.population

    const n = this.count
    this.posX = new Float32Array(n)
    this.posY = new Float32Array(n)
    this.posZ = new Float32Array(n)
    this.velX = new Float32Array(n)
    this.velY = new Float32Array(n)
    this.velZ = new Float32Array(n)
    this.speedBias = new Float32Array(n)
    this.phaseOffset = new Float32Array(n)
    this.tailPhase = new Float32Array(n)
    this.size = new Float32Array(n)
    this.alive = new Uint8Array(n).fill(1)
    this.aliveCount = n
    this.accX = new Float32Array(n)
    this.accY = new Float32Array(n)
    this.accZ = new Float32Array(n)
    this.fear = new Float32Array(n)
    this.forage = new Float32Array(n)
    this.debugSepX = new Float32Array(n); this.debugSepY = new Float32Array(n); this.debugSepZ = new Float32Array(n)
    this.debugAliX = new Float32Array(n); this.debugAliY = new Float32Array(n); this.debugAliZ = new Float32Array(n)
    this.debugCohX = new Float32Array(n); this.debugCohY = new Float32Array(n); this.debugCohZ = new Float32Array(n)
    this.debugFearX = new Float32Array(n); this.debugFearY = new Float32Array(n); this.debugFearZ = new Float32Array(n)
    this.debugNeighborCount = new Int32Array(n)
    this.debugNearestPredatorDist = new Float32Array(n).fill(Infinity)

    this.grid = new SpatialGrid(Math.max(params.perceptionRadius, 1))
    this.seed()
    this.seedFoodPatches(food)
  }

  // Regenerates patch positions. Only needs calling when patch count/radius
  // change — tweaking concentration alone just reads this.food live each
  // tick, no reseed required.
  seedFoodPatches(food: FoodParams) {
    this.food = food
    this.foodCount = food.enabled
      ? Math.min(food.patchCount, SardineSimulation.MAX_FOOD)
      : 0
    for (let i = 0; i < this.foodCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const r = this.env.boundsRadius * (0.2 + Math.random() * 0.5)
      this.foodX[i] = this.env.boundsCenter[0] + Math.cos(theta) * r
      this.foodY[i] = this.env.boundsCenter[1] + (Math.random() - 0.5) * this.env.boundsRadius * 0.4
      this.foodZ[i] = this.env.boundsCenter[2] + Math.sin(theta) * r
      this.foodRadius[i] = food.patchRadius
    }
  }

  private seed() {
    const n = this.count
    const spawnRadius = this.env.boundsRadius * 0.6
    for (let i = 0; i < n; i++) {
      // Start loosely clustered near the center so schools form organically
      // from the very first ticks rather than spawning pre-organized.
      const r = Math.cbrt(Math.random()) * spawnRadius
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      this.posX[i] = this.env.boundsCenter[0] + r * Math.sin(phi) * Math.cos(theta)
      this.posY[i] = this.env.boundsCenter[1] + r * Math.sin(phi) * Math.sin(theta)
      this.posZ[i] = this.env.boundsCenter[2] + r * Math.cos(phi)

      const dirTheta = Math.random() * Math.PI * 2
      const dirPhi = Math.acos(Math.random() * 2 - 1)
      const speed = this.params.cruiseSpeed
      this.velX[i] = speed * Math.sin(dirPhi) * Math.cos(dirTheta)
      this.velY[i] = speed * Math.sin(dirPhi) * Math.sin(dirTheta) * 0.3
      this.velZ[i] = speed * Math.cos(dirPhi)

      this.speedBias[i] = 1 + (Math.random() * 2 - 1) * this.params.individualVariation
      this.phaseOffset[i] = Math.random() * Math.PI * 2
      this.tailPhase[i] = Math.random() * Math.PI * 2
      this.size[i] = 0.85 + Math.random() * 0.3
    }
  }

  getAliveCount(): number {
    return this.aliveCount
  }

  // Removes a sardine from the active population. Captures require the
  // predator to actually be close enough (checked by the caller); this just
  // performs the removal bookkeeping.
  capture(index: number) {
    if (this.alive[index] === 0) return
    this.alive[index] = 0
    this.aliveCount--
  }

  // Counts distinct schools by flood-filling connectivity on the current
  // spatial grid: any two fish within `linkDistance` of each other (directly
  // or via a chain of such neighbors) belong to the same school. This is a
  // real measurement of the current spatial arrangement, not a guess — two
  // schools that merge or split will change this count on the next call.
  computeSchoolCount(linkDistance?: number): number {
    const n = this.count
    const link = linkDistance ?? this.params.perceptionRadius * 1.2
    const linkSq = link * link
    if (!this.clusterVisited || this.clusterVisited.length !== n) {
      this.clusterVisited = new Uint8Array(n)
    }
    const visited = this.clusterVisited
    visited.fill(0)
    const stack = this.clusterStack
    let schools = 0

    for (let i = 0; i < n; i++) {
      if (!this.alive[i] || visited[i]) continue
      schools++
      stack.length = 0
      stack.push(i)
      visited[i] = 1
      while (stack.length > 0) {
        const cur = stack.pop() as number
        const cx = this.posX[cur]
        const cy = this.posY[cur]
        const cz = this.posZ[cur]
        this.grid.forEachNear(cx, cy, cz, (j) => {
          if (visited[j]) return
          const dx = this.posX[j] - cx
          const dy = this.posY[j] - cy
          const dz = this.posZ[j] - cz
          if (dx * dx + dy * dy + dz * dz > linkSq) return
          visited[j] = 1
          stack.push(j)
        })
      }
    }
    return schools
  }

  // Pushed once per frame from PredatorSystem before stepping the sardines,
  // so each sardine's fear response stays a purely local perception check.
  setPredators(xs: ArrayLike<number>, ys: ArrayLike<number>, zs: ArrayLike<number>, ranges: ArrayLike<number>, count: number) {
    this.predatorCount = Math.min(count, SardineSimulation.MAX_PREDATORS)
    for (let i = 0; i < this.predatorCount; i++) {
      this.predatorX[i] = xs[i]
      this.predatorY[i] = ys[i]
      this.predatorZ[i] = zs[i]
      this.predatorRange[i] = ranges[i]
    }
  }

  // Finds the sardine nearest to a given point using the current spatial
  // grid snapshot — used by predators to pick a pursuit target without
  // needing global knowledge of every sardine's position.
  findNearestSardine(x: number, y: number, z: number): { index: number; dist: number } | null {
    let bestIndex = -1
    let bestDistSq = Infinity
    this.grid.forEachNear(x, y, z, (j) => {
      const dx = this.posX[j] - x
      const dy = this.posY[j] - y
      const dz = this.posZ[j] - z
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestDistSq) {
        bestDistSq = d
        bestIndex = j
      }
    })
    if (bestIndex === -1) return null
    return { index: bestIndex, dist: Math.sqrt(bestDistSq) }
  }

  // Samples a subset of agents and finds each one's true nearest neighbor
  // using the same spatial grid the steering pass just built, so this is a
  // real measurement of current packing density, not a guessed constant.
  computeAvgNearestNeighborDistance(sampleSize = 200): number {
    const n = this.count
    if (n < 2) return 0
    const samples = Math.min(sampleSize, n)
    let total = 0
    let counted = 0
    for (let s = 0; s < samples; s++) {
      const i = Math.floor((s / samples) * n)
      if (!this.alive[i]) continue
      const ix = this.posX[i]
      const iy = this.posY[i]
      const iz = this.posZ[i]
      let best = Infinity
      this.grid.forEachNear(ix, iy, iz, (j) => {
        if (j === i) return
        const dx = this.posX[j] - ix
        const dy = this.posY[j] - iy
        const dz = this.posZ[j] - iz
        const d = dx * dx + dy * dy + dz * dz
        if (d < best) best = d
      })
      if (best < Infinity) {
        total += Math.sqrt(best)
        counted++
      }
    }
    return counted > 0 ? total / counted : 0
  }

  // Called once per render frame; internally advances the sim on a fixed
  // timestep so behavior stays stable regardless of display frame rate.
  update(deltaSeconds: number) {
    const clampedDelta = Math.min(deltaSeconds, 0.1)
    this.accumulator += clampedDelta
    let steps = 0
    while (this.accumulator >= FIXED_DT && steps < 5) {
      this.step(FIXED_DT)
      this.accumulator -= FIXED_DT
      steps++
    }
  }

  private step(dt: number) {
    this.time += dt
    const n = this.count
    const p = this.params
    const e = this.env

    this.grid.setCellSize(Math.max(p.perceptionRadius, 1))
    this.grid.clear()
    for (let i = 0; i < n; i++) {
      if (this.alive[i]) this.grid.insert(i, this.posX[i], this.posY[i], this.posZ[i])
    }

    const perceptionSq = p.perceptionRadius * p.perceptionRadius
    const separationSq = p.separationRadius * p.separationRadius
    // Half-angle cosine for the forward vision cone. Alignment/cohesion
    // approximate eyesight (direction-dependent); separation does not — it
    // approximates the lateral line, a short-range sense that works in
    // every direction, so fish still dodge something closing in from behind.
    const cosHalfFov = Math.cos((p.fieldOfView * Math.PI) / 360)

    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) continue
      const ix = this.posX[i]
      const iy = this.posY[i]
      const iz = this.posZ[i]
      const ivx = this.velX[i]
      const ivy = this.velY[i]
      const ivz = this.velZ[i]
      const headSpeed = Math.sqrt(ivx * ivx + ivy * ivy + ivz * ivz) || 1e-4
      const headX = ivx / headSpeed
      const headY = ivy / headSpeed
      const headZ = ivz / headSpeed

      // Feeding: purely local — a fish only loosens its schooling behavior
      // once it can itself sense a nearby plankton patch, never because
      // "the school" has decided to feed.
      let forageLevel = 0
      let foodAccX = 0, foodAccY = 0, foodAccZ = 0
      for (let k = 0; k < this.foodCount; k++) {
        const dx = this.foodX[k] - ix
        const dy = this.foodY[k] - iy
        const dz = this.foodZ[k] - iz
        const distSq = dx * dx + dy * dy + dz * dz
        const radius = this.foodRadius[k]
        const detectRadius = radius * 1.6
        if (distSq > detectRadius * detectRadius) continue
        const dist = Math.sqrt(distSq) || 0.001
        if (dist > radius) {
          const pull = (1 - (dist - radius) / (detectRadius - radius)) * this.food.concentration
          foodAccX += (dx / dist) * pull * 1.2
          foodAccY += (dy / dist) * pull * 1.2
          foodAccZ += (dz / dist) * pull * 1.2
          forageLevel = Math.max(forageLevel, pull * 0.6)
        } else {
          // Inside the patch: drift and mill rather than collapsing onto
          // the exact center, so the cloud of fish fills the patch volume.
          const spread = (1 - dist / radius) * 0.4
          foodAccX -= (dx / dist) * spread
          foodAccY -= (dy / dist) * spread
          foodAccZ -= (dz / dist) * spread
          forageLevel = Math.max(forageLevel, this.food.concentration)
        }
      }
      this.forage[i] = forageLevel

      let sepX = 0, sepY = 0, sepZ = 0
      let aliX = 0, aliY = 0, aliZ = 0
      let cohX = 0, cohY = 0, cohZ = 0
      let neighborCount = 0
      let visionCount = 0
      let hasNearbyAny = false

      this.grid.forEachNear(ix, iy, iz, (j) => {
        if (j === i || neighborCount >= p.maxNeighbors * 3) return
        const dx = this.posX[j] - ix
        const dy = this.posY[j] - iy
        const dz = this.posZ[j] - iz
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq > perceptionSq || distSq < 1e-6) return
        hasNearbyAny = true

        // Lateral line: always perceived up close regardless of facing, so
        // a fish still dodges a collision it can't see coming.
        if (distSq < separationSq) {
          const dist = Math.sqrt(distSq)
          const push = (p.separationRadius - dist) / p.separationRadius
          sepX -= (dx / dist) * push
          sepY -= (dy / dist) * push
          sepZ -= (dz / dist) * push
        }

        // Vision: alignment/cohesion only count neighbors inside the
        // forward field of view, approximating eye placement instead of
        // omniscient 360° awareness of the whole local school.
        const dist = Math.sqrt(distSq)
        const facingDot = (dx * headX + dy * headY + dz * headZ) / dist
        if (facingDot < cosHalfFov) return

        neighborCount++
        visionCount++
        aliX += this.velX[j]
        aliY += this.velY[j]
        aliZ += this.velZ[j]
        cohX += dx
        cohY += dy
        cohZ += dz
      })

      let accX = 0, accY = 0, accZ = 0
      this.debugNeighborCount[i] = neighborCount

      // Foraging loosens the school's structural forces, not separation —
      // fish feeding together still avoid colliding with each other.
      const schoolingDamping = 1 - forageLevel * 0.65

      if (hasNearbyAny) {
        const sepFX = sepX * p.separationStrength
        const sepFY = sepY * p.separationStrength
        const sepFZ = sepZ * p.separationStrength
        accX += sepFX; accY += sepFY; accZ += sepFZ
        this.debugSepX[i] = sepFX; this.debugSepY[i] = sepFY; this.debugSepZ[i] = sepFZ
      } else {
        this.debugSepX[i] = 0; this.debugSepY[i] = 0; this.debugSepZ[i] = 0
      }

      if (visionCount > 0) {
        // Alignment: steer toward the local average heading, not a global one.
        const invN = 1 / visionCount
        const avgVx = aliX * invN
        const avgVy = aliY * invN
        const avgVz = aliZ * invN
        const aliFX = (avgVx - ivx) * p.alignmentStrength * schoolingDamping
        const aliFY = (avgVy - ivy) * p.alignmentStrength * schoolingDamping
        const aliFZ = (avgVz - ivz) * p.alignmentStrength * schoolingDamping
        accX += aliFX; accY += aliFY; accZ += aliFZ
        this.debugAliX[i] = aliFX; this.debugAliY[i] = aliFY; this.debugAliZ[i] = aliFZ

        // Cohesion: steer toward the local centroid offset.
        const avgCx = cohX * invN
        const avgCy = cohY * invN
        const avgCz = cohZ * invN
        const cohFX = avgCx * p.cohesionStrength * 0.5 * schoolingDamping
        const cohFY = avgCy * p.cohesionStrength * 0.5 * schoolingDamping
        const cohFZ = avgCz * p.cohesionStrength * 0.5 * schoolingDamping
        accX += cohFX; accY += cohFY; accZ += cohFZ
        this.debugCohX[i] = cohFX; this.debugCohY[i] = cohFY; this.debugCohZ[i] = cohFZ
      } else {
        this.debugAliX[i] = 0; this.debugAliY[i] = 0; this.debugAliZ[i] = 0
        this.debugCohX[i] = 0; this.debugCohY[i] = 0; this.debugCohZ[i] = 0
      }

      accX += foodAccX
      accY += foodAccY
      accZ += foodAccZ

      // Predator avoidance: purely local threat perception. Fish nearest a
      // predator react strongly and immediately; fish further away feel
      // little or nothing until the threat gets close to them too — there
      // is no global "predator present" broadcast.
      let fearLevel = 0
      let fearFX = 0, fearFY = 0, fearFZ = 0
      let nearestPredatorDist = Infinity
      // A predator outside the vision cone isn't invisible — the lateral
      // line still picks up close, strong disturbances — but it is sensed
      // later and weaker than one the fish is actually looking at.
      const lateralLineRange = p.separationRadius * 4
      for (let k = 0; k < this.predatorCount; k++) {
        const dx = ix - this.predatorX[k]
        const dy = iy - this.predatorY[k]
        const dz = iz - this.predatorZ[k]
        const distSq = dx * dx + dy * dy + dz * dz
        const dist = Math.sqrt(distSq)
        if (dist < nearestPredatorDist) nearestPredatorDist = dist
        const range = this.predatorRange[k]
        if (distSq > range * range || distSq < 1e-6) continue

        const facingDot = (-dx * headX - dy * headY - dz * headZ) / dist
        const inVision = facingDot >= cosHalfFov
        const awareness = inVision ? 1 : dist < lateralLineRange ? 0.5 : 0.12
        if (awareness <= 0) continue

        const urgency = (1 - dist / range) * awareness
        fearLevel = Math.max(fearLevel, urgency)
        const fleeStrength = urgency * urgency * 14
        const fx = (dx / dist) * fleeStrength
        const fy = (dy / dist) * fleeStrength
        const fz = (dz / dist) * fleeStrength
        accX += fx; accY += fy; accZ += fz
        fearFX += fx; fearFY += fy; fearFZ += fz
      }
      this.fear[i] = fearLevel
      this.debugFearX[i] = fearFX; this.debugFearY[i] = fearFY; this.debugFearZ[i] = fearFZ
      this.debugNearestPredatorDist[i] = nearestPredatorDist

      // Soft spherical boundary: a gentle homing pressure that grows near the
      // edge so the school prefers to stay within the visible ocean volume
      // without ever hitting a hard wall.
      const bx = ix - e.boundsCenter[0]
      const by = iy - e.boundsCenter[1]
      const bz = iz - e.boundsCenter[2]
      const distFromCenter = Math.sqrt(bx * bx + by * by + bz * bz)
      const soft = e.boundsRadius * 0.8
      if (distFromCenter > soft) {
        const overshoot = (distFromCenter - soft) / (e.boundsRadius - soft + 0.001)
        const strength = overshoot * overshoot * 4
        accX -= (bx / distFromCenter) * strength
        accY -= (by / distFromCenter) * strength
        accZ -= (bz / distFromCenter) * strength
      }

      // Subtle individual wandering so fish never look like identical clones.
      const wanderFreq = 0.6
      const wanderAmp = 0.15
      const wt = this.time * wanderFreq + this.phaseOffset[i]
      accX += Math.sin(wt) * wanderAmp
      accY += Math.sin(wt * 1.3 + 1.7) * wanderAmp * 0.5
      accZ += Math.cos(wt * 0.8) * wanderAmp

      this.accX[i] = accX
      this.accY[i] = accY
      this.accZ[i] = accZ
    }

    // Second pass: integrate with turn-rate-limited steering so direction
    // changes look like swimming, never instantaneous snaps.
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) continue
      const vx = this.velX[i]
      const vy = this.velY[i]
      const vz = this.velZ[i]
      const curSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz) || 0.0001
      const curDirX = vx / curSpeed
      const curDirY = vy / curSpeed
      const curDirZ = vz / curSpeed

      let desiredX = vx + this.accX[i] * dt
      let desiredY = vy + this.accY[i] * dt
      let desiredZ = vz + this.accZ[i] * dt
      const desiredSpeed = Math.sqrt(
        desiredX * desiredX + desiredY * desiredY + desiredZ * desiredZ,
      )
      // Foraging slows cruising speed; fleeing overrides that entirely.
      const forageSpeedScale = 1 - this.forage[i] * 0.5 * (1 - this.fear[i])
      const baseCruise = p.cruiseSpeed * forageSpeedScale
      const fearSpeedFloor = baseCruise + (p.burstSpeed - baseCruise) * this.fear[i]
      const targetSpeed = Math.min(
        Math.max(desiredSpeed, fearSpeedFloor * this.speedBias[i]),
        p.burstSpeed,
      )

      let desDirX: number, desDirY: number, desDirZ: number
      if (desiredSpeed < 1e-5) {
        desDirX = curDirX
        desDirY = curDirY
        desDirZ = curDirZ
      } else {
        desDirX = desiredX / desiredSpeed
        desDirY = desiredY / desiredSpeed
        desDirZ = desiredZ / desiredSpeed
      }

      const [newDirX, newDirY, newDirZ] = rotateToward(
        curDirX, curDirY, curDirZ,
        desDirX, desDirY, desDirZ,
        p.turnRate * dt * (1 + this.fear[i] * 1.5),
      )

      const cruiseTarget = p.cruiseSpeed * this.speedBias[i]
      const accel = Math.min(1, dt * (2 + this.fear[i] * 6))
      const finalSpeed = curSpeed + (Math.min(targetSpeed, p.burstSpeed) - curSpeed) * accel
      const speed = Math.max(cruiseTarget * 0.3, Math.min(finalSpeed, p.burstSpeed))

      this.velX[i] = newDirX * speed
      this.velY[i] = newDirY * speed
      this.velZ[i] = newDirZ * speed

      // Current is drift, not steering: it displaces the fish without ever
      // entering the heading computation above, so a fish can swim one way
      // while visibly being carried another — the distinction Scenario B is
      // built to demonstrate. velX/Y/Z stay pure "what the fish intends,"
      // which is also what orientation and tail-beat animation read from.
      this.posX[i] += (this.velX[i] + e.currentDirection[0] * e.currentStrength) * dt
      this.posY[i] += (this.velY[i] + e.currentDirection[1] * e.currentStrength) * dt
      this.posZ[i] += (this.velZ[i] + e.currentDirection[2] * e.currentStrength) * dt

      // Tail-beat frequency scales with speed so fast fish visibly beat faster.
      this.tailPhase[i] += dt * (6 + speed * 2.5)
    }
  }
}
