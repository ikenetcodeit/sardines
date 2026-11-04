import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const SNOW_COUNT = 600
const SNOW_SPAN = 70
const SNOW_HEIGHT_MIN = -38
const SNOW_HEIGHT_MAX = 30

function createShaftAlphaTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 16, 256)
  const texture = new THREE.CanvasTexture(canvas)
  return texture
}

const shaftAlphaTexture = createShaftAlphaTexture()

function MarineSnow() {
  const pointsRef = useRef<THREE.Points>(null)
  const velocities = useMemo(() => {
    const arr = new Float32Array(SNOW_COUNT)
    for (let i = 0; i < SNOW_COUNT; i++) arr[i] = 0.15 + Math.random() * 0.25
    return arr
  }, [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(SNOW_COUNT * 3)
    for (let i = 0; i < SNOW_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * SNOW_SPAN
      positions[i * 3 + 1] = SNOW_HEIGHT_MIN + Math.random() * (SNOW_HEIGHT_MAX - SNOW_HEIGHT_MIN)
      positions[i * 3 + 2] = (Math.random() - 0.5) * SNOW_SPAN
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [])

  // Suspended organic matter drifting slowly upward, wrapping back to the
  // bottom once it clears the surface — ambient atmosphere, not plankton
  // food (that's the feeding-zone particle system elsewhere).
  useFrame((_, delta) => {
    const points = pointsRef.current
    if (!points) return
    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    for (let i = 0; i < SNOW_COUNT; i++) {
      arr[i * 3 + 1] += velocities[i] * delta
      if (arr[i * 3 + 1] > SNOW_HEIGHT_MAX) {
        arr[i * 3 + 1] = SNOW_HEIGHT_MIN
        arr[i * 3] = (Math.random() - 0.5) * SNOW_SPAN
        arr[i * 3 + 2] = (Math.random() - 0.5) * SNOW_SPAN
      }
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color="#dcecf0"
        size={0.06}
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </points>
  )
}

function LightShafts() {
  const groupRef = useRef<THREE.Group>(null)
  const shafts = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        x: (Math.random() - 0.5) * 30,
        z: (Math.random() - 0.5) * 30,
        rotY: Math.random() * Math.PI,
        tilt: (Math.random() - 0.5) * 0.3 - 0.15,
        width: 4 + Math.random() * 4,
        phase: i * 1.7,
      })),
    [],
  )

  useFrame(({ clock }) => {
    const group = groupRef.current
    if (!group) return
    group.children.forEach((child, i) => {
      const shaft = shafts[i]
      child.rotation.z = shaft.tilt + Math.sin(clock.elapsedTime * 0.08 + shaft.phase) * 0.05
    })
  })

  return (
    <group ref={groupRef} position={[0, 30, 0]}>
      {shafts.map((shaft, i) => (
        <mesh
          key={i}
          position={[shaft.x, -28, shaft.z]}
          rotation={[0, shaft.rotY, shaft.tilt]}
        >
          <planeGeometry args={[shaft.width, 65, 1, 1]} />
          <meshBasicMaterial
            color="#bfe9ff"
            alphaMap={shaftAlphaTexture}
            transparent
            opacity={0.1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

// Underwater atmosphere: fog for depth-based visibility falloff, a
// sunlit-from-above directional light, a softly glowing wave-animated
// surface plane, suspended marine-snow particles, and faint sun-shaft
// planes — enough to read as an open-ocean volume rather than an empty room.
export function Ocean() {
  const surfaceRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (surfaceRef.current) {
      const material = surfaceRef.current.material as THREE.MeshStandardMaterial
      material.opacity = 0.18 + Math.sin(clock.elapsedTime * 0.4) * 0.03
    }
  })

  return (
    <>
      <color attach="background" args={['#04324a']} />
      <fogExp2 attach="fog" args={['#0a4a66', 0.018]} />

      <hemisphereLight args={['#bfe8ff', '#021422', 0.55]} />
      <directionalLight
        position={[15, 40, 10]}
        intensity={1.6}
        color="#dff3ff"
      />

      <LightShafts />
      <MarineSnow />

      <mesh ref={surfaceRef} position={[0, 32, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[300, 300, 1, 1]} />
        <meshStandardMaterial
          color="#bdeeff"
          transparent
          opacity={0.2}
          emissive="#bdeeff"
          emissiveIntensity={0.3}
        />
      </mesh>

      <mesh position={[0, -40, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[400, 400, 1, 1]} />
        <meshStandardMaterial color="#021f2e" roughness={1} />
      </mesh>
    </>
  )
}
