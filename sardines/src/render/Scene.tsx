import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { QUALITY } from '../sim/config'
import { qualityBelow, useSimStore } from '../store/useSimStore'
import { CameraRig } from './CameraRig'
import { Atmosphere, Background, Bubbles, LightShafts, MarineSnow, PlanktonClouds, Rocks, Seafloor, Surface } from './Ocean'
import { Overlays } from './Overlays'
import { Predators } from './Predators'
import { renderFish } from './renderState'
import { SardineField, SelectionMarker } from './SardineField'
import { installUnderwaterFog } from './underwater'

installUnderwaterFog()

/** Exposed so the UI can trigger a screenshot of the next frame. */
export const screenshotRef: { current: (() => void) | null } = { current: null }

/** Click (without dragging) on a fish to inspect it. */
function Picker() {
  const { gl, camera } = useThree()
  const select = useSimStore((s) => s.select)
  useEffect(() => {
    const el = gl.domElement
    let sx = 0
    let sy = 0
    let t0 = 0
    const down = (e: PointerEvent) => {
      sx = e.clientX
      sy = e.clientY
      t0 = performance.now()
    }
    const up = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 6 || performance.now() - t0 > 600) return
      const rect = el.getBoundingClientRect()
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ndc, camera)
      const o = ray.ray.origin
      const d = ray.ray.direction
      let best = -1
      let bestScore = Infinity
      const P = renderFish.pos
      for (let i = 0; i < renderFish.count; i++) {
        const px = P[i * 3] - o.x
        const py = P[i * 3 + 1] - o.y
        const pz = P[i * 3 + 2] - o.z
        const t = px * d.x + py * d.y + pz * d.z
        if (t < 0.2) continue
        const qx = px - d.x * t
        const qy = py - d.y * t
        const qz = pz - d.z * t
        const miss = Math.sqrt(qx * qx + qy * qy + qz * qz)
        const tol = Math.max(0.12, t * 0.012)
        if (miss > tol) continue
        // prefer the nearest fish along the ray
        const score = t + (miss / tol) * 0.5
        if (score < bestScore) {
          bestScore = score
          best = i
        }
      }
      if (best >= 0) select(renderFish.ids[best])
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
    }
  }, [gl, camera, select])
  return null
}

function Screenshot() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    screenshotRef.current = () => {
      gl.render(scene, camera)
      const url = gl.domElement.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `sardine-school-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      a.click()
      useSimStore.getState().toast('Screenshot saved')
    }
    return () => {
      screenshotRef.current = null
    }
  }, [gl, scene, camera])
  return null
}

/**
 * Measures render performance separately from simulation cost and, when
 * auto-quality is on, steps visual quality (then population) down if the
 * frame rate stays low.
 */
function PerformanceMonitor() {
  const { gl } = useThree()
  const quality = useSimStore((s) => s.quality)
  const acc = useRef({ frames: 0, time: 0, low: 0, cpu: 0, last: performance.now() })
  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[quality].pixelRatio))
  }, [gl, quality])
  useFrame((_, dt) => {
    const a = acc.current
    const now = performance.now()
    a.cpu += now - a.last
    a.last = now
    a.frames++
    a.time += dt
    if (a.time < 1) return
    const fps = a.frames / a.time
    const st = useSimStore.getState()
    st.setPerf({ fps, renderMs: (a.time * 1000) / a.frames })
    a.frames = 0
    a.time = 0
    if (!st.autoQuality || document.hidden) return
    // < 5 fps almost always means the page is in the background (rAF throttled), not real load
    if (fps < 5) return
    a.low = fps < 38 ? a.low + 1 : 0
    if (a.low >= 4) {
      a.low = -4
      const lower = qualityBelow(st.quality)
      if (lower) {
        st.setQuality(lower, false)
        st.toast(`Frame rate was low — visual quality reduced to ${QUALITY[lower].label}`, 'warn')
      } else if (st.params.school.population > 400) {
        const pop = Math.round(st.params.school.population * 0.75)
        st.setSchool({ population: pop })
        st.toast(`Frame rate was low — population reduced to ${pop}`, 'warn')
      }
    }
  })
  return null
}

/** Dev-only: lets automated tests render frames even when the page is in the background. */
function DevHooks() {
  const advance = useThree((s) => s.advance)
  const get = useThree((s) => s.get)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __advance?: (frames: number, dtMs?: number) => void; __three?: typeof get }
    w.__three = get
    let t = performance.now()
    w.__advance = (frames, dtMs = 33) => {
      for (let i = 0; i < frames; i++) {
        t = Math.max(t + dtMs, performance.now())
        advance(t, true)
      }
    }
    return () => {
      delete w.__advance
    }
  }, [advance])
  return null
}

function SceneContent() {
  const hasFloor = useSimStore((s) => s.params.env.oceanDepth < s.params.env.visibility * 2.5 + 30)
  return (
    <>
      <Atmosphere />
      <Background />
      <Surface />
      {hasFloor && <Seafloor />}
      <Rocks />
      <LightShafts />
      <MarineSnow />
      <PlanktonClouds />
      <Bubbles />
      <SardineField />
      <SelectionMarker />
      <Predators />
      <Overlays />
      <CameraRig />
      <Picker />
      <Screenshot />
      <PerformanceMonitor />
      <DevHooks />
    </>
  )
}

export function Scene() {
  return (
    <Canvas
      className="!absolute inset-0"
      camera={{ fov: 55, near: 0.05, far: 1500, position: [0, -12, 26] }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
      dpr={1}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.05
      }}
    >
      <SceneContent />
    </Canvas>
  )
}
