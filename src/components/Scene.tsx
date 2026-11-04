import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Ocean } from './Ocean'
import { SardineField } from './SardineField'
import { CameraRig } from './CameraRig'
import { BehaviorOverlays } from './BehaviorOverlays'
import { useSimStore } from '../store/useSimStore'

export function Scene() {
  const cameraMode = useSimStore((s) => s.cameraMode)

  return (
    <Canvas camera={{ position: [0, 4, 42], fov: 55, near: 0.1, far: 500 }}>
      <Ocean />
      <SardineField />
      <BehaviorOverlays />
      <CameraRig />
      <OrbitControls
        enabled={cameraMode === 'free'}
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={150}
        target={[0, 0, 0]}
      />
    </Canvas>
  )
}
