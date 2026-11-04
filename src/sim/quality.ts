// Population scaling is a performance target, not a guaranteed capacity —
// these tiers trade per-fish visual fidelity for frame budget as the school
// grows, rather than silently turning the simulation into flat particles.
export type QualityTier = 'low' | 'medium' | 'high' | 'extreme'

export function tierForPopulation(population: number): QualityTier {
  if (population <= 350) return 'low'
  if (population <= 1500) return 'medium'
  if (population <= 6000) return 'high'
  return 'extreme'
}

export interface QualitySettings {
  bodySegments: number
  shimmerEveryNFrames: number
  statsSampleSize: number
}

export const QUALITY_SETTINGS: Record<QualityTier, QualitySettings> = {
  low: { bodySegments: 8, shimmerEveryNFrames: 1, statsSampleSize: 200 },
  medium: { bodySegments: 8, shimmerEveryNFrames: 1, statsSampleSize: 200 },
  high: { bodySegments: 6, shimmerEveryNFrames: 2, statsSampleSize: 150 },
  extreme: { bodySegments: 5, shimmerEveryNFrames: 3, statsSampleSize: 100 },
}

// One tier down from the given population preset's tier, used by the
// auto-quality downgrade — never drops below the lowest preset.
export const POPULATION_STEP_DOWN: Record<number, number> = {
  10000: 5000,
  5000: 1000,
  1000: 250,
}
