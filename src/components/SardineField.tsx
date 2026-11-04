import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SardineSimulation } from '../sim/SardineSimulation'
import { PredatorSystem, totalPredatorCount } from '../sim/PredatorSystem'
import { useSimStore } from '../store/useSimStore'
import { createBodyGeometry, createTailGeometry } from './fishGeometry'
import { PREDATOR_PROFILES } from '../sim/config'
import { simRefs } from '../sim/sharedRefs'
import { QUALITY_SETTINGS, tierForPopulation, POPULATION_STEP_DOWN } from '../sim/quality'

const tailGeometry = createTailGeometry()
const predatorGeometry = createBodyGeometry()
// One lathe per distinct segment count, built once and reused across tiers
// that share it, so switching population presets never recompiles geometry
// more than necessary.
const bodyGeometryCache = new Map<number, THREE.BufferGeometry>()
function getBodyGeometry(segments: number): THREE.BufferGeometry {
  let geo = bodyGeometryCache.get(segments)
  if (!geo) {
    geo = createBodyGeometry(segments)
    bodyGeometryCache.set(segments, geo)
  }
  return geo
}

const MAX_FOOD_PATCHES = 4
const FOOD_PARTICLES_PER_PATCH = 40
const FOOD_PARTICLE_CAPACITY = MAX_FOOD_PATCHES * FOOD_PARTICLES_PER_PATCH

