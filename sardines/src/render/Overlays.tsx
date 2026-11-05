import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { simClient } from '../sim/client'
import { Environment } from '../sim/Environment'
import { FORCE_STRIDE } from '../sim/protocol'
import type { SchoolInfo } from '../sim/SchoolAnalysis'
import { useSimStore } from '../store/useSimStore'
import { renderFish, renderIndexOf } from './renderState'

const COLORS = {
  velocity: new THREE.Color(0.35, 0.9, 1.0),
  separation: new THREE.Color(1.0, 0.35, 0.3),
  alignment: new THREE.Color(0.4, 1.0, 0.5),
  cohesion: new THREE.Color(1.0, 0.85, 0.3),
  avoidance: new THREE.Color(1.0, 0.3, 0.9),
}
export const OVERLAY_COLORS = Object.fromEntries(Object.entries(COLORS).map(([k, c]) => [k, `#${c.getHexString()}`]))

function lineMaterial(opacity = 0.9) {
  return new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, toneMapped: false })
}

/** Behavioural force vectors exactly as computed by the last simulation step. */
function ForceVectors() {
  const o = useSimStore((s) => s.overlays)
  const MAXV = 800 * 5 * 2
  const { lines, pos, col } = useMemo(() => {
    const pos = new Float32Array(MAXV * 3)
    const col = new Float32Array(MAXV * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage))
    const lines = new THREE.LineSegments(g, lineMaterial(0.85))
    lines.frustumCulled = false
    lines.renderOrder = 30
    return { lines, pos, col }
  }, [MAXV])
  useFrame(() => {
    const f = simClient.cur
    let v = 0
    const push = (x: number, y: number, z: number, dx: number, dy: number, dz: number, c: THREE.Color) => {
      if (v + 2 > MAXV) return
      pos[v * 3] = x
      pos[v * 3 + 1] = y
      pos[v * 3 + 2] = z
      pos[v * 3 + 3] = x + dx
      pos[v * 3 + 4] = y + dy
      pos[v * 3 + 5] = z + dz
      for (let k = 0; k < 2; k++) {
        col[(v + k) * 3] = c.r
        col[(v + k) * 3 + 1] = c.g
        col[(v + k) * 3 + 2] = c.b
      }
      v += 2
    }
    if (f && f.forceIdx && f.forces) {
      const S = 0.5
      for (let k = 0; k < f.forceIdx.length; k++) {
        const i = f.forceIdx[k]
        if (i >= renderFish.count) continue
        const x = renderFish.pos[i * 3]
        const y = renderFish.pos[i * 3 + 1]
        const z = renderFish.pos[i * 3 + 2]
        const b = k * FORCE_STRIDE
        const F = f.forces
        if (o.velocity) {
          const s = renderFish.speed[i]
          push(x, y, z, renderFish.dir[i * 3] * s, renderFish.dir[i * 3 + 1] * s, renderFish.dir[i * 3 + 2] * s, COLORS.velocity)
        }
        if (o.separation) push(x, y, z, F[b] * S, F[b + 1] * S, F[b + 2] * S, COLORS.separation)
        if (o.alignment) push(x, y, z, F[b + 3] * S, F[b + 4] * S, F[b + 5] * S, COLORS.alignment)
        if (o.cohesion) push(x, y, z, F[b + 6] * S, F[b + 7] * S, F[b + 8] * S, COLORS.cohesion)
        if (o.avoidance) push(x, y, z, F[b + 9] * S, F[b + 10] * S, F[b + 11] * S, COLORS.avoidance)
      }
    }
    lines.geometry.setDrawRange(0, v)
    lines.geometry.attributes.position.needsUpdate = true
    lines.geometry.attributes.color.needsUpdate = true
  })
  return <primitive object={lines} />
}

/** Perception of the selected fish: visual range, lateral-line range, blind zone and attended neighbours. */
function Neighborhood() {
  const selectedId = useSimStore((s) => s.selectedId)
  const g = useRef<THREE.Group>(null)
  const vis = useRef<THREE.Mesh>(null)
  const ll = useRef<THREE.Mesh>(null)
  const { lines, pos, col } = useMemo(() => {
    const MAXV = 64
    const pos = new Float32Array(MAXV * 3)
    const col = new Float32Array(MAXV * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const lines = new THREE.LineSegments(geo, lineMaterial(0.9))
    lines.frustumCulled = false
    lines.renderOrder = 31
    return { lines, pos, col }
  }, [])
  const visMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0x8fd8ff, wireframe: true, transparent: true, opacity: 0.12, depthWrite: false, fog: false }),
    [],
  )
  const llMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0x9cffb0, wireframe: true, transparent: true, opacity: 0.25, depthWrite: false, fog: false }),
    [],
  )
  useFrame(() => {
    const f = simClient.cur
    const i = selectedId >= 0 ? renderIndexOf(selectedId) : -1
    if (!g.current) return
    g.current.visible = i >= 0 && !!f
    if (i < 0 || !f) return
    const x = renderFish.pos[i * 3]
    const y = renderFish.pos[i * 3 + 1]
    const z = renderFish.pos[i * 3 + 2]
    vis.current!.position.set(x, y, z)
    vis.current!.scale.setScalar(f.visualRange)
    ll.current!.position.set(x, y, z)
    ll.current!.scale.setScalar(f.lateralRange)
    let v = 0
    const nb = f.selected?.alive ? f.selected.nbrPos : null
    if (nb) {
      for (let k = 0; k < nb.length / 3 && v < 60; k++) {
        pos.set([x, y, z, nb[k * 3], nb[k * 3 + 1], nb[k * 3 + 2]], v * 3)
        col.set([1, 0.88, 0.5, 1, 0.88, 0.5], v * 3)
        v += 2
      }
    }
    // rear blind zone (~20° half-angle behind the tail)
    const fx = renderFish.dir[i * 3]
    const fy = renderFish.dir[i * 3 + 1]
    const fz = renderFish.dir[i * 3 + 2]
    const back = new THREE.Vector3(-fx, -fy, -fz)
    const r = new THREE.Vector3(fz, 0, -fx).normalize()
    const u = new THREE.Vector3().crossVectors(back, r)
    const L = Math.min(f.visualRange, 3)
    for (const [a, b] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const d = back.clone().addScaledVector(r, a * 0.36).addScaledVector(u, b * 0.36).normalize().multiplyScalar(L)
      if (v + 2 > 64) break
      pos.set([x, y, z, x + d.x, y + d.y, z + d.z], v * 3)
      col.set([1, 0.3, 0.3, 1, 0.3, 0.3], v * 3)
      v += 2
    }
    lines.geometry.setDrawRange(0, v)
    lines.geometry.attributes.position.needsUpdate = true
    lines.geometry.attributes.color.needsUpdate = true
  })
  return (
    <group ref={g}>
      <mesh ref={vis} material={visMat} renderOrder={29}>
        <sphereGeometry args={[1, 18, 12]} />
      </mesh>
      <mesh ref={ll} material={llMat} renderOrder={29}>
        <sphereGeometry args={[1, 12, 8]} />
      </mesh>
      <primitive object={lines} />
    </group>
  )
}

