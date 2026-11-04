import type { SardineSimulation } from './SardineSimulation'
import { rotateToward } from './steering'
import {
  PREDATOR_PROFILES,
  PREDATOR_SPECIES_LIST,
  type EnvironmentParams,
  type PredatorParams,
  type PredatorSpecies,
} from './config'

function buildSpeciesRoster(params: PredatorParams): PredatorSpecies[] {
  if (!params.enabled) return []
  if (!params.mixedSpecies) {
    return Array.from({ length: params.count }, () => params.species)
  }
  const roster: PredatorSpecies[] = []
  for (const species of PREDATOR_SPECIES_LIST) {
    const n = params.speciesCounts[species] ?? 0
    for (let i = 0; i < n; i++) roster.push(species)
  }
  return roster
}

export function totalPredatorCount(params: PredatorParams): number {
  if (!params.enabled) return 0
  return params.mixedSpecies
    ? PREDATOR_SPECIES_LIST.reduce((sum, s) => sum + (params.speciesCounts[s] ?? 0), 0)
    : params.count
}

// Seabird dive state machine. Unlike the swimming predators, a seabird
// doesn't sustain an underwater chase — it patrols above the surface,
// commits to one fast dive on an accessible near-surface target, and climbs
// back out whether or not the strike connects.
const enum DiveState {
  Patrol = 0,
  Diving = 1,
  Rising = 2,
}

/**
 * Small population of independent predator agents — potentially a mix of
 * species, each with its own speed/turn/capture profile. Every predator
 * senses nearby sardines through the prey simulation's own spatial grid (so
 * it has no privileged global knowledge either) and pursues the nearest one
 * it can find, breaking off and wandering when it loses contact. Species
 * never share behavior parameters; a shark and a sailfish in the same
 * system genuinely move differently — and seabirds don't swim at all.
 */
export class PredatorSystem {
  readonly count: number
  posX: Float32Array
  posY: Float32Array
  posZ: Float32Array
  velX: Float32Array
  velY: Float32Array
  velZ: Float32Array
  species: PredatorSpecies[]
  private wanderPhase: Float32Array
  private detectionRange: Float32Array
  private diveState: Uint8Array
  private diveTarget: Int32Array

  params: PredatorParams
  private env: EnvironmentParams

  constructor(params: PredatorParams, env: EnvironmentParams) {
    this.params = params
    this.env = env
    this.species = buildSpeciesRoster(params)
    this.count = this.species.length

    const n = this.count
    this.posX = new Float32Array(n)
    this.posY = new Float32Array(n)
    this.posZ = new Float32Array(n)
    this.velX = new Float32Array(n)
    this.velY = new Float32Array(n)
    this.velZ = new Float32Array(n)
    this.wanderPhase = new Float32Array(n)
    this.detectionRange = new Float32Array(n)
    this.diveState = new Uint8Array(n)
    this.diveTarget = new Int32Array(n).fill(-1)

    for (let i = 0; i < n; i++) {
      const profile = PREDATOR_PROFILES[this.species[i]]
      const theta = Math.random() * Math.PI * 2
      const r = env.boundsRadius * (0.5 + Math.random() * 0.5)
      this.posX[i] = env.boundsCenter[0] + Math.cos(theta) * r
      this.posZ[i] = env.boundsCenter[2] + Math.sin(theta) * r
      this.posY[i] =
        this.species[i] === 'seabird'
          ? this.cruiseAltitude()
          : env.boundsCenter[1] + (Math.random() - 0.5) * 10
      this.velX[i] = profile.baseSpeed
      this.velY[i] = 0
      this.velZ[i] = 0
      this.wanderPhase[i] = Math.random() * Math.PI * 2
      this.detectionRange[i] = params.detectionRange * (1 + params.huntingIntensity)
    }
  }

  getDetectionRanges(): Float32Array {
    return this.detectionRange
  }

  private cruiseAltitude(): number {
    return this.env.boundsCenter[1] + this.env.boundsRadius * 1.1
  }

  private nearSurfaceY(): number {
    return this.env.boundsCenter[1] + this.env.boundsRadius * 0.45
  }

