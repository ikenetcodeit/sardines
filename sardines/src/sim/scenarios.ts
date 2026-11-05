import { defaultParams, type CameraMode, type OverlayParams, type SimParams } from './config.ts'

export type ScenarioId = 'open' | 'current' | 'feeding' | 'predator' | 'baitball' | 'run'

export interface SchoolSeed {
  /** Fraction of the population in this group. */
  share: number
  x: number
  y: number
  z: number
  /** Heading in degrees (0 = +Z). */
  heading: number
  /** Half-extents along heading, vertical, across (m). */
  length: number
  height: number
  width: number
}

export interface Scenario {
  id: ScenarioId
  letter: string
  name: string
  tagline: string
  description: string
  observe: string[]
  params: (p: SimParams) => void
  schools: SchoolSeed[]
  /** Predators arrive from far away rather than starting close. */
  predatorsFar: boolean
  habitatRadius: number
  camera: CameraMode
  overlays?: Partial<OverlayParams>
  /** Places a plankton patch in front of the first school. */
  foodAhead?: boolean
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'open',
    letter: 'A',
    name: 'Open Ocean',
    tagline: 'A large school travels through clear blue water',
    description:
      'Ordinary schooling with no predators. Each fish only attends to a handful of nearest schoolmates, yet the school travels, turns, stretches and compresses as one. Watch for spontaneous turning waves started by a few individuals.',
    observe: [
      'Turning waves that start at one edge and sweep across the school',
      'Constant reshuffling of positions inside the school',
      'Silver flashes as bands of fish roll and turn together',
      'A second group that may drift close and merge',
    ],
    params: (p) => {
      p.school.population = 2000
      p.env.visibility = 55
      p.env.currentStrength = 0.08
      p.env.currentVariability = 0.2
      p.env.plankton = 0
      p.env.oceanDepth = 200
      p.env.preferredDepth = 14
    },
    schools: [
      { share: 0.78, x: 0, y: -14, z: 0, heading: 20, length: 9, height: 3.5, width: 6 },
      { share: 0.22, x: -22, y: -18, z: 14, heading: 60, length: 4, height: 2, width: 3 },
    ],
    predatorsFar: true,
    habitatRadius: 70,
    camera: 'cinematic',
  },
  {
    id: 'current',
    letter: 'B',
    name: 'Ocean Current',
    tagline: 'Swimming through a shifting current field',
    description:
      'The water itself is moving. Fish steer relative to the water, so the direction they face is not the direction they travel over the seafloor. Rock pinnacles act as obstacles that can split a school.',
    observe: [
      'Fish pointing one way while drifting another (compare with the seafloor)',
      'The school being sheared and bent by eddies',
      'Schools splitting around rock pinnacles and reconnecting downstream',
      'Enable the current-vector overlay to see the flow field',
    ],
    params: (p) => {
      p.school.population = 1600
      p.env.visibility = 40
      p.env.currentStrength = 0.45
      p.env.currentDirection = 70
      p.env.currentVariability = 0.9
      p.env.plankton = 0
      p.env.oceanDepth = 30
      p.env.preferredDepth = 14
      p.obstacles = true
    },
    schools: [
      { share: 0.65, x: -10, y: -14, z: -6, heading: 250, length: 7, height: 3, width: 5 },
      { share: 0.35, x: 18, y: -12, z: 10, heading: 200, length: 5, height: 2.5, width: 3.5 },
    ],
    predatorsFar: true,
    habitatRadius: 60,
    camera: 'school',
    overlays: { currents: true },
  },
  {
    id: 'feeding',
    letter: 'C',
    name: 'Feeding Grounds',
    tagline: 'A school encounters a plankton-rich area',
    description:
      'Plankton patches drift with the current. Hungry fish detect nearby patches and move toward them; inside a patch they slow, spread out and lose their shared heading. Feeding is balanced against staying with the school.',
    observe: [
      'Spacing increasing and alignment loosening inside patches',
      'Fish leaving depleted patches and re-forming a polarized school',
      'No single point of convergence — the patch is explored, not targeted',
    ],
    params: (p) => {
      p.school.population = 1500
      p.env.visibility = 28
      p.env.plankton = 0.85
      p.env.currentStrength = 0.1
      p.env.oceanDepth = 120
      p.env.preferredDepth = 12
    },
    schools: [{ share: 1, x: -18, y: -12, z: -10, heading: 45, length: 7, height: 3, width: 5 }],
    predatorsFar: true,
    habitatRadius: 65,
    camera: 'school',
    foodAhead: true,
  },
  {
    id: 'predator',
    letter: 'D',
    name: 'Predator Encounter',
    tagline: 'A shark approaches an undisturbed school',
    description:
      'A single shark patrols and eventually approaches. Fish nearest the threat react first; their evasive movements are copied by neighbours so an escape wave ripples across the school. Distant fish may not react at all.',
    observe: [
      'The "fountain" effect — fish splitting to the sides and re-joining behind the predator',
      'Escape waves spreading from the fish that first detect the shark',
      'Temporary compression and fragmentation, then recovery',
    ],
    params: (p) => {
      p.school.population = 1800
      p.env.visibility = 40
      p.env.plankton = 0
      p.predators.species = 'shark'
      p.predators.count = 1
      p.predators.huntingIntensity = 0.55
    },
    schools: [{ share: 1, x: 0, y: -14, z: 0, heading: 0, length: 9, height: 3.5, width: 6 }],
    predatorsFar: true,
    habitatRadius: 70,
    camera: 'cinematic',
  },
  {
    id: 'baitball',
    letter: 'E',
    name: 'Bait Ball',
    tagline: 'Sustained pressure from a dolphin pod',
    description:
      'A pod of dolphins coordinates to encircle a school, mostly from the sides and below, driving it toward the surface. Under sustained, spatially constrained pressure the school may compress into a dense, pulsating bait ball — or it may break apart and escape.',
    observe: [
      'Increasing density and falling polarization (see statistics)',
      'Irregular, pulsating surface with gaps and compression waves',
      'Escape attempts and fragments re-joining the ball',
      'Dolphins taking turns to strike through the aggregation',
    ],
    params: (p) => {
      p.school.population = 1500
      p.env.visibility = 40
      p.env.plankton = 0
      p.env.preferredDepth = 9
      p.predators.species = 'dolphin'
      p.predators.count = 5
      p.predators.huntingIntensity = 0.8
      p.predators.detectionRange = 50
    },
    schools: [{ share: 1, x: 0, y: -9, z: 0, heading: 0, length: 6, height: 3, width: 5 }],
    predatorsFar: false,
    habitatRadius: 60,
    camera: 'cinematic',
  },
  {
    id: 'run',
    letter: 'F',
    name: 'Sardine Run',
    tagline: 'A documentary-style migration off southern Africa',
    description:
      'Inspired by the winter "Sardine Run" along South Africa’s east coast — an exceptional seasonal event, not everyday sardine behaviour. Long aggregations travel north-east in cool coastal water against the offshore current, attracting dolphins, sharks and diving gannets.',
    observe: [
      'Elongated travelling aggregations, some fish carrying a migratory heading',
      'Mixed predators: herding dolphins, charging sharks, plunging gannets',
      'Bait balls forming and dissolving as pressure comes and goes',
    ],
    params: (p) => {
      p.school.population = 3500
      p.env.visibility = 28
      p.env.currentStrength = 0.3
      p.env.currentDirection = 225
      p.env.currentVariability = 0.5
      p.env.plankton = 0.3
      p.env.oceanDepth = 60
      p.env.preferredDepth = 10
      p.predators.species = 'mixed'
      p.predators.count = 7
      p.predators.huntingIntensity = 0.55
      p.predators.detectionRange = 45
      p.migration.fraction = 0.3
      p.migration.heading = 45
    },
    schools: [
      { share: 0.45, x: -10, y: -10, z: -10, heading: 45, length: 14, height: 3, width: 4 },
      { share: 0.35, x: -30, y: -12, z: 8, heading: 50, length: 11, height: 3, width: 3.5 },
      { share: 0.2, x: 12, y: -8, z: -30, heading: 40, length: 7, height: 2.5, width: 3 },
    ],
    predatorsFar: true,
    habitatRadius: 95,
    camera: 'cinematic',
  },
]

export function getScenario(id: ScenarioId): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
}

export function scenarioParams(id: ScenarioId): SimParams {
  const p = defaultParams()
  getScenario(id).params(p)
  return p
}
