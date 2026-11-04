export interface SchoolingParams {
  population: number
  cruiseSpeed: number
  burstSpeed: number
  separationStrength: number
  alignmentStrength: number
  cohesionStrength: number
  perceptionRadius: number
  separationRadius: number
  maxNeighbors: number
  turnRate: number // max radians/sec the heading can change
  individualVariation: number // 0..1, per-agent randomness in speed/phase
  fieldOfView: number // degrees; alignment/cohesion only see neighbors inside this forward cone
}

export interface EnvironmentParams {
  boundsRadius: number
  boundsCenter: [number, number, number]
  currentStrength: number
  currentDirection: [number, number, number]
}

export const DEFAULT_SCHOOLING: SchoolingParams = {
  population: 1000,
  cruiseSpeed: 2.2,
  burstSpeed: 6.0,
  separationStrength: 1.6,
  alignmentStrength: 1.0,
  cohesionStrength: 0.9,
  perceptionRadius: 3.2,
  separationRadius: 0.9,
  maxNeighbors: 10,
  turnRate: 3.2,
  individualVariation: 0.25,
  fieldOfView: 300, // most fish have near-360° monocular vision with a narrow blind spot directly behind
}

export const DEFAULT_ENVIRONMENT: EnvironmentParams = {
  boundsRadius: 26,
  boundsCenter: [0, 0, 0],
  currentStrength: 0.15,
  currentDirection: [1, 0, 0.3],
}

export type PredatorSpecies = 'dolphin' | 'shark' | 'sailfish' | 'seabird'
export const PREDATOR_SPECIES_LIST: PredatorSpecies[] = ['shark', 'dolphin', 'sailfish', 'seabird']

export interface PredatorParams {
  enabled: boolean
  species: PredatorSpecies
  count: number
  detectionRange: number
  huntingIntensity: number // 0..1, scales speed/aggression
  captureEnabled: boolean // off by default: nonlethal demonstration mode
  // When true, `speciesCounts` replaces `species`/`count`: multiple species
  // hunt the same school at once (e.g. a true multi-predator Sardine Run)
  // instead of one PredatorSystem running a single uniform species.
  mixedSpecies: boolean
  speciesCounts: Record<PredatorSpecies, number>
}

export const PREDATOR_PROFILES: Record<
  PredatorSpecies,
  {
    baseSpeed: number
    burstSpeed: number
    turnRate: number
    color: string
    size: number
    captureRadius: number
    captureChance: number // per-attempt probability when within capture radius
  }
> = {
  dolphin: { baseSpeed: 4.5, burstSpeed: 9, turnRate: 2.4, color: '#7d93a6', size: 2.4, captureRadius: 1.1, captureChance: 0.35 },
  shark: { baseSpeed: 3.2, burstSpeed: 7.5, turnRate: 1.6, color: '#4a5560', size: 2.8, captureRadius: 1.3, captureChance: 0.3 },
  sailfish: { baseSpeed: 5.5, burstSpeed: 12, turnRate: 3.4, color: '#5b7a8c', size: 2.0, captureRadius: 0.9, captureChance: 0.4 },
  // Cruises above the surface, dives fast and briefly rather than sustaining
  // an underwater chase — see PredatorSystem's dedicated dive state machine.
  seabird: { baseSpeed: 3.5, burstSpeed: 16, turnRate: 2.8, color: '#e8e8e0', size: 1.3, captureRadius: 0.8, captureChance: 0.45 },
}

export const DEFAULT_PREDATORS: PredatorParams = {
  enabled: false,
  species: 'shark',
  count: 2,
  detectionRange: 7,
  huntingIntensity: 0.6,
  captureEnabled: false,
  mixedSpecies: false,
  speciesCounts: { shark: 2, dolphin: 1, sailfish: 1, seabird: 0 },
}

export interface FoodParams {
  enabled: boolean
  patchCount: number
  patchRadius: number
  concentration: number // 0..1, strength of attraction + foraging loosening
}

export const DEFAULT_FOOD: FoodParams = {
  enabled: false,
  patchCount: 2,
  patchRadius: 6,
  concentration: 0.6,
}

export const POPULATION_PRESETS = {
  low: 250,
  medium: 1000,
  high: 5000,
  extreme: 10000,
} as const
