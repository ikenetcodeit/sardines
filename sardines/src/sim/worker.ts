/// <reference lib="webworker" />
import { BEHAVIOR_LABELS, MAX_NEIGHBORS, SIM_DT, SPECIES } from './config.ts'
import { ANIM_STRIDE, FORCE_STRIDE, type FishDetail, type Frame, type ToWorker } from './protocol.ts'
import { Simulation } from './Simulation.ts'

/**
 * The simulation runs here, off the main thread, at a fixed timestep. After
 * each batch of steps it posts a compact snapshot; the renderer interpolates
 * between the two most recent snapshots.
 */
const sim = new Simulation()
let selectedId = -1
let capturedBy = ''
let wantForces = false
let wantLabels = false
let lastEventSeq = 0
let lastReal = performance.now()
let acc = 0
let load = 0
let timer: ReturnType<typeof setTimeout> | null = null

function detail(): FishDetail | null {
  if (selectedId < 0) return null
  const s = sim.school
  const i = s.indexOfId(selectedId)
  if (i < 0) {
    return {
      id: selectedId,
      alive: false,
      capturedBy,
      x: 0,
      y: 0,
      z: 0,
      dx: 0,
      dy: 0,
      dz: 1,
      speed: 0,
      neighbors: 0,
      nearestNeighbor: 0,
      nearestPredator: Infinity,
      threat: 0,
      alarm: 0,
      behavior: 'Captured',
      hunger: 0,
      fatigue: 0,
      feeding: 0,
      weights: { separation: 0, alignment: 0, cohesion: 0, avoidance: 0 },
      nbrPos: new Float32Array(0),
    }
  }
  const i3 = i * 3
  const n = s.nbrCount[i]
  const nbrPos = new Float32Array(n * 3)
  for (let k = 0; k < n; k++) {
    const j = s.nbr[i * MAX_NEIGHBORS + k]
    if (j >= s.count) continue
    nbrPos[k * 3] = s.pos[j * 3]
    nbrPos[k * 3 + 1] = s.pos[j * 3 + 1]
    nbrPos[k * 3 + 2] = s.pos[j * 3 + 2]
  }
  const mag = (a: Float32Array) => Math.hypot(a[i3], a[i3 + 1], a[i3 + 2])
  return {
    id: selectedId,
    alive: true,
    x: s.pos[i3],
    y: s.pos[i3 + 1],
    z: s.pos[i3 + 2],
    dx: s.dir[i3],
    dy: s.dir[i3 + 1],
    dz: s.dir[i3 + 2],
    speed: s.speed[i],
    neighbors: n,
    nearestNeighbor: s.nearest[i],
    nearestPredator: s.nearestPred[i],
    threat: s.threat[i],
    alarm: s.alarm[i],
    behavior: BEHAVIOR_LABELS[s.behavior[i]] ?? '—',
    hunger: s.hunger[i],
    fatigue: s.fatigue[i],
    feeding: s.food[i],
    weights: { separation: mag(s.fSep), alignment: mag(s.fAli), cohesion: mag(s.fCoh), avoidance: mag(s.fAvoid) },
    nbrPos,
  }
}

