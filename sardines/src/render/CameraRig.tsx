import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { simClient } from '../sim/client'
import { useSimStore } from '../store/useSimStore'
import { renderFish, renderIndexOf, renderPredators } from './renderState'

type Shot = 'establish' | 'tracking' | 'silhouette' | 'predator' | 'close' | 'below'

const SURFACE_LIMIT = -0.6

function damp(current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) {
  current.lerp(target, 1 - Math.exp(-lambda * dt))
}

/** Centre of the largest school, falling back to the mean fish position. */
function schoolFocus(out: THREE.Vector3, heading: THREE.Vector3): number {
  const L = simClient.cur?.stats.largest
  if (L) {
    out.set(L.cx, L.cy, L.cz)
    heading.set(L.hx, 0, L.hz)
    if (heading.lengthSq() < 1e-4) heading.set(0, 0, 1)
    heading.normalize()
    return L.radius
  }
  const n = renderFish.count
  if (n === 0) {
    out.set(0, -12, 0)
    heading.set(0, 0, 1)
    return 4
  }
  let x = 0
  let y = 0
  let z = 0
  const step = Math.max(1, Math.floor(n / 300))
  let k = 0
  for (let i = 0; i < n; i += step) {
    x += renderFish.pos[i * 3]
    y += renderFish.pos[i * 3 + 1]
    z += renderFish.pos[i * 3 + 2]
    k++
  }
  out.set(x / k, y / k, z / k)
  heading.set(0, 0, 1)
  return 4
}

/**
 * Camera modes: free orbit, underwater drone, follow school, follow
 * individual, predator perspective and an automatic documentary director.
 * Every mode moves the camera through critically-damped smoothing, so
 * switching modes or targets never snaps.
 */