/** Ocean-current vectors on a grid around the area of interest. */
function CurrentField() {
  const env = useSimStore((s) => s.params.env)
  const { camera } = useThree()
  const N = 6
  const LY = 2
  const { lines, pos, col } = useMemo(() => {
    const MAXV = N * N * LY * 6
    const pos = new Float32Array(MAXV * 3)
    const col = new Float32Array(MAXV * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const lines = new THREE.LineSegments(geo, lineMaterial(0.45))
    lines.frustumCulled = false
    lines.renderOrder = 28
    return { lines, pos, col }
  }, [])
  const mirror = useMemo(() => new Environment(env), [env])
  const cur = useMemo(() => [0, 0, 0], [])
  useFrame(() => {
    const f = simClient.cur
    mirror.params = env
    mirror.time = f?.envTime ?? 0
    mirror.updateDrift()
    const L = f?.stats.largest
    const cx = L ? L.cx : camera.position.x
    const cz = L ? L.cz : camera.position.z
    const cy = L ? L.cy : camera.position.y
    const sp = 8
    const gx0 = Math.round(cx / sp) * sp
    const gz0 = Math.round(cz / sp) * sp
    let v = 0
    for (let ly = 0; ly < LY; ly++) {
      const y = Math.min(-1, cy + (ly - 0.5) * 7)
      for (let ix = 0; ix < N; ix++) {
        for (let iz = 0; iz < N; iz++) {
          const x = gx0 + (ix - (N - 1) / 2) * sp
          const z = gz0 + (iz - (N - 1) / 2) * sp
          mirror.currentAt(x, y, z, cur)
          const k = 5 // metres of arrow per (m/s) of flow
          const ex = x + cur[0] * k
          const ey = y + cur[1] * k
          const ez = z + cur[2] * k
          const hx = -cur[0] * k * 0.3
          const hz = -cur[2] * k * 0.3
          const sx = -hz * 0.5
          const sz = hx * 0.5
          const seg = [x, y, z, ex, ey, ez, ex, ey, ez, ex + hx + sx, ey, ez + hz + sz, ex, ey, ez, ex + hx - sx, ey, ez + hz - sz]
          pos.set(seg, v * 3)
          const speed = Math.hypot(cur[0], cur[2])
          const c = new THREE.Color().setHSL(0.55 - Math.min(0.5, speed) * 0.6, 0.8, 0.65)
          for (let q = 0; q < 6; q++) col.set([c.r, c.g, c.b], (v + q) * 3)
          v += 6
        }
      }
    }
    lines.geometry.setDrawRange(0, v)
    lines.geometry.attributes.position.needsUpdate = true
    lines.geometry.attributes.color.needsUpdate = true
  })
  return <primitive object={lines} />
}

/** Bounding spheres and labels for the detected schools. */
function SchoolMarkers() {
  const [top, setTop] = useState<SchoolInfo[]>([])
  useEffect(() => {
    const id = setInterval(() => setTop(simClient.cur?.stats.top ?? []), 500)
    return () => clearInterval(id)
  }, [])
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.08, depthWrite: false, fog: false }),
    [],
  )
  return (
    <group>
      {top.map((s, k) => (
        <group key={k} position={[s.cx, s.cy, s.cz]}>
          <mesh material={mat} scale={Math.max(1, s.radius * 1.5)}>
            <icosahedronGeometry args={[1, 2]} />
          </mesh>
          <Html center distanceFactor={30} position={[0, Math.max(1, s.radius * 1.5) + 0.6, 0]} style={{ pointerEvents: 'none' }}>
            <div className="whitespace-nowrap rounded-md bg-slate-950/60 px-2 py-0.5 text-[11px] text-white/85 backdrop-blur-sm">
              School {k + 1} · {s.count} fish · polarity {s.polarization.toFixed(2)}
            </div>
          </Html>
        </group>
      ))}
    </group>
  )
}

export function Overlays() {
  const o = useSimStore((s) => s.overlays)
  const anyForce = o.velocity || o.separation || o.alignment || o.cohesion || o.avoidance
  return (
    <>
      {anyForce && <ForceVectors />}
      {o.neighborhoods && <Neighborhood />}
      {o.currents && <CurrentField />}
      {o.schools && <SchoolMarkers />}
    </>
  )
}
