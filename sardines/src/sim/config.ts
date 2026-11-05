/**
 * Simulation parameters.
 *
 * IMPORTANT (scientific credibility): nearly every number below is a MODEL
 * APPROXIMATION chosen to produce realistic-looking collective outcomes. They
 * are not universal biological measurements. Where a value is loosely
 * anchored to the literature the comment says so; everything is user-tunable.
 */

export const MAX_FISH = 12000
export const MAX_NEIGHBORS = 24
/** Mean adult Sardinops sagax standard length is roughly 15–25 cm. */
export const BODY_LENGTH = 0.2
/** Fixed simulation step (s). Rendering interpolates between steps. */
export const SIM_DT = 1 / 30

export type PredatorSpecies = 'dolphin' | 'shark' | 'sailfish' | 'seabird'
export type PredatorChoice = PredatorSpecies | 'mixed'
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra'
export type CameraMode = 'free' | 'drone' | 'school' | 'individual' | 'predator' | 'cinematic'

export interface SchoolParams {
  population: number
  /** Preferred cruising speed, m/s. ~2–4 body lengths/s is typical of clupeid cruising. */
  cruiseSpeed: number
  /** Maximum escape speed, m/s. Fast-start bursts reach ~10+ BL/s for brief periods. */
  burstSpeed: number
  separation: number
  alignment: number
  cohesion: number
  /** Maximum visual range for schoolmates (m); further limited by water visibility. */
  sensoryRange: number
  /** Topological neighbour limit (how many nearest schoolmates each fish attends to). */
  neighborLimit: number
  /** Multiplier on the biomechanical turn-rate limit. */
  turnResponsiveness: number
  /** Preferred nearest-neighbour spacing in body lengths (~0.5–1 BL is often reported). */
  preferredSpacing: number
  /** How strongly perceived danger compresses spacing and strengthens grouping (0–1). */
  densityResponse: number
  /** Amount of individual difference in size, speed preference, rhythm and wandering (0–1). */
  individualVariation: number
}

export interface EnvironmentParams {
  /** Horizontal visibility (m). Turbid water reduces both rendering range and fish perception. */
  visibility: number
  /** Mean current speed (m/s). */
  currentStrength: number
  /** Current heading in degrees (0 = +Z, 90 = +X). */
  currentDirection: number
  /** 0–1: strength of eddies and slow changes in direction. */
  currentVariability: number
  sunlight: number
  /** Depth of the seafloor (m). */
  oceanDepth: number
  /** 0–1 plankton concentration (number and richness of feeding patches). */
  plankton: number
  waveIntensity: number
  /** Typical depth the fish prefer (m). */
  preferredDepth: number
}

export interface PredatorParams {
  species: PredatorChoice
  count: number
  /** 0–1: how often and how persistently predators attack. */
  huntingIntensity: number
  /** Distance at which predators can detect prey (m). */
  detectionRange: number
  captureEnabled: boolean
  speedMultiplier: number
}

export interface OverlayParams {
  velocity: boolean
  separation: boolean
  alignment: boolean
  cohesion: boolean
  avoidance: boolean
  neighborhoods: boolean
  currents: boolean
  schools: boolean
}

export interface SimParams {
  school: SchoolParams
  env: EnvironmentParams
  predators: PredatorParams
  /** Fraction of fish carrying a weak migratory heading preference (Sardine Run). */
  migration: { fraction: number; heading: number }
  obstacles: boolean
}

export const DEFAULT_SCHOOL: SchoolParams = {
  population: 1500,
  cruiseSpeed: 0.6,
  burstSpeed: 2.4,
  separation: 1.6,
  alignment: 1.0,
  cohesion: 0.8,
  sensoryRange: 4.0,
  neighborLimit: 8,
  turnResponsiveness: 1.0,
  preferredSpacing: 0.9,
  densityResponse: 0.7,
  individualVariation: 0.5,
}

export const DEFAULT_ENV: EnvironmentParams = {
  visibility: 45,
  currentStrength: 0.12,
  currentDirection: 30,
  currentVariability: 0.25,
  sunlight: 1.0,
  oceanDepth: 180,
  plankton: 0.2,
  waveIntensity: 1.0,
  preferredDepth: 14,
}

export const DEFAULT_PREDATORS: PredatorParams = {
  species: 'shark',
  count: 0,
  huntingIntensity: 0.6,
  detectionRange: 40,
  captureEnabled: true,
  speedMultiplier: 1.0,
}