function post() {
  const s = sim.school
  const n = s.count
  const ids = s.ids.slice(0, n)
  const pos = s.pos.slice(0, n * 3)
  const dir = s.dir.slice(0, n * 3)
  const anim = new Float32Array(n * ANIM_STRIDE)
  for (let i = 0; i < n; i++) {
    const o = i * ANIM_STRIDE
    anim[o] = s.roll[i]
    anim[o + 1] = s.tailPhase[i]
    anim[o + 2] = s.tailFreq[i]
    anim[o + 3] = s.tailAmp[i]
    anim[o + 4] = s.bend[i]
    anim[o + 5] = s.alarm[i]
    anim[o + 6] = s.behavior[i]
    anim[o + 7] = s.size[i]
    anim[o + 8] = s.speed[i]
  }
  let labels: Int16Array | null = null
  if (wantLabels) {
    labels = new Int16Array(n)
    for (let i = 0; i < n; i++) labels[i] = sim.analysis.label[i]
  }
  let forceIdx: Int32Array | null = null
  let forces: Float32Array | null = null
  if (wantForces && n > 0) {
    const stride = Math.max(1, Math.ceil(n / 700))
    const m = Math.ceil(n / stride)
    forceIdx = new Int32Array(m)
    forces = new Float32Array(m * FORCE_STRIDE)
    for (let k = 0, i = 0; i < n; i += stride, k++) {
      forceIdx[k] = i
      const o = k * FORCE_STRIDE
      for (let c = 0; c < 3; c++) {
        forces[o + c] = s.fSep[i * 3 + c]
        forces[o + 3 + c] = s.fAli[i * 3 + c]
        forces[o + 6 + c] = s.fCoh[i * 3 + c]
        forces[o + 9 + c] = s.fAvoid[i * 3 + c]
      }
    }
  }
  const events = sim.predators.events.filter((e) => e.seq > lastEventSeq)
  if (events.length) lastEventSeq = events[events.length - 1].seq
  for (const e of events) if (e.fishId === selectedId && e.kind === 'capture') capturedBy = SPECIES[e.species].label
  const env = sim.env
  const frame: Frame = {
    type: 'frame',
    version: sim.version,
    tick: sim.ticks,
    simTime: sim.simTime,
    envTime: env.time,
    timeScale: sim.timeScale,
    paused: sim.paused,
    count: n,
    ids,
    pos,
    dir,
    anim,
    labels,
    forceIdx,
    forces,
    predators: sim.predators.predators.map((p) => ({
      id: p.id,
      species: p.species,
      x: p.pos[0],
      y: p.pos[1],
      z: p.pos[2],
      dx: p.dir[0],
      dy: p.dir[1],
      dz: p.dir[2],
      speed: p.speed,
      roll: p.roll,
      state: p.state,
      wingFold: p.wingFold,
      tailPhase: p.tailPhase,
      captures: p.captures,
      misses: p.misses,
      length: p.def.length,
    })),
    food: env.food.map((f) => ({ x: f.x, y: f.y, z: f.z, radius: f.radius, density: f.density, seed: f.seed })),
    disturbances: env.disturbances.map((d) => ({ ...d })),
    obstacles: env.obstacles,
    stats: sim.stats,
    events,
    selected: detail(),
    stepMs: sim.stepMs,
    load,
    visualRange: s.visualRange,
    lateralRange: s.lateralRange,
  }
  const transfer: Transferable[] = [ids.buffer, pos.buffer, dir.buffer, anim.buffer]
  if (labels) transfer.push(labels.buffer)
  if (forceIdx && forces) transfer.push(forceIdx.buffer, forces.buffer)
  ;(self as unknown as Worker).postMessage(frame, transfer)
}

function loop() {
  timer = null
  const now = performance.now()
  const realDt = Math.min(0.25, (now - lastReal) / 1000)
  lastReal = now
  if (!sim.paused) {
    acc += realDt * sim.timeScale
    let steps = 0
    const t0 = performance.now()
    while (acc >= SIM_DT && steps < 3) {
      const s0 = performance.now()
      sim.step()
      sim.stepMs = sim.stepMs * 0.9 + (performance.now() - s0) * 0.1
      acc -= SIM_DT
      steps++
    }
    // if we cannot keep up, let simulated time run slower instead of stalling
    if (steps === 3 && acc > SIM_DT) acc = 0
    const busy = performance.now() - t0
    if (realDt > 0) load = load * 0.9 + Math.min(1, busy / (realDt * 1000)) * 0.1
    if (steps > 0) post()
  }
  const untilNext = sim.paused ? 100 : ((SIM_DT - acc) / Math.max(0.01, sim.timeScale)) * 1000
  timer = setTimeout(loop, Math.max(0, Math.min(100, untilNext - 0.5)))
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data
  switch (m.type) {
    case 'load':
      sim.load(m.scenario, m.seed, m.params)
      acc = 0
      lastEventSeq = sim.predators.eventSeq
      capturedBy = ''
      break
    case 'params':
      sim.setParams(m.params)
      break
    case 'control':
      sim.paused = m.paused
      sim.timeScale = m.timeScale
      lastReal = performance.now()
      break
    case 'select':
      selectedId = m.id
      capturedBy = ''
      break
    case 'overlays':
      wantForces = m.forces
      wantLabels = m.labels
      break
    case 'step':
      if (sim.paused) sim.step()
      break
  }
  post()
  if (timer === null) loop()
}
