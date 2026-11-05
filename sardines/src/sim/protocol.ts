import type { PredatorSpecies, SimParams } from './config.ts'
import type { Obstacle } from './Environment.ts'
import type { PredatorEvent, PredatorState } from './PredatorSystem.ts'
import type { ScenarioId } from './scenarios.ts'
import type { SimStats } from './SchoolAnalysis.ts'

/** Per-fish animation record stride: roll, tailPhase, tailFreq, tailAmp, bend, alarm, behavior, size, speed */
export const ANIM_STRIDE = 9
/** Per-sample force record stride: sep(3) ali(3) coh(3) avoid(3) */
export const FORCE_STRIDE = 12

export interface PredatorFrame {
  id: number
  species: PredatorSpecies
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  speed: number
  roll: number
  state: PredatorState
  wingFold: number
  tailPhase: number
  captures: number
  misses: number
  length: number
}

export interface FishDetail {
  id: number
  alive: boolean
  capturedBy?: string
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  speed: number
  neighbors: number
  nearestNeighbor: number
  nearestPredator: number
  threat: number
  alarm: number
  behavior: string
  hunger: number
  fatigue: number
  feeding: number
  weights: { separation: number; alignment: number; cohesion: number; avoidance: number }
  /** Positions of the schoolmates this fish currently attends to. */
  nbrPos: Float32Array
}

export interface FoodFrame {
  x: number
  y: number
  z: number
  radius: number
  density: number
  seed: number
}

export interface DisturbanceFrame {
  x: number
  y: number
  z: number
  radius: number
  strength: number
  age: number
  life: number
}

export interface Frame {
  type: 'frame'
  version: number
  tick: number
  simTime: number
  envTime: number
  timeScale: number
  paused: boolean
  count: number
  ids: Int32Array
  pos: Float32Array
  dir: Float32Array
  anim: Float32Array
  labels: Int16Array | null
  forceIdx: Int32Array | null
  forces: Float32Array | null
  predators: PredatorFrame[]
  food: FoodFrame[]
  disturbances: DisturbanceFrame[]
  obstacles: Obstacle[]
  stats: SimStats
  events: PredatorEvent[]
  selected: FishDetail | null
  stepMs: number
  /** Fraction of wall-clock time the worker spends simulating. */
  load: number
  visualRange: number
  lateralRange: number
}

export type ToWorker =
  | { type: 'load'; scenario: ScenarioId; seed: number; params: SimParams }
  | { type: 'params'; params: SimParams }
  | { type: 'control'; paused: boolean; timeScale: number }
  | { type: 'select'; id: number }
  | { type: 'overlays'; forces: boolean; labels: boolean }
  | { type: 'step' }
