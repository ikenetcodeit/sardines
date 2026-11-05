import { MAX_FISH, SIM_DT, type SimParams } from './config.ts'
import { Environment } from './Environment.ts'
import { PredatorSystem } from './PredatorSystem.ts'
import { Rng } from './rng.ts'
import { SardineSchool } from './SardineSchool.ts'
import { getScenario, scenarioParams, type ScenarioId } from './scenarios.ts'
import { EMPTY_STATS, SchoolAnalysis, type SimStats } from './SchoolAnalysis.ts'

/**
 * Orchestrates the fixed-timestep simulation. Rendering reads the typed
 * arrays directly and interpolates between the last two steps using `alpha`.
 */
export class Simulation {
  params: SimParams
  school = new SardineSchool(MAX_FISH)
  predators = new PredatorSystem()
  env: Environment
  analysis = new SchoolAnalysis(MAX_FISH)
  stats: SimStats = EMPTY_STATS
  scenario: ScenarioId = 'open'
  seed = 1
  /** Incremented on every reset so views can re-sync. */
  version = 0

  paused = false
  timeScale = 1
  /** Interpolation factor between previous and current step. */
  alpha = 1
  simTime = 0
  ticks = 0
  /** Exponential moving average of CPU ms spent per simulation step. */
  stepMs = 0
  /** CPU ms spent simulating during the last rendered frame. */
  frameSimMs = 0
  private acc = 0
  private rng = new Rng(3)

  constructor() {
    this.params = scenarioParams('open')
    this.env = new Environment(this.params.env)
  }

  load(id: ScenarioId, seed = this.seed, params?: SimParams) {
    const sc = getScenario(id)
    this.scenario = id
    this.seed = seed
    this.params = params ?? scenarioParams(id)
    this.env.params = this.params.env
    this.env.habitatRadius = sc.habitatRadius
    this.env.reset(seed, this.params.obstacles)
    this.rng.seed(seed)
    this.school.rng.seed(seed * 31 + 7)
    this.school.clear()
    this.school.meanNND = this.params.school.preferredSpacing * 0.2
    this.predators.reset(seed)
    this.acc = 0
    this.alpha = 1
    this.simTime = 0
    this.ticks = 0

    const r = this.rng
    const total = Math.min(MAX_FISH, Math.round(this.params.school.population))
    let placed = 0
    sc.schools.forEach((s, k) => {
      const cnt = k === sc.schools.length - 1 ? total - placed : Math.round(total * s.share)
      placed += cnt
      // randomize the layout a little on every seed
      const jitter = seed === 1 ? 0 : 1
      const hx0 = s.x + jitter * r.range(-6, 6)
      const hz0 = s.z + jitter * r.range(-6, 6)
      const head = ((s.heading + jitter * r.range(-40, 40)) * Math.PI) / 180
      const fx = Math.sin(head)
      const fz = Math.cos(head)
      // start a little looser than a settled school (~35 fish/m^3), never denser
      const vol = (4 / 3) * Math.PI * s.length * s.height * s.width
      const shrink = Math.min(1, Math.cbrt(cnt / 35 / vol))
      const sl = s.length * shrink
      const sh = s.height * shrink
      const sw = s.width * shrink
      for (let i = 0; i < cnt; i++) {
        // ellipsoidal volume, denser towards the centre
        let a = 0
        let b = 0
        let c = 0
        do {
          a = r.range(-1, 1)
          b = r.range(-1, 1)
          c = r.range(-1, 1)
        } while (a * a + b * b + c * c > 1)
        const along = a * sl
        const across = c * sw
        const x = hx0 + fx * along - fz * across
        const z = hz0 + fz * along + fx * across
        const y = Math.min(-1, s.y + b * sh)
        const dyaw = r.gauss() * 0.15
        this.school.addFish(x, y, z, Math.sin(head + dyaw), r.gauss() * 0.05, Math.cos(head + dyaw), this.params)
      }
    })

    if (sc.foodAhead && this.env.food.length > 0) {
      const s = sc.schools[0]
      const head = (s.heading * Math.PI) / 180
      const f = this.env.food[0]
      f.x = s.x + Math.sin(head) * 24
      f.z = s.z + Math.cos(head) * 24
      f.y = s.y
      f.radius = 11
      f.density = 1
    }

    this.predators.sync(this.params, this.school, sc.predatorsFar)
    // one step so neighbourhoods and statistics exist from the first frame
    this.step()
    this.stats = this.analysis.analyze(this.school, this.params, this.predators)
    this.version++
  }

  /** Apply a new parameter object (from the UI) to the running simulation. */
  setParams(p: SimParams) {
    const obstaclesChanged = p.obstacles !== this.params.obstacles
    this.params = p
    this.env.params = p.env
    this.env.syncFood()
    this.syncPopulation()
    this.predators.sync(p, this.school, true)
    if (obstaclesChanged) {
      this.env.obstacles.length = 0
      if (p.obstacles) {
        // regenerate rocks without disturbing anything else
        const keepFood = this.env.food.slice()
        const t = this.env.time
        this.env.reset(this.seed, true)
        this.env.food = keepFood
        this.env.time = t
      }
      this.version++
    }
  }

  syncPopulation() {
    const want = Math.max(0, Math.min(MAX_FISH, Math.round(this.params.school.population)))
    const s = this.school
    const r = this.rng
    if (want > s.count) {
      const add = want - s.count
      for (let k = 0; k < add; k++) {
        if (s.count === 0) {
          s.addFish(r.range(-5, 5), -this.params.env.preferredDepth + r.range(-2, 2), r.range(-5, 5), 0, 0, 1, this.params)
          continue
        }
        // new fish join next to an existing fish (as if arriving from outside the view)
        const j = r.int(s.count)
        const j3 = j * 3
        s.addFish(
          s.pos[j3] + r.range(-0.6, 0.6),
          Math.min(-0.5, s.pos[j3 + 1] + r.range(-0.4, 0.4)),
          s.pos[j3 + 2] + r.range(-0.6, 0.6),
          s.dir[j3],
          s.dir[j3 + 1],
          s.dir[j3 + 2],
          this.params,
        )
      }
    } else if (want < s.count) {
      while (s.count > want) s.removeAt(r.int(s.count))
    }
  }

  /** Advance by real elapsed seconds using fixed steps; returns steps taken. */
  advance(realDt: number): number {
    this.frameSimMs = 0
    if (this.paused) return 0
    this.acc += Math.min(realDt, 0.1) * this.timeScale
    let steps = 0
    const maxSteps = 4
    while (this.acc >= SIM_DT && steps < maxSteps) {
      const t0 = performance.now()
      this.step()
      const ms = performance.now() - t0
      this.frameSimMs += ms
      this.stepMs = this.stepMs * 0.9 + ms * 0.1
      this.acc -= SIM_DT
      steps++
    }
    if (steps === maxSteps && this.acc > SIM_DT) this.acc = 0 // fall behind gracefully
    this.alpha = Math.min(1, this.acc / SIM_DT)
    return steps
  }

  step() {
    const dt = SIM_DT
    this.env.step(dt)
    this.predators.step(dt, this.params, this.school, this.env)
    this.school.step(dt, this.params, this.env, this.predators.predators.length, this.predators.pv, this.analysis.beacons)
    this.simTime += dt
    this.ticks++
    if (this.ticks % 15 === 0) {
      this.stats = this.analysis.analyze(this.school, this.params, this.predators)
    }
  }
}
