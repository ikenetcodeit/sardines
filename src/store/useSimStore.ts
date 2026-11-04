import { create } from 'zustand'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_FOOD,
  DEFAULT_PREDATORS,
  DEFAULT_SCHOOLING,
  type EnvironmentParams,
  type FoodParams,
  type PredatorParams,
  type PredatorSpecies,
  type SchoolingParams,
} from '../sim/config'
import { SCENARIOS } from '../sim/scenarios'

export interface SimStats {
  fishCount: number
  avgSpeed: number
  avgNeighborDistance: number
  polarization: number
  fps: number
  schoolCount: number
}

export type CameraMode = 'free' | 'followSchool' | 'followIndividual' | 'predator' | 'cinematic'

export interface SelectedFishStats {
  id: number
  speed: number
  heading: [number, number, number]
  groundSpeed: number
  groundHeading: [number, number, number]
  neighborCount: number
  nearestPredatorDist: number
  threatLevel: number
  forageLevel: number
}

export interface VisualizationFlags {
  velocity: boolean
  separation: boolean
  alignment: boolean
  cohesion: boolean
  avoidance: boolean
  sensoryRange: boolean
  currentField: boolean
}

export const DEFAULT_VISUALIZATION: VisualizationFlags = {
  velocity: false,
  separation: false,
  alignment: false,
  cohesion: false,
  avoidance: false,
  sensoryRange: false,
  currentField: false,
}

interface SimStore {
  schooling: SchoolingParams
  environment: EnvironmentParams
  predators: PredatorParams
  food: FoodParams
  paused: boolean
  simSpeed: number
  resetToken: number
  stats: SimStats
  activeScenario: string
  cameraMode: CameraMode
  selectedFishIndex: number
  selectedFishStats: SelectedFishStats | null
  visualization: VisualizationFlags
  autoQuality: boolean
  qualityNotice: string | null
  setSchooling: (patch: Partial<SchoolingParams>) => void
  setEnvironment: (patch: Partial<EnvironmentParams>) => void
  setPredators: (patch: Partial<PredatorParams>) => void
  setPredatorSpeciesCount: (species: PredatorSpecies, count: number) => void
  setFood: (patch: Partial<FoodParams>) => void
  setPaused: (paused: boolean) => void
  setSimSpeed: (speed: number) => void
  reset: () => void
  restoreDefaults: () => void
  setStats: (stats: SimStats) => void
  applyScenario: (key: string) => void
  setCameraMode: (mode: CameraMode) => void
  setSelectedFishIndex: (index: number) => void
  setSelectedFishStats: (stats: SelectedFishStats | null) => void
  setVisualization: (patch: Partial<VisualizationFlags>) => void
  setAutoQuality: (enabled: boolean) => void
  setQualityNotice: (message: string | null) => void
}

export const useSimStore = create<SimStore>((set) => ({
  schooling: { ...DEFAULT_SCHOOLING },
  environment: { ...DEFAULT_ENVIRONMENT },
  predators: { ...DEFAULT_PREDATORS },
  food: { ...DEFAULT_FOOD },
  paused: false,
  simSpeed: 1,
  resetToken: 0,
  stats: { fishCount: 0, avgSpeed: 0, avgNeighborDistance: 0, polarization: 0, fps: 0, schoolCount: 0 },
  activeScenario: 'openOcean',
  cameraMode: 'free',
  selectedFishIndex: -1,
  selectedFishStats: null,
  visualization: { ...DEFAULT_VISUALIZATION },
  autoQuality: true,
  qualityNotice: null,
  setSchooling: (patch) =>
    set((s) => ({ schooling: { ...s.schooling, ...patch } })),
  setEnvironment: (patch) =>
    set((s) => ({ environment: { ...s.environment, ...patch } })),
  setPredators: (patch) =>
    set((s) => ({ predators: { ...s.predators, ...patch } })),
  setPredatorSpeciesCount: (species, count) =>
    set((s) => ({
      predators: {
        ...s.predators,
        speciesCounts: { ...s.predators.speciesCounts, [species]: count },
      },
    })),
  setFood: (patch) => set((s) => ({ food: { ...s.food, ...patch } })),
  setPaused: (paused) => set({ paused }),
  setSimSpeed: (simSpeed) => set({ simSpeed }),
  reset: () => set((s) => ({ resetToken: s.resetToken + 1 })),
  restoreDefaults: () =>
    set((s) => ({
      schooling: { ...DEFAULT_SCHOOLING },
      environment: { ...DEFAULT_ENVIRONMENT },
      predators: { ...DEFAULT_PREDATORS },
      food: { ...DEFAULT_FOOD },
      resetToken: s.resetToken + 1,
    })),
  setStats: (stats) => set({ stats }),
  applyScenario: (key) =>
    set((s) => {
      const scenario = SCENARIOS.find((sc) => sc.key === key)
      if (!scenario) return {}
      return {
        activeScenario: key,
        schooling: { ...DEFAULT_SCHOOLING, ...scenario.schooling },
        environment: { ...DEFAULT_ENVIRONMENT, ...scenario.environment },
        predators: { ...DEFAULT_PREDATORS, ...scenario.predators },
        food: { ...DEFAULT_FOOD, ...scenario.food },
        resetToken: s.resetToken + 1,
      }
    }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setSelectedFishIndex: (selectedFishIndex) => set({ selectedFishIndex }),
  setSelectedFishStats: (selectedFishStats) => set({ selectedFishStats }),
  setVisualization: (patch) =>
    set((s) => ({ visualization: { ...s.visualization, ...patch } })),
  setAutoQuality: (autoQuality) => set({ autoQuality }),
  setQualityNotice: (qualityNotice) => set({ qualityNotice }),
}))