  update(dt: number, prey: SardineSimulation) {
    const intensity = this.params.huntingIntensity

    for (let i = 0; i < this.count; i++) {
      if (this.species[i] === 'seabird') {
        this.updateSeabird(i, dt, prey, intensity)
      } else {
        this.updateSwimmer(i, dt, prey, intensity)
      }

      // Keep predators broadly within the same ocean volume as the school.
      // Horizontal and vertical containment are handled separately since a
      // seabird's vertical range (cruise altitude down to the surface) looks
      // nothing like a swimmer's.
      const bx = this.posX[i] - this.env.boundsCenter[0]
      const by = this.posY[i] - this.env.boundsCenter[1]
      const bz = this.posZ[i] - this.env.boundsCenter[2]
      const horizDist = Math.sqrt(bx * bx + bz * bz) || 0.001
      const horizLimit = this.env.boundsRadius * 1.3
      if (horizDist > horizLimit) {
        const pull = (horizDist - horizLimit) * 0.1
        this.velX[i] -= (bx / horizDist) * pull
        this.velZ[i] -= (bz / horizDist) * pull
      }
      const verticalLimit =
        this.species[i] === 'seabird' ? this.env.boundsRadius * 1.6 : this.env.boundsRadius * 0.8
      if (Math.abs(by) > verticalLimit) {
        this.velY[i] -= Math.sign(by) * (Math.abs(by) - verticalLimit) * 0.1
      }
    }
  }

  private updateSwimmer(i: number, dt: number, prey: SardineSimulation, intensity: number) {
    const profile = PREDATOR_PROFILES[this.species[i]]
    const maxSpeed = profile.baseSpeed + (profile.burstSpeed - profile.baseSpeed) * intensity

    const x = this.posX[i]
    const y = this.posY[i]
    const z = this.posZ[i]
    const curSpeed = Math.sqrt(this.velX[i] ** 2 + this.velY[i] ** 2 + this.velZ[i] ** 2) || 0.001
    const curDirX = this.velX[i] / curSpeed
    const curDirY = this.velY[i] / curSpeed
    const curDirZ = this.velZ[i] / curSpeed

    const target = prey.findNearestSardine(x, y, z)
    let desDirX: number, desDirY: number, desDirZ: number
    let speed = profile.baseSpeed

    if (target && target.dist < this.detectionRange[i] * 2.5) {
      const tx = prey.posX[target.index]
      const ty = prey.posY[target.index]
      const tz = prey.posZ[target.index]
      const dx = tx - x, dy = ty - y, dz = tz - z
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      desDirX = dx / len
      desDirY = dy / len
      desDirZ = dz / len
      const closeness = 1 - Math.min(1, target.dist / (this.detectionRange[i] * 2.5))
      speed = profile.baseSpeed + (maxSpeed - profile.baseSpeed) * closeness

      if (this.params.captureEnabled && target.dist < profile.captureRadius) {
        if (Math.random() < profile.captureChance * (0.5 + intensity * 0.5)) {
          prey.capture(target.index)
        }
      }
    } else {
      // No prey in range: wander gently rather than homing on anything global.
      this.wanderPhase[i] += dt * 0.5
      desDirX = curDirX + Math.sin(this.wanderPhase[i]) * 0.4
      desDirY = curDirY + Math.sin(this.wanderPhase[i] * 1.3) * 0.15
      desDirZ = curDirZ + Math.cos(this.wanderPhase[i] * 0.7) * 0.4
      const len = Math.sqrt(desDirX ** 2 + desDirY ** 2 + desDirZ ** 2) || 1
      desDirX /= len; desDirY /= len; desDirZ /= len
    }

    const [nx, ny, nz] = rotateToward(
      curDirX, curDirY, curDirZ,
      desDirX, desDirY, desDirZ,
      profile.turnRate * dt,
    )

    this.velX[i] = nx * speed
    this.velY[i] = ny * speed
    this.velZ[i] = nz * speed
    this.posX[i] += this.velX[i] * dt
    this.posY[i] += this.velY[i] * dt
    this.posZ[i] += this.velZ[i] * dt
  }

