import { useControls, button, folder } from 'leva'
import { POPULATION_PRESETS } from '../sim/config'
import { useSimStore } from '../store/useSimStore'

export function ControlPanel() {
  const schooling = useSimStore((s) => s.schooling)
  const environment = useSimStore((s) => s.environment)
  const predators = useSimStore((s) => s.predators)
  const food = useSimStore((s) => s.food)
  const setSchooling = useSimStore((s) => s.setSchooling)
  const setEnvironment = useSimStore((s) => s.setEnvironment)
  const setPredators = useSimStore((s) => s.setPredators)
  const setPredatorSpeciesCount = useSimStore((s) => s.setPredatorSpeciesCount)
  const setFood = useSimStore((s) => s.setFood)
  const setPaused = useSimStore((s) => s.setPaused)
  const setSimSpeed = useSimStore((s) => s.setSimSpeed)
  const reset = useSimStore((s) => s.reset)
  const restoreDefaults = useSimStore((s) => s.restoreDefaults)
  const setCameraMode = useSimStore((s) => s.setCameraMode)
  const setSelectedFishIndex = useSimStore((s) => s.setSelectedFishIndex)
  const autoQuality = useSimStore((s) => s.autoQuality)
  const setAutoQuality = useSimStore((s) => s.setAutoQuality)
  const visualization = useSimStore((s) => s.visualization)
  const setVisualization = useSimStore((s) => s.setVisualization)

  useControls(
    () => ({
      Schooling: folder({
        population: {
          value: schooling.population,
          options: POPULATION_PRESETS,
          onChange: (v) => setSchooling({ population: v }),
        },
        cruiseSpeed: {
          value: schooling.cruiseSpeed,
          min: 0.2,
          max: 6,
          step: 0.1,
          onChange: (v) => setSchooling({ cruiseSpeed: v }),
        },
        burstSpeed: {
          value: schooling.burstSpeed,
          min: 1,
          max: 12,
          step: 0.1,
          onChange: (v) => setSchooling({ burstSpeed: v }),
        },
        separationStrength: {
          value: schooling.separationStrength,
          min: 0,
          max: 4,
          step: 0.05,
          onChange: (v) => setSchooling({ separationStrength: v }),
        },
        alignmentStrength: {
          value: schooling.alignmentStrength,
          min: 0,
          max: 4,
          step: 0.05,
          onChange: (v) => setSchooling({ alignmentStrength: v }),
        },
        cohesionStrength: {
          value: schooling.cohesionStrength,
          min: 0,
          max: 4,
          step: 0.05,
          onChange: (v) => setSchooling({ cohesionStrength: v }),
        },
        perceptionRadius: {
          value: schooling.perceptionRadius,
          min: 0.5,
          max: 10,
          step: 0.1,
          onChange: (v) => setSchooling({ perceptionRadius: v }),
        },
        separationRadius: {
          value: schooling.separationRadius,
          min: 0.2,
          max: 4,
          step: 0.05,
          onChange: (v) => setSchooling({ separationRadius: v }),
        },
        maxNeighbors: {
          value: schooling.maxNeighbors,
          min: 2,
          max: 40,
          step: 1,
          onChange: (v) => setSchooling({ maxNeighbors: v }),
        },
        turnRate: {
          value: schooling.turnRate,
          min: 0.2,
          max: 10,
          step: 0.1,
          onChange: (v) => setSchooling({ turnRate: v }),
        },
        individualVariation: {
          value: schooling.individualVariation,
          min: 0,
          max: 1,
          step: 0.01,
          onChange: (v) => setSchooling({ individualVariation: v }),
        },
        fieldOfView: {
          value: schooling.fieldOfView,
          label: 'Field of View (°)',
          min: 60,
          max: 360,
          step: 5,
          onChange: (v) => setSchooling({ fieldOfView: v }),
        },
      }),
      Environment: folder({
        boundsRadius: {
          value: environment.boundsRadius,
          min: 5,
          max: 80,
          step: 1,
          onChange: (v) => setEnvironment({ boundsRadius: v }),
        },
        currentStrength: {
          value: environment.currentStrength,
          min: 0,
          max: 2,
          step: 0.01,
          onChange: (v) => setEnvironment({ currentStrength: v }),
        },
      }),
      Predators: folder({
        enabled: { value: predators.enabled, onChange: (v) => setPredators({ enabled: v }) },
        mixedSpecies: {
          value: predators.mixedSpecies,
          label: 'Mixed Species Hunt',
          onChange: (v) => setPredators({ mixedSpecies: v }),
        },
        species: {
          value: predators.species,
          label: 'Species (single)',
          options: ['shark', 'dolphin', 'sailfish', 'seabird'],
          onChange: (v) => setPredators({ species: v }),
        },
        count: {
          value: predators.count,
          label: 'Count (single)',
          min: 1,
          max: 8,
          step: 1,
          onChange: (v) => setPredators({ count: v }),
        },
        sharkCount: {
          value: predators.speciesCounts.shark,
          min: 0,
          max: 6,
          step: 1,
          onChange: (v) => setPredatorSpeciesCount('shark', v),
        },
        dolphinCount: {
          value: predators.speciesCounts.dolphin,
          min: 0,
          max: 6,
          step: 1,
          onChange: (v) => setPredatorSpeciesCount('dolphin', v),
        },
        sailfishCount: {
          value: predators.speciesCounts.sailfish,
          min: 0,
          max: 6,
          step: 1,
          onChange: (v) => setPredatorSpeciesCount('sailfish', v),
        },
        seabirdCount: {
          value: predators.speciesCounts.seabird,
          min: 0,
          max: 6,
          step: 1,
          onChange: (v) => setPredatorSpeciesCount('seabird', v),
        },
        detectionRange: {
          value: predators.detectionRange,
          min: 2,
          max: 20,
          step: 0.5,
          onChange: (v) => setPredators({ detectionRange: v }),
        },
        huntingIntensity: {
          value: predators.huntingIntensity,
          min: 0,
          max: 1,
          step: 0.05,
          onChange: (v) => setPredators({ huntingIntensity: v }),
        },
        captureEnabled: {
          value: predators.captureEnabled,
          label: 'Capture (lethal)',
          onChange: (v) => setPredators({ captureEnabled: v }),
        },
      }),
      Food: folder({
        enabled: { value: food.enabled, onChange: (v) => setFood({ enabled: v }) },
        patchCount: {
          value: food.patchCount,
          min: 1,
          max: 4,
          step: 1,
          onChange: (v) => setFood({ patchCount: v }),
        },
        patchRadius: {
          value: food.patchRadius,
          min: 2,
          max: 14,
          step: 0.5,
          onChange: (v) => setFood({ patchRadius: v }),
        },
        concentration: {
          value: food.concentration,
          min: 0,
          max: 1,
          step: 0.05,
          onChange: (v) => setFood({ concentration: v }),
        },
      }),
      Camera: folder({
        mode: {
          value: 'free',
          options: {
            'Free Exploration': 'free',
            'Follow School': 'followSchool',
            'Follow Individual': 'followIndividual',
            'Predator Perspective': 'predator',
            'Cinematic Documentary': 'cinematic',
          },
          onChange: (v) => setCameraMode(v),
        },
        followedFishId: {
          value: 0,
          min: 0,
          max: 9999,
          step: 1,
          onChange: (v) => setSelectedFishIndex(v),
        },
      }),
      Simulation: folder({
        paused: { value: false, onChange: (v) => setPaused(v) },
        simSpeed: {
          value: 1,
          min: 0,
          max: 3,
          step: 0.1,
          onChange: (v) => setSimSpeed(v),
        },
        Reset: button(() => reset()),
        'Restore Defaults': button(() => restoreDefaults()),
      }),
      Visualization: folder({
        velocity: { value: visualization.velocity, onChange: (v) => setVisualization({ velocity: v }) },
        separation: { value: visualization.separation, onChange: (v) => setVisualization({ separation: v }) },
        alignment: { value: visualization.alignment, onChange: (v) => setVisualization({ alignment: v }) },
        cohesion: { value: visualization.cohesion, onChange: (v) => setVisualization({ cohesion: v }) },
        avoidance: { value: visualization.avoidance, onChange: (v) => setVisualization({ avoidance: v }) },
        sensoryRange: {
          value: visualization.sensoryRange,
          label: 'Sensory Range',
          onChange: (v) => setVisualization({ sensoryRange: v }),
        },
        currentField: {
          value: visualization.currentField,
          label: 'Current Field',
          onChange: (v) => setVisualization({ currentField: v }),
        },
      }),
      Quality: folder({
        autoQuality: {
          value: autoQuality,
          label: 'Auto-reduce on low FPS',
          onChange: (v) => setAutoQuality(v),
        },
      }),
    }),
    // Only (re)built once; live edits flow one-way store -> sim via useSimStore,
    // so leva doesn't need to re-subscribe to store changes it itself caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return null
}
