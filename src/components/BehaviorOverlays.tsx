import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useSimStore } from '../store/useSimStore'
import { simRefs } from '../sim/sharedRefs'

const ORIGIN = new THREE.Vector3(0, 0, 0)
const UP = new THREE.Vector3(0, 1, 0)

function makeArrow(color: string) {
  const arrow = new THREE.ArrowHelper(UP, ORIGIN, 1, color, 0.3, 0.18)
  arrow.visible = false
  return arrow
}

const CURRENT_FIELD_SAMPLES = 10

/**
 * Renders the optional scientific overlays from the spec: per-vector forces
 * for the currently selected fish, its sensory neighborhood, and a handful
 * of arrows showing the (globally uniform, in this model) current field.
 * Lives inside the Canvas tree since it needs useFrame and raw THREE objects.
 */
export function BehaviorOverlays() {
  const selectedFishIndex = useSimStore((s) => s.selectedFishIndex)
  const visualization = useSimStore((s) => s.visualization)
  const environment = useSimStore((s) => s.environment)

  const velocityArrow = useMemo(() => makeArrow('#ffffff'), [])
  const separationArrow = useMemo(() => makeArrow('#ff5050'), [])
  const alignmentArrow = useMemo(() => makeArrow('#4da3ff'), [])
  const cohesionArrow = useMemo(() => makeArrow('#4dff7a'), [])
  const avoidanceArrow = useMemo(() => makeArrow('#ffb84d'), [])
  const sensorySphere = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 20, 14)
    const mat = new THREE.MeshBasicMaterial({
      color: '#7fd4ff',
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.visible = false
    return mesh
  }, [])

  const currentArrows = useMemo(
    () => Array.from({ length: CURRENT_FIELD_SAMPLES }, () => makeArrow('#9fd8ff')),
    [],
  )
  const currentArrowsPlaced = useRef(false)

  useFrame(() => {
    const sim = simRefs.sim
    const i = selectedFishIndex

    if (!sim || i < 0 || i >= sim.count || !sim.alive[i]) {
      velocityArrow.visible = false
      separationArrow.visible = false
      alignmentArrow.visible = false
      cohesionArrow.visible = false
      avoidanceArrow.visible = false
      sensorySphere.visible = false
    } else {
      const pos = new THREE.Vector3(sim.posX[i], sim.posY[i], sim.posZ[i])

      const setArrow = (
        arrow: THREE.ArrowHelper,
        show: boolean,
        vx: number, vy: number, vz: number,
        scale: number,
      ) => {
        arrow.visible = show
        if (!show) return
        const len = Math.sqrt(vx * vx + vy * vy + vz * vz)
        arrow.position.copy(pos)
        if (len > 1e-4) {
          arrow.setDirection(new THREE.Vector3(vx / len, vy / len, vz / len))
          arrow.setLength(Math.min(len * scale + 0.4, 8), 0.3, 0.18)
        } else {
          arrow.setLength(0.01)
        }
      }

      setArrow(velocityArrow, visualization.velocity, sim.velX[i], sim.velY[i], sim.velZ[i], 0.6)
      setArrow(separationArrow, visualization.separation, sim.debugSepX[i], sim.debugSepY[i], sim.debugSepZ[i], 1.2)
      setArrow(alignmentArrow, visualization.alignment, sim.debugAliX[i], sim.debugAliY[i], sim.debugAliZ[i], 1.2)
      setArrow(cohesionArrow, visualization.cohesion, sim.debugCohX[i], sim.debugCohY[i], sim.debugCohZ[i], 1.2)
      setArrow(avoidanceArrow, visualization.avoidance, sim.debugFearX[i], sim.debugFearY[i], sim.debugFearZ[i], 0.8)

      sensorySphere.visible = visualization.sensoryRange
      if (visualization.sensoryRange) {
        sensorySphere.position.copy(pos)
        sensorySphere.scale.setScalar(sim.params.perceptionRadius)
      }
    }

    if (visualization.currentField) {
      if (!currentArrowsPlaced.current) {
        currentArrowsPlaced.current = true
        const r = environment.boundsRadius
        for (const arrow of currentArrows) {
          arrow.position.set(
            environment.boundsCenter[0] + (Math.random() - 0.5) * r,
            environment.boundsCenter[1] + (Math.random() - 0.5) * r * 0.6,
            environment.boundsCenter[2] + (Math.random() - 0.5) * r,
          )
        }
      }
      const [cx, cy, cz] = environment.currentDirection
      const len = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1
      for (const arrow of currentArrows) {
        arrow.visible = true
        arrow.setDirection(new THREE.Vector3(cx / len, cy / len, cz / len))
        arrow.setLength(1.5 + environment.currentStrength * 3, 0.3, 0.15)
      }
    } else {
      currentArrowsPlaced.current = false
      for (const arrow of currentArrows) arrow.visible = false
    }
  })

  return (
    <>
      <primitive object={velocityArrow} />
      <primitive object={separationArrow} />
      <primitive object={alignmentArrow} />
      <primitive object={cohesionArrow} />
      <primitive object={avoidanceArrow} />
      <primitive object={sensorySphere} />
      {currentArrows.map((arrow, idx) => (
        <primitive key={idx} object={arrow} />
      ))}
    </>
  )
}