  private updateSeabird(i: number, dt: number, prey: SardineSimulation, intensity: number) {
    const profile = PREDATOR_PROFILES.seabird
    const x = this.posX[i], y = this.posY[i], z = this.posZ[i]
    const curSpeed = Math.sqrt(this.velX[i] ** 2 + this.velY[i] ** 2 + this.velZ[i] ** 2) || 0.001
    const curDirX = this.velX[i] / curSpeed
    const curDirY = this.velY[i] / curSpeed
    const curDirZ = this.velZ[i] / curSpeed

    let desDirX: number, desDirY: number, desDirZ: number
    let speed = profile.baseSpeed

    if (this.diveState[i] === DiveState.Patrol) {
      // Scan for an accessible target by querying the prey grid at this
      // bird's horizontal position but at the near-surface depth it can
      // actually reach — not its own cruise altitude, which is empty sky.
      const searchY = this.nearSurfaceY()
      const target = prey.findNearestSardine(x, searchY, z)
      const horizDx = target ? prey.posX[target.index] - x : 0
      const horizDz = target ? prey.posZ[target.index] - z : 0
      const horizDist = Math.sqrt(horizDx * horizDx + horizDz * horizDz)

      if (
        target &&
        horizDist < this.detectionRange[i] * 2 &&
        prey.posY[target.index] > this.env.boundsCenter[1] - this.env.boundsRadius * 0.1
      ) {
        this.diveState[i] = DiveState.Diving
        this.diveTarget[i] = target.index
        desDirX = curDirX; desDirY = curDirY; desDirZ = curDirZ
      } else {
        // Patrol: stay level at cruise altitude, drift gently over the water.
        this.wanderPhase[i] += dt * 0.3
        desDirX = Math.sin(this.wanderPhase[i])
        desDirZ = Math.cos(this.wanderPhase[i] * 0.8)
        const altitudeError = this.cruiseAltitude() - y
        desDirY = clamp(altitudeError * 0.1, -0.3, 0.3)
        const len = Math.sqrt(desDirX * desDirX + desDirY * desDirY + desDirZ * desDirZ) || 1
        desDirX /= len; desDirY /= len; desDirZ /= len
        speed = profile.baseSpeed
      }
    } else if (this.diveState[i] === DiveState.Diving) {
      const targetIndex = this.diveTarget[i]
      const targetValid = targetIndex >= 0 && prey.alive[targetIndex]
      if (!targetValid) {
        this.diveState[i] = DiveState.Rising
        desDirX = curDirX; desDirY = 1; desDirZ = curDirZ
        speed = profile.baseSpeed
      } else {
        const tx = prey.posX[targetIndex], ty = prey.posY[targetIndex], tz = prey.posZ[targetIndex]
        const dx = tx - x, dy = ty - y, dz = tz - z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
        desDirX = dx / dist; desDirY = dy / dist; desDirZ = dz / dist
        speed = profile.baseSpeed + (profile.burstSpeed - profile.baseSpeed) * (0.6 + intensity * 0.4)

        if (dist < profile.captureRadius) {
          if (this.params.captureEnabled && Math.random() < profile.captureChance) {
            prey.capture(targetIndex)
          }
          // Strike is brief either way — a seabird doesn't linger underwater.
          this.diveState[i] = DiveState.Rising
          this.diveTarget[i] = -1
        } else if (y < this.env.boundsCenter[1] - this.env.boundsRadius * 0.05) {
          // Hit the self-imposed "can't submerge" floor without connecting.
          this.diveState[i] = DiveState.Rising
          this.diveTarget[i] = -1
        }
      }
    } else {
      // Rising: climb back toward cruise altitude, ignoring prey entirely —
      // the strike is already over.
      desDirX = curDirX * 0.3
      desDirZ = curDirZ * 0.3
      desDirY = 1
      const len = Math.sqrt(desDirX * desDirX + desDirY * desDirY + desDirZ * desDirZ) || 1
      desDirX /= len; desDirY /= len; desDirZ /= len
      speed = profile.baseSpeed * 1.1
      if (y > this.cruiseAltitude() - 1) {
        this.diveState[i] = DiveState.Patrol
      }
    }

    const [nx, ny, nz] = rotateToward(
      curDirX, curDirY, curDirZ,
      desDirX, desDirY, desDirZ,
      profile.turnRate * dt,
    )

    this.velX[i] = nx * speed
    this.velY[i] = ny * speed
    this.velZ[i] = nz * speed
    this.posX[i] += this.velX[i] * dt
    this.posY[i] += this.velY[i] * dt
    this.posZ[i] += this.velZ[i] * dt
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