export function SardineField() {
  const schooling = useSimStore((s) => s.schooling)
  const environment = useSimStore((s) => s.environment)
  const predatorParams = useSimStore((s) => s.predators)
  const foodParams = useSimStore((s) => s.food)
  const paused = useSimStore((s) => s.paused)
  const simSpeed = useSimStore((s) => s.simSpeed)
  const resetToken = useSimStore((s) => s.resetToken)
  const setStats = useSimStore((s) => s.setStats)
  const autoQuality = useSimStore((s) => s.autoQuality)
  const setQualityNotice = useSimStore((s) => s.setQualityNotice)
  const setSchooling = useSimStore((s) => s.setSchooling)
  const setSelectedFishIndex = useSimStore((s) => s.setSelectedFishIndex)
  const selectedFishIndex = useSimStore((s) => s.selectedFishIndex)
  const setSelectedFishStats = useSimStore((s) => s.setSelectedFishStats)

  const qualityTier = tierForPopulation(schooling.population)
  const quality = QUALITY_SETTINGS[qualityTier]
  const bodyGeometry = useMemo(() => getBodyGeometry(quality.bodySegments), [quality.bodySegments])
  const frameCounter = useRef(0)
  const downgradeCooldown = useRef(0)

  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const tailRef = useRef<THREE.InstancedMesh>(null)
  const predatorRef = useRef<THREE.InstancedMesh>(null)
  const foodParticlesRef = useRef<THREE.Points>(null)
  const foodGlowRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null])

  const foodParticleGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(FOOD_PARTICLE_CAPACITY * 3), 3),
    )
    return geo
  }, [])

  // Precomputed per-particle offsets within a unit sphere, reused forever —
  // only the live patch center/radius moves them, not their relative scatter.
  const foodParticleOffsets = useMemo(() => {
    const offsets: { dx: number; dy: number; dz: number; frac: number; phase: number }[] = []
    for (let i = 0; i < FOOD_PARTICLE_CAPACITY; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 2 - 1)
      offsets.push({
        dx: Math.sin(phi) * Math.cos(theta),
        dy: Math.sin(phi) * Math.sin(theta),
        dz: Math.cos(phi),
        frac: Math.cbrt(Math.random()),
        phase: Math.random() * Math.PI * 2,
      })
    }
    return offsets
  }, [])

  const sim = useMemo(
    () => new SardineSimulation(schooling, environment, foodParams),
    // Population size and reset changes require a fresh typed-array engine;
    // live parameter tweaks are pushed through sim.params/env below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schooling.population, resetToken],
  )

  const predatorCount = totalPredatorCount(predatorParams)
  const predators = useMemo(
    () => new PredatorSystem(predatorParams, environment),
    // Predator count/species/mix/enabled toggles need a fresh typed-array engine too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      predatorCount,
      predatorParams.species,
      predatorParams.mixedSpecies,
      predatorParams.speciesCounts.shark,
      predatorParams.speciesCounts.dolphin,
      predatorParams.speciesCounts.sailfish,
      predatorParams.speciesCounts.seabird,
      resetToken,
    ],
  )

  useEffect(() => {
    sim.params = schooling
    sim.env = environment
  }, [sim, schooling, environment])

  useEffect(() => {
    sim.food = foodParams
  }, [sim, foodParams])

  useEffect(() => {
    sim.seedFoodPatches(foodParams)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, foodParams.enabled, foodParams.patchCount, foodParams.patchRadius])

  useEffect(() => {
    predators.params = predatorParams
  }, [predators, predatorParams])

  useEffect(() => {
    simRefs.sim = sim
    simRefs.predators = predators
    return () => {
      if (simRefs.sim === sim) simRefs.sim = null
      if (simRefs.predators === predators) simRefs.predators = null
    }
  }, [sim, predators])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const lookTarget = useMemo(() => new THREE.Vector3(), [])

  // Tail-beat scratch: a second dummy pivoted at the body's tail-attach
  // point, plus the small counter-sway applied to the body itself so the
  // oscillation amplitude diminishes toward the head, the way real fish
  // locomotion looks, instead of the whole rigid body wagging equally.
  const tailDummy = useMemo(() => new THREE.Object3D(), [])
  const tailForward = useMemo(() => new THREE.Vector3(), [])
  const tailAttach = useMemo(() => new THREE.Vector3(), [])
  const yawQuat = useMemo(() => new THREE.Quaternion(), [])
  const bodySwayQuat = useMemo(() => new THREE.Quaternion(), [])
  const UNIT_Y = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const statsAccum = useRef(0)
  const schoolCountAccum = useRef(0)
  const lastSchoolCount = useRef(1)
  const inspectorAccum = useRef(0)
  const { camera } = useThree()

  // Shimmer scratch objects, reused every fish every frame to avoid allocation.
  const flank = useMemo(() => new THREE.Vector3(), [])
  const viewDir = useMemo(() => new THREE.Vector3(), [])
  const halfVec = useMemo(() => new THREE.Vector3(), [])
  const shimmerColor = useMemo(() => new THREE.Color(), [])
  // Close to white so it barely tints the body's countershaded vertex colors
  // at rest, while still leaving room for the shimmer lerp toward pure white
  // flashes to read as a visible brightening rather than a no-op.
  const baseColor = useMemo(() => new THREE.Color('#d6dde0'), [])
  const predatorColor = useMemo(() => new THREE.Color(), [])
  const flashColor = useMemo(() => new THREE.Color('#ffffff'), [])
  const lightDir = useMemo(() => new THREE.Vector3(15, 40, 10).normalize(), [])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const elapsed = state.clock.elapsedTime
    if (!paused) {
      // Predators react to where sardines were as of the previous tick's
      // grid, then push their new positions in before sardines step and
      // flee — a one-frame lag that is imperceptible at 60fps and keeps
      // both systems fully decoupled (neither owns the other's state).
      if (predators.count > 0) {
        predators.update(delta * simSpeed, sim)
        sim.setPredators(
          predators.posX, predators.posY, predators.posZ,
          predators.getDetectionRanges(), predators.count,
        )
      } else {
        sim.setPredators([], [], [], [], 0)
      }
      sim.update(delta * simSpeed)
    }

    const body = bodyRef.current
    const tail = tailRef.current
    if (!body || !tail) return

    let cx = 0, cy = 0, cz = 0
    const aliveCount = sim.getAliveCount()
    frameCounter.current++
    const doShimmer = frameCounter.current % quality.shimmerEveryNFrames === 0
    for (let i = 0; i < sim.count; i++) {
      if (!sim.alive[i]) {
        // Captured: hide the instance rather than reindexing the typed
        // arrays, so every other fish keeps its stable index.
        dummy.position.set(0, 0, 0)
        dummy.scale.set(0, 0, 0)
        dummy.updateMatrix()
        body.setMatrixAt(i, dummy.matrix)
        tail.setMatrixAt(i, dummy.matrix)
        continue
      }
      dummy.position.set(sim.posX[i], sim.posY[i], sim.posZ[i])
      lookTarget.set(
        sim.posX[i] + sim.velX[i],
        sim.posY[i] + sim.velY[i],
        sim.posZ[i] + sim.velZ[i],
      )
      dummy.up.set(0, 1, 0)
      dummy.lookAt(lookTarget)
      const scale = sim.size[i]

      // Tail beat: amplitude grows with speed and fear (a fleeing fish
      // thrashes harder, not just faster), frequency comes straight from
      // the simulation's own per-fish tailPhase so it's already tied to
      // that fish's actual swimming speed, not a cosmetic loop.
      const speed = Math.sqrt(sim.velX[i] ** 2 + sim.velY[i] ** 2 + sim.velZ[i] ** 2)
      const tailAmplitude = THREE.MathUtils.clamp(0.12 + speed * 0.07 + sim.fear[i] * 0.3, 0.08, 0.9)
      const swingAngle = Math.sin(sim.tailPhase[i]) * tailAmplitude

      // The body itself sways a little, out of phase and much smaller than
      // the tail — amplitude diminishing toward the head rather than the
      // whole rigid body wagging as one piece.
      bodySwayQuat.setFromAxisAngle(UNIT_Y, swingAngle * -0.12)
      dummy.quaternion.multiply(bodySwayQuat)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      body.setMatrixAt(i, dummy.matrix)

      tailForward.set(0, 0, 1).applyQuaternion(dummy.quaternion)
      tailAttach.copy(dummy.position).addScaledVector(tailForward, 0.5 * scale)
      tailDummy.position.copy(tailAttach)
      yawQuat.setFromAxisAngle(UNIT_Y, swingAngle)
      tailDummy.quaternion.copy(dummy.quaternion).multiply(yawQuat)
      tailDummy.scale.set(scale, scale, scale)
      tailDummy.updateMatrix()
      tail.setMatrixAt(i, tailDummy.matrix)

      // Reflective-scale shimmer: a flash band that depends on the fish's
      // own flank orientation relative to both the sun and the viewer, so it
      // travels across the school as fish turn rather than blinking randomly.
      // At higher populations this is recomputed every 2nd/3rd frame instead
      // of every frame — the flash band moves slowly enough that this is
      // imperceptible, and it roughly halves/thirds the per-fish cost.
      if (doShimmer) {
        flank.set(1, 0, 0).applyQuaternion(dummy.quaternion)
        viewDir.set(
          camera.position.x - sim.posX[i],
          camera.position.y - sim.posY[i],
          camera.position.z - sim.posZ[i],
        ).normalize()
        halfVec.copy(lightDir).add(viewDir).normalize()
        const flash = Math.pow(Math.max(0, Math.abs(flank.dot(halfVec))), 5)
        shimmerColor.copy(baseColor).lerp(flashColor, flash * 0.85)
        body.setColorAt(i, shimmerColor)
      }

      cx += sim.posX[i]
      cy += sim.posY[i]
      cz += sim.posZ[i]
    }
    body.instanceMatrix.needsUpdate = true
    tail.instanceMatrix.needsUpdate = true
    if (doShimmer && body.instanceColor) body.instanceColor.needsUpdate = true
    if (aliveCount > 0) {
      simRefs.centroidX = cx / aliveCount
      simRefs.centroidY = cy / aliveCount
      simRefs.centroidZ = cz / aliveCount
    }

    const predatorMesh = predatorRef.current
    if (predatorMesh && predators.count > 0) {
      for (let i = 0; i < predators.count; i++) {
        const profile = PREDATOR_PROFILES[predators.species[i]]
        dummy.position.set(predators.posX[i], predators.posY[i], predators.posZ[i])
        lookTarget.set(
          predators.posX[i] + predators.velX[i],
          predators.posY[i] + predators.velY[i],
          predators.posZ[i] + predators.velZ[i],
        )
        dummy.up.set(0, 1, 0)
        dummy.lookAt(lookTarget)
        dummy.scale.setScalar(profile.size)
        dummy.updateMatrix()
        predatorMesh.setMatrixAt(i, dummy.matrix)
        predatorColor.set(profile.color)
        predatorMesh.setColorAt(i, predatorColor)
      }
      predatorMesh.instanceMatrix.needsUpdate = true
      if (predatorMesh.instanceColor) predatorMesh.instanceColor.needsUpdate = true
    }

    const particles = foodParticlesRef.current
    if (particles) {
      const posAttr = particles.geometry.getAttribute('position') as THREE.BufferAttribute
      const arr = posAttr.array as Float32Array
      for (let k = 0; k < sim.foodCount; k++) {
        const fx = sim.foodX[k], fy = sim.foodY[k], fz = sim.foodZ[k], fr = sim.foodRadius[k]
        for (let p = 0; p < FOOD_PARTICLES_PER_PATCH; p++) {
          const idx = k * FOOD_PARTICLES_PER_PATCH + p
          const off = foodParticleOffsets[idx]
          const bob = 1 + Math.sin(elapsed * 0.6 + off.phase) * 0.15
          const rad = off.frac * fr * bob
          arr[idx * 3 + 0] = fx + off.dx * rad
          arr[idx * 3 + 1] = fy + off.dy * rad
          arr[idx * 3 + 2] = fz + off.dz * rad
        }
      }
      posAttr.needsUpdate = true
      particles.geometry.setDrawRange(0, sim.foodCount * FOOD_PARTICLES_PER_PATCH)
    }
    for (let k = 0; k < MAX_FOOD_PATCHES; k++) {
      const glow = foodGlowRefs.current[k]
      if (!glow) continue
      if (k < sim.foodCount) {
        glow.position.set(sim.foodX[k], sim.foodY[k], sim.foodZ[k])
        glow.scale.setScalar(sim.foodRadius[k])
        glow.visible = true
      } else {
        glow.visible = false
      }
    }

    inspectorAccum.current += delta
    if (inspectorAccum.current > 0.15) {
      inspectorAccum.current = 0
      if (selectedFishIndex >= 0 && selectedFishIndex < sim.count && sim.alive[selectedFishIndex]) {
        const i = selectedFishIndex
        const vx = sim.velX[i], vy = sim.velY[i], vz = sim.velZ[i]
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) || 0.0001
        // "speed/heading" is this fish's own swimming intent; "ground"
        // values add the current it never chose — the gap between the two
        // is exactly what Scenario B (Ocean Current) is meant to show.
        const gvx = vx + environment.currentDirection[0] * environment.currentStrength
        const gvy = vy + environment.currentDirection[1] * environment.currentStrength
        const gvz = vz + environment.currentDirection[2] * environment.currentStrength
        const groundSpeed = Math.sqrt(gvx * gvx + gvy * gvy + gvz * gvz) || 0.0001
        setSelectedFishStats({
          id: i,
          speed,
          heading: [vx / speed, vy / speed, vz / speed],
          groundSpeed,
          groundHeading: [gvx / groundSpeed, gvy / groundSpeed, gvz / groundSpeed],
          neighborCount: sim.debugNeighborCount[i],
          nearestPredatorDist: sim.debugNearestPredatorDist[i],
          threatLevel: sim.fear[i],
          forageLevel: sim.forage[i],
        })
      } else {
        setSelectedFishStats(null)
      }
    }

    statsAccum.current += delta
    if (statsAccum.current > 0.5) {
      statsAccum.current = 0
      let speedSum = 0
      let hx = 0, hy = 0, hz = 0
      for (let i = 0; i < sim.count; i++) {
        if (!sim.alive[i]) continue
        const vx = sim.velX[i], vy = sim.velY[i], vz = sim.velZ[i]
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
        speedSum += speed
        if (speed > 1e-5) {
          hx += vx / speed
          hy += vy / speed
          hz += vz / speed
        }
      }
      const n = Math.max(aliveCount, 1)
      const polarization = Math.sqrt(hx * hx + hy * hy + hz * hz) / n
      const fps = delta > 0 ? 1 / delta : 0

      // School-cluster flood fill is O(n) with grid traversal — cheap enough
      // once a second even at 10k, but not worth doing every 0.5s stats tick.
      schoolCountAccum.current += 0.5
      let schoolCount = lastSchoolCount.current
      if (schoolCountAccum.current >= 1) {
        schoolCountAccum.current = 0
        schoolCount = sim.computeSchoolCount()
        lastSchoolCount.current = schoolCount
      }

      setStats({
        fishCount: aliveCount,
        avgSpeed: speedSum / n,
        avgNeighborDistance: sim.computeAvgNearestNeighborDistance(quality.statsSampleSize),
        polarization,
        fps,
        schoolCount,
      })

      // Adaptive quality: if frame rate is sustained low at a population
      // above the smallest preset, step down one preset rather than letting
      // the whole experience stutter. Cooldown avoids repeatedly dropping
      // every half-second once at the lowest tier.
      if (autoQuality && downgradeCooldown.current <= 0) {
        const stepDown = POPULATION_STEP_DOWN[schooling.population]
        if (fps < 24 && stepDown) {
          setSchooling({ population: stepDown })
          setQualityNotice(`Frame rate dropped — population reduced to ${stepDown} for smoother motion.`)
          downgradeCooldown.current = 6
        }
      }
      if (downgradeCooldown.current > 0) downgradeCooldown.current--
    }
  })

  return (
    <group key={`${schooling.population}-${resetToken}`}>
      <instancedMesh
        ref={bodyRef}
        args={[bodyGeometry, undefined, sim.count]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation()
          if (e.instanceId != null && sim.alive[e.instanceId]) {
            setSelectedFishIndex(e.instanceId)
          }
        }}
      >
        <meshStandardMaterial vertexColors color="#ffffff" metalness={0.55} roughness={0.3} />
      </instancedMesh>
      <instancedMesh
        ref={tailRef}
        args={[tailGeometry, undefined, sim.count]}
        frustumCulled={false}
      >
        <meshStandardMaterial
          color="#8d9aa6"
          metalness={0.4}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      {predators.count > 0 && (
        <instancedMesh
          key={`predators-${predators.count}-${predatorParams.mixedSpecies}-${predatorParams.species}-${resetToken}`}
          ref={predatorRef}
          args={[predatorGeometry, undefined, predators.count]}
          frustumCulled={false}
        >
          <meshStandardMaterial vertexColors color="#ffffff" metalness={0.3} roughness={0.5} />
        </instancedMesh>
      )}
      <points ref={foodParticlesRef} geometry={foodParticleGeometry} frustumCulled={false}>
        <pointsMaterial
          color="#c7e86a"
          size={0.12}
          sizeAttenuation
          transparent
          opacity={0.75}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      {Array.from({ length: MAX_FOOD_PATCHES }).map((_, k) => (
        <mesh
          key={k}
          ref={(el) => {
            foodGlowRefs.current[k] = el
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial
            color="#b8d96a"
            transparent
            opacity={0.06}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}
