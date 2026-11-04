import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { useSimStore } from '../store/useSimStore'
import { simRefs } from '../sim/sharedRefs'

const desiredPos = new THREE.Vector3()
const lookAtTarget = new THREE.Vector3()
const currentLook = new THREE.Vector3()
const targetDir = new THREE.Vector3()
const lookAtPoint = new THREE.Vector3()

// Drives the camera for every non-free mode. Free Exploration leaves the
// camera entirely to OrbitControls (this component becomes a no-op), so the
// two never fight over the transform in the same frame.
export function CameraRig() {
  const { camera } = useThree()
  const cameraMode = useSimStore((s) => s.cameraMode)
  const selectedFishIndex = useSimStore((s) => s.selectedFishIndex)
  const cinematicAngle = useRef(0)

  useFrame((_, delta) => {
    if (cameraMode === 'free') return
    const sim = simRefs.sim
    if (!sim) return

    const smoothing = 1 - Math.pow(0.001, delta)

    if (cameraMode === 'followSchool') {
      const backOffset = 22
      desiredPos.set(
        simRefs.centroidX - backOffset * 0.3,
        simRefs.centroidY + backOffset * 0.35,
        simRefs.centroidZ + backOffset,
      )
      lookAtTarget.set(simRefs.centroidX, simRefs.centroidY, simRefs.centroidZ)
    } else if (cameraMode === 'followIndividual') {
      const i = Math.min(selectedFishIndex, sim.count - 1)
      if (i < 0) return
      const fx = sim.posX[i], fy = sim.posY[i], fz = sim.posZ[i]
      const vx = sim.velX[i], vy = sim.velY[i], vz = sim.velZ[i]
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1
      desiredPos.set(
        fx - (vx / speed) * 4,
        fy + 1.4,
        fz - (vz / speed) * 4,
      )
      lookAtTarget.set(fx, fy, fz)
    } else if (cameraMode === 'predator') {
      const predators = simRefs.predators
      if (!predators || predators.count === 0) return
      const px = predators.posX[0], py = predators.posY[0], pz = predators.posZ[0]
      const vx = predators.velX[0], vy = predators.velY[0], vz = predators.velZ[0]
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1
      desiredPos.set(
        px - (vx / speed) * 6,
        py + 2,
        pz - (vz / speed) * 6,
      )
      lookAtTarget.set(px, py, pz)
    } else if (cameraMode === 'cinematic') {
      cinematicAngle.current += delta * 0.12
      const radius = 34
      desiredPos.set(
        simRefs.centroidX + Math.sin(cinematicAngle.current) * radius,
        simRefs.centroidY + 8 + Math.sin(cinematicAngle.current * 0.4) * 4,
        simRefs.centroidZ + Math.cos(cinematicAngle.current) * radius,
      )
      lookAtTarget.set(simRefs.centroidX, simRefs.centroidY, simRefs.centroidZ)
    }

    camera.position.lerp(desiredPos, smoothing)
    camera.getWorldDirection(currentLook)
    targetDir.copy(lookAtTarget).sub(camera.position).normalize()
    currentLook.lerp(targetDir, smoothing)
    lookAtPoint.copy(camera.position).add(currentLook)
    camera.lookAt(lookAtPoint)
  })

  return null
}
