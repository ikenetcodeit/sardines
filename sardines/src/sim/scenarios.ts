import { DEFAULT_ENVIRONMENT, DEFAULT_PREDATORS, DEFAULT_SCHOOLING } from './config'
import type { EnvironmentParams, FoodParams, PredatorParams, SchoolingParams } from './config'

export interface Scenario {
  key: string
  label: string
  description: string
  schooling: Partial<SchoolingParams>
  environment: Partial<EnvironmentParams>
  predators: Partial<PredatorParams>
  food?: Partial<FoodParams>
}

// Each scenario only overrides the parameters that matter for it; everything
// else falls back to the normal schooling defaults so switching scenarios
// never requires a separate code path — it's the same simulation engine
// seeded with a different starting configuration.
export const SCENARIOS: Scenario[] = [
  {
    key: 'openOcean',
    label: 'A — Open Ocean',
    description: 'A large school travels peacefully through clear water.',
    schooling: { ...DEFAULT_SCHOOLING },
    environment: { ...DEFAULT_ENVIRONMENT, currentStrength: 0.1 },
    predators: { ...DEFAULT_PREDATORS, enabled: false },
  },
  {
    key: 'oceanCurrent',
    label: 'B — Ocean Current',
    description: 'A strong current pushes the school while it keeps swimming its own heading.',
    schooling: { ...DEFAULT_SCHOOLING },
    environment: {
      ...DEFAULT_ENVIRONMENT,
      currentStrength: 0.9,
      currentDirection: [1, 0.1, 0.4],
    },
    predators: { ...DEFAULT_PREDATORS, enabled: false },
  },
  {
    key: 'feedingGrounds',
    label: 'C — Feeding Grounds',
    description:
      'The school encounters plankton-rich patches: fish that sense a patch loosen schooling structure and slow down to forage.',
    schooling: { ...DEFAULT_SCHOOLING, individualVariation: 0.35 },
    environment: { ...DEFAULT_ENVIRONMENT, currentStrength: 0.08 },
    predators: { ...DEFAULT_PREDATORS, enabled: false },
    food: { enabled: true, patchCount: 2, patchRadius: 7, concentration: 0.8 },
  },
  {
    key: 'predatorEncounter',
    label: 'D — Predator Encounter',
    description: 'A single shark approaches an otherwise undisturbed school.',
    schooling: { ...DEFAULT_SCHOOLING },
    environment: { ...DEFAULT_ENVIRONMENT },
    predators: {
      enabled: true,
      species: 'shark',
      count: 1,
      detectionRange: 7,
      huntingIntensity: 0.5,
    },
  },
  {
    key: 'baitBall',
    label: 'E — Bait Ball',
    description: 'Sustained multi-predator pressure in a constrained volume can compress the school defensively.',
    schooling: {
      ...DEFAULT_SCHOOLING,
      cohesionStrength: 1.6,
      separationStrength: 2.0,
      perceptionRadius: 4,
    },
    environment: { ...DEFAULT_ENVIRONMENT, boundsRadius: 16 },
    predators: {
      enabled: true,
      species: 'dolphin',
      count: 3,
      detectionRange: 9,
      huntingIntensity: 0.85,
    },
  },
  {
    key: 'sardineRun',
    label: 'F — Sardine Run',
    description:
      'A documentary-style migration scenario: sharks, dolphins, sailfish, and diving seabirds all pressure the same traveling school at once, each with its own pursuit behavior.',
    schooling: {
      ...DEFAULT_SCHOOLING,
      population: 5000,
      cruiseSpeed: 2.8,
    },
    environment: {
      ...DEFAULT_ENVIRONMENT,
      boundsRadius: 40,
      currentStrength: 0.5,
      currentDirection: [1, 0, 0.1],
    },
    predators: {
      enabled: true,
      mixedSpecies: true,
      speciesCounts: { shark: 2, dolphin: 2, sailfish: 1, seabird: 2 },
      detectionRange: 8,
      huntingIntensity: 0.6,
    },
  },
]