export const DEFAULT_OVERLAYS: OverlayParams = {
  velocity: false,
  separation: false,
  alignment: false,
  cohesion: false,
  avoidance: false,
  neighborhoods: false,
  currents: false,
  schools: false,
}

export function defaultParams(): SimParams {
  return {
    school: { ...DEFAULT_SCHOOL },
    env: { ...DEFAULT_ENV },
    predators: { ...DEFAULT_PREDATORS },
    migration: { fraction: 0, heading: 0 },
    obstacles: false,
  }
}

export interface SpeciesDef {
  label: string
  length: number
  cruise: number
  maxSpeed: number
  accel: number
  turnRate: number
  captureRadius: number
  /** Base probability that a well-positioned strike succeeds. */
  captureSkill: number
  /** How conspicuous the predator is to fish (scales perceived threat). */
  conspicuity: number
  airborne: boolean
}

export const SPECIES: Record<PredatorSpecies, SpeciesDef> = {
  dolphin: {
    label: 'Common dolphin',
    length: 2.2,
    cruise: 2.6,
    maxSpeed: 8,
    accel: 5,
    turnRate: 1.9,
    captureRadius: 0.5,
    captureSkill: 0.35,
    conspicuity: 1.0,
    airborne: false,
  },
  shark: {
    label: 'Bronze whaler shark',
    length: 2.8,
    cruise: 1.5,
    maxSpeed: 6,
    accel: 3,
    turnRate: 1.1,
    captureRadius: 0.55,
    captureSkill: 0.3,
    conspicuity: 0.9,
    airborne: false,
  },
  sailfish: {
    label: 'Sailfish',
    length: 2.6,
    cruise: 2.2,
    maxSpeed: 10,
    accel: 7,
    turnRate: 2.3,
    captureRadius: 0.7,
    captureSkill: 0.25,
    conspicuity: 1.1,
    airborne: false,
  },
  seabird: {
    label: 'Cape gannet',
    length: 0.9,
    cruise: 11,
    maxSpeed: 24,
    accel: 9,
    turnRate: 1.4,
    captureRadius: 0.35,
    captureSkill: 0.4,
    conspicuity: 0.8,
    airborne: true,
  },
}

export const MIXED_ORDER: PredatorSpecies[] = [
  'dolphin',
  'seabird',
  'shark',
  'dolphin',
  'seabird',
  'dolphin',
  'shark',
  'seabird',
  'sailfish',
  'dolphin',
]

export interface QualityPreset {
  label: string
  fishSegments: number
  fishRings: number
  pixelRatio: number
  particles: number
  lightShafts: number
  surfaceSegments: number
  suggestedPopulation: number
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: {
    label: 'Low',
    fishSegments: 5,
    fishRings: 8,
    pixelRatio: 0.75,
    particles: 1500,
    lightShafts: 0,
    surfaceSegments: 48,
    suggestedPopulation: 250,
  },
  medium: {
    label: 'Medium',
    fishSegments: 6,
    fishRings: 12,
    pixelRatio: 1,
    particles: 4000,
    lightShafts: 10,
    surfaceSegments: 96,
    suggestedPopulation: 1000,
  },
  high: {
    label: 'High',
    fishSegments: 8,
    fishRings: 16,
    pixelRatio: 1.5,
    particles: 7000,
    lightShafts: 18,
    surfaceSegments: 160,
    suggestedPopulation: 5000,
  },
  ultra: {
    label: 'Ultra',
    fishSegments: 10,
    fishRings: 22,
    pixelRatio: 2,
    particles: 10000,
    lightShafts: 26,
    surfaceSegments: 220,
    suggestedPopulation: 10000,
  },
}

export const QUALITY_ORDER: QualityLevel[] = ['low', 'medium', 'high', 'ultra']

/** Behaviour codes stored per fish (for inspection and overlays). */
export const BEHAVIOR_LABELS = [
  'Cruising',
  'Schooling',
  'Reconnecting',
  'Foraging',
  'Alarmed',
  'Escaping',
  'Initiating turn',
  'Avoiding boundary',
] as const
export const B_CRUISE = 0
export const B_SCHOOL = 1
export const B_ISOLATED = 2
export const B_FEED = 3
export const B_ALARM = 4
export const B_ESCAPE = 5
export const B_INITIATE = 6
export const B_BOUNDARY = 7