export function CameraRig() {
  const mode = useSimStore((s) => s.camera)
  const followPredator = useSimStore((s) => s.followPredator)
  const selectedId = useSimStore((s) => s.selectedId)
  const { camera, gl } = useThree()
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const st = useMemo(
    () => ({
      pos: new THREE.Vector3(0, -12, 26),
      look: new THREE.Vector3(0, -14, 0),
      tPos: new THREE.Vector3(),
      tLook: new THREE.Vector3(),
      focus: new THREE.Vector3(),
      heading: new THREE.Vector3(0, 0, 1),
      smoothFocus: new THREE.Vector3(0, -14, 0),
      smoothHeading: new THREE.Vector3(0, 0, 1),
      orbit: 0,
      shot: 'establish' as Shot,
      shotTime: 0,
      shotLen: 10,
      shotSide: 1,
      shotSeed: 0.5,
      closeId: -1,
      yaw: 0,
      pitch: 0,
      vel: new THREE.Vector3(),
      keys: new Set<string>(),
      initialized: false,
    }),
    [],
  )

  // drone controls: keyboard + drag-to-look
  useEffect(() => {
    if (mode !== 'drone') return
    const el = gl.domElement
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    st.yaw = Math.atan2(dir.x, dir.z)
    st.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
    let dragging = false
    let lx = 0
    let ly = 0
    const down = (e: PointerEvent) => {
      dragging = true
      lx = e.clientX
      ly = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      st.yaw -= (e.clientX - lx) * 0.004
      st.pitch = THREE.MathUtils.clamp(st.pitch - (e.clientY - ly) * 0.004, -1.4, 1.4)
      lx = e.clientX
      ly = e.clientY
    }
    const up = () => (dragging = false)
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && /INPUT|SELECT|TEXTAREA|BUTTON/.test(t.tagName)
    const kd = (e: KeyboardEvent) => {
      if (isField(e.target)) return
      st.keys.add(e.key.toLowerCase())
    }
    const ku = (e: KeyboardEvent) => st.keys.delete(e.key.toLowerCase())
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      st.keys.clear()
    }
  }, [mode, gl, camera, st])

  // entering free mode: orbit around the current look target
  useEffect(() => {
    if (mode === 'free' && controls.current) {
      controls.current.target.copy(st.look)
      controls.current.update()
    }
  }, [mode, st])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    if (!st.initialized && renderFish.count > 0) {
      const r = schoolFocus(st.focus, st.heading)
      st.smoothFocus.copy(st.focus)
      st.look.copy(st.focus)
      st.pos.copy(st.focus).add(new THREE.Vector3(-st.heading.z, 0.15, st.heading.x).multiplyScalar(r * 3 + 12))
      camera.position.copy(st.pos)
      camera.lookAt(st.look)
      st.initialized = true
    }
    const radius = schoolFocus(st.focus, st.heading)
    damp(st.smoothFocus, st.focus, 1.2, dt)
    damp(st.smoothHeading, st.heading, 0.6, dt)
    st.smoothHeading.y = 0
    if (st.smoothHeading.lengthSq() < 1e-4) st.smoothHeading.set(0, 0, 1)
    st.smoothHeading.normalize()
    const side = new THREE.Vector3(-st.smoothHeading.z, 0, st.smoothHeading.x)

    if (mode === 'free') {
      const c = controls.current
      if (c) {
        if (camera.position.y > SURFACE_LIMIT) camera.position.y = SURFACE_LIMIT
        st.pos.copy(camera.position)
        st.look.copy(c.target)
      }
      return
    }

    let lambdaPos = 1.5
    let lambdaLook = 2.5
    if (mode === 'drone') {
      const k = st.keys
      const fwd = new THREE.Vector3(Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), Math.cos(st.yaw) * Math.cos(st.pitch))
      const right = new THREE.Vector3(-Math.cos(st.yaw), 0, Math.sin(st.yaw))
      const want = new THREE.Vector3()
      const sp = k.has('shift') ? 9 : 3.5
      if (k.has('w') || k.has('arrowup')) want.add(fwd)
      if (k.has('s') || k.has('arrowdown')) want.sub(fwd)
      if (k.has('d') || k.has('arrowright')) want.add(right)
      if (k.has('a') || k.has('arrowleft')) want.sub(right)
      if (k.has('e') || k.has(' ')) want.y += 1
      if (k.has('q') || k.has('c')) want.y -= 1
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(sp)
      damp(st.vel, want, 3, dt)
      camera.position.addScaledVector(st.vel, dt)
      if (camera.position.y > SURFACE_LIMIT) camera.position.y = SURFACE_LIMIT
      st.look.copy(camera.position).add(fwd)
      camera.lookAt(st.look)
      st.pos.copy(camera.position)
      return
    }

    if (mode === 'school') {
      st.orbit += dt * 0.035
      const dist = THREE.MathUtils.clamp(radius * 2.2 + 5, 7, 34)
      const ang = st.orbit
      const off = side.clone().multiplyScalar(Math.cos(ang)).addScaledVector(st.smoothHeading, Math.sin(ang) * 0.6)
      st.tPos.copy(st.smoothFocus).addScaledVector(off, dist)
      st.tPos.y += dist * 0.12
      // shallow schools are filmed from below, against the bright surface
      if (st.smoothFocus.y > -7) st.tPos.y = Math.min(st.tPos.y, st.smoothFocus.y - dist * 0.3, -3)
      st.tLook.copy(st.smoothFocus)
      lambdaPos = 0.9
    } else if (mode === 'individual') {
      const i = selectedId >= 0 ? renderIndexOf(selectedId) : -1
      if (i >= 0) {
        const p = new THREE.Vector3(renderFish.pos[i * 3], renderFish.pos[i * 3 + 1], renderFish.pos[i * 3 + 2])
        const f = new THREE.Vector3(renderFish.dir[i * 3], renderFish.dir[i * 3 + 1], renderFish.dir[i * 3 + 2])
        const s = new THREE.Vector3(-f.z, 0, f.x).normalize()
        st.tPos.copy(p).addScaledVector(f, -1.1).addScaledVector(s, 0.55)
        st.tPos.y += 0.3
        st.tLook.copy(p).addScaledVector(f, 0.6)
        lambdaPos = 3
        lambdaLook = 6
      } else {
        st.tLook.copy(st.smoothFocus)
        st.tPos.copy(st.pos)
      }
    } else if (mode === 'predator') {
      const pr = renderPredators.length ? renderPredators[followPredator % renderPredators.length] : null
      if (pr && pr.pos.y > -1.5) {
        // airborne (or surfacing) birds: watch from below, through the surface
        const h = new THREE.Vector3(pr.dir.x, 0, pr.dir.z)
        if (h.lengthSq() < 1e-4) h.set(0, 0, 1)
        h.normalize()
        const up = Math.max(0, pr.pos.y)
        st.tPos.copy(pr.pos).addScaledVector(h, -(8 + up * 0.8))
        st.tPos.y = -4
        st.tLook.copy(pr.pos)
        st.tLook.y = Math.min(pr.pos.y, 6)
        lambdaPos = 1.5
        lambdaLook = 2
      } else if (pr) {
        const L = pr.length
        st.tPos.copy(pr.pos).addScaledVector(pr.dir, -(L * 2.2 + 2)).add(new THREE.Vector3(0, L * 0.45 + 0.4, 0))
        st.tLook.copy(pr.pos).addScaledVector(pr.dir, L * 3)
        lambdaPos = 2.2
        lambdaLook = 3
      } else {
        st.tLook.copy(st.smoothFocus)
        st.tPos.copy(st.smoothFocus).addScaledVector(side, radius * 3 + 10)
      }
    } else if (mode === 'cinematic') {
      st.shotTime += dt
      // choose a new shot when the current one has run its course
      const active = renderPredators.find(
        (p) =>
          (p.state === 'attack' || p.state === 'herd' || p.state === 'dive' || p.state === 'slash' || p.state === 'underwater') &&
          p.pos.distanceTo(st.smoothFocus) < radius + 25,
      )
      if (st.shotTime > st.shotLen || (active && st.shot !== 'predator' && st.shotTime > 4 && Math.random() < dt * 0.3)) {
        const options: Shot[] = ['establish', 'tracking', 'silhouette', 'close', 'below']
        if (active) options.push('predator', 'predator', 'establish')
        let next = options[Math.floor(Math.random() * options.length)]
        if (next === st.shot) next = options[(options.indexOf(next) + 1) % options.length]
        st.shot = next
        st.shotTime = 0
        st.shotLen = 9 + Math.random() * 6
        st.shotSide = Math.random() < 0.5 ? -1 : 1
        st.shotSeed = Math.random()
        st.closeId = -1
      }
      const t = st.shotTime
      lambdaPos = 0.55
      lambdaLook = 1.0
      const dist = THREE.MathUtils.clamp(radius * 2.2 + 4, 6, 32)
      switch (st.shot) {
        case 'establish': {
          const ang = st.shotSeed * 6.28 + t * 0.03 * st.shotSide
          st.tPos
            .copy(st.smoothFocus)
            .add(new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(dist * 1.05))
          st.tPos.y = st.smoothFocus.y + dist * 0.18
          st.tLook.copy(st.smoothFocus)
          break
        }
        case 'tracking': {
          st.tPos.copy(st.smoothFocus).addScaledVector(side, dist * 0.7 * st.shotSide).addScaledVector(st.smoothHeading, dist * 0.25)
          st.tPos.y = st.smoothFocus.y - 1
          st.tLook.copy(st.smoothFocus).addScaledVector(st.smoothHeading, radius)
          break
        }
        case 'silhouette': {
          // below the school, looking up at dark shapes against the bright surface
          st.tPos.copy(st.smoothFocus).addScaledVector(side, dist * 0.35 * st.shotSide)
          st.tPos.y = st.smoothFocus.y - Math.min(dist * 0.6, 14)
          st.tLook.copy(st.smoothFocus)
          st.tLook.y += 2
          break
        }
        case 'below': {
          st.tPos.copy(st.smoothFocus).addScaledVector(st.smoothHeading, dist * 0.8)
          st.tPos.y = st.smoothFocus.y - dist * 0.15
          st.tLook.copy(st.smoothFocus)
          break
        }
        case 'close': {
          if (st.closeId < 0 || renderIndexOf(st.closeId) < 0) {
            // pick a fish near the school's flank
            let best = -1
            let bd = Infinity
            const target = st.smoothFocus.clone().addScaledVector(side, radius * 0.7 * st.shotSide)
            for (let i = 0; i < renderFish.count; i += 4) {
              const d =
                (renderFish.pos[i * 3] - target.x) ** 2 + (renderFish.pos[i * 3 + 1] - target.y) ** 2 + (renderFish.pos[i * 3 + 2] - target.z) ** 2
              if (d < bd) {
                bd = d
                best = i
              }
            }
            st.closeId = best >= 0 ? renderFish.ids[best] : -1
          }
          const i = renderIndexOf(st.closeId)
          if (i >= 0) {
            const p = new THREE.Vector3(renderFish.pos[i * 3], renderFish.pos[i * 3 + 1], renderFish.pos[i * 3 + 2])
            st.tPos.copy(p).addScaledVector(side, 3.2 * st.shotSide).addScaledVector(st.smoothHeading, -1.2)
            st.tPos.y += 0.4
            st.tLook.copy(p)
            lambdaPos = 0.9
          }
          break
        }
        case 'predator': {
          const pr = active ?? renderPredators[0]
          if (pr) {
            const s2 = new THREE.Vector3(-pr.dir.z, 0, pr.dir.x).normalize()
            st.tPos.copy(pr.pos).addScaledVector(s2, (pr.length * 3 + 5) * st.shotSide).addScaledVector(pr.dir, -pr.length)
            st.tPos.y = Math.min(pr.pos.y + 1.5, SURFACE_LIMIT - 0.5)
            st.tLook.copy(pr.pos).lerp(st.smoothFocus, 0.4)
            lambdaPos = 0.8
          } else st.shotTime = st.shotLen
          break
        }
      }
    }

    if (mode !== 'individual' && mode !== 'predator') st.tPos.y = Math.min(st.tPos.y, -2.5)
    damp(st.pos, st.tPos, lambdaPos, dt)
    damp(st.look, st.tLook, lambdaLook, dt)
    if (st.pos.y > SURFACE_LIMIT) st.pos.y = SURFACE_LIMIT
    camera.position.copy(st.pos)
    camera.lookAt(st.look)
  }, -1)

  return mode === 'free' ? (
    <OrbitControls ref={controls} enableDamping dampingFactor={0.08} minDistance={1} maxDistance={160} makeDefault />
  ) : null
}
