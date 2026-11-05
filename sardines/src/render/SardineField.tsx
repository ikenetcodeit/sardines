import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BODY_LENGTH, MAX_FISH, QUALITY } from '../sim/config'
import { simClient } from '../sim/client'
import { ANIM_STRIDE } from '../sim/protocol'
import { useSimStore } from '../store/useSimStore'
import { createSardineGeometry, createSwimMaterial } from './fishGeometry'
import { renderFish, renderIndexOf } from './renderState'

const SCHOOL_COLORS = [0xffc857, 0x4cc9f0, 0xf72585, 0x80ed99, 0xb388eb, 0xff8c42, 0x48cae4, 0xe9ff70].map((c) => new THREE.Color(c))

/**
 * All sardines as one instanced mesh. Positions/orientations are interpolated
 * between the two latest simulation snapshots; tail-beat phase is advanced
 * continuously so swimming looks smooth even in slow motion.
 */
export function SardineField() {
  const quality = useSimStore((s) => s.quality)
  const showSchools = useSimStore((s) => s.overlays.schools)
  const preset = QUALITY[quality]
  const { material } = useMemo(() => createSwimMaterial({ instanced: true }), [])
  const mesh = useMemo(() => {
    const g = createSardineGeometry(preset.fishRings, preset.fishSegments)
    const swim = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH * 4), 4)
    swim.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('aSwim', swim)
    const m = new THREE.InstancedMesh(g, material, MAX_FISH)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH * 3).fill(1), 3)
    m.instanceColor.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    m.count = 0
    return m
  }, [preset.fishRings, preset.fishSegments, material])
  useEffect(() => () => mesh.geometry.dispose(), [mesh])
  const colorsDirty = useRef(true)
  useEffect(() => {
    colorsDirty.current = true
  }, [showSchools])

  useFrame(() => {
    const c = simClient.cur
    if (!c) return
    const p = simClient.prev
    const a = simClient.alpha(performance.now())
    const n = c.count
    const same = !!p && p.version === c.version && p !== c
    const dtSim = same ? c.simTime - p!.simTime : 0
    const m = mesh.instanceMatrix.array as Float32Array
    const swim = (mesh.geometry.getAttribute('aSwim') as THREE.InstancedBufferAttribute).array as Float32Array
    const RP = renderFish
    const ca = c.anim
    const pa = p?.anim
    const cp = c.pos
    const cd = c.dir
    const pp = p?.pos
    const pd = p?.dir
    const b = 1 - a
    for (let i = 0; i < n; i++) {
      const i3 = i * 3
      const o = i * ANIM_STRIDE
      const useP = same && i < p!.count && p!.ids[i] === c.ids[i]
      let x = cp[i3]
      let y = cp[i3 + 1]
      let z = cp[i3 + 2]
      let fx = cd[i3]
      let fy = cd[i3 + 1]
      let fz = cd[i3 + 2]
      let roll = ca[o]
      let bend = ca[o + 4]
      if (useP) {
        x = pp![i3] * b + x * a
        y = pp![i3 + 1] * b + y * a
        z = pp![i3 + 2] * b + z * a
        fx = pd![i3] * b + fx * a
        fy = pd![i3 + 1] * b + fy * a
        fz = pd![i3 + 2] * b + fz * a
        const l = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1
        fx /= l
        fy /= l
        fz /= l
        roll = pa![o] * b + roll * a
        bend = pa![o + 4] * b + bend * a
      }
      RP.ids[i] = c.ids[i]
      RP.pos[i3] = x
      RP.pos[i3 + 1] = y
      RP.pos[i3 + 2] = z
      RP.dir[i3] = fx
      RP.dir[i3 + 1] = fy
      RP.dir[i3 + 2] = fz
      RP.speed[i] = ca[o + 8]
      // basis: forward f, right = up x f, up' = f x right; then roll about f
      let rx = fz
      let rz = -fx
      const rl = Math.sqrt(rx * rx + rz * rz) || 1
      rx /= rl
      rz /= rl
      let ux = fy * rz
      let uy = fz * rx - fx * rz
      let uz = -fy * rx
      const cr = Math.cos(roll)
      const sr = Math.sin(roll)
      const r2x = rx * cr + ux * sr
      const r2y = uy * sr
      const r2z = rz * cr + uz * sr
      ux = ux * cr - rx * sr
      uy = uy * cr
      uz = uz * cr - rz * sr
      const s = BODY_LENGTH * ca[o + 7]
      const e = i * 16
      m[e] = r2x * s
      m[e + 1] = r2y * s
      m[e + 2] = r2z * s
      m[e + 3] = 0
      m[e + 4] = ux * s
      m[e + 5] = uy * s
      m[e + 6] = uz * s
      m[e + 7] = 0
      m[e + 8] = fx * s
      m[e + 9] = fy * s
      m[e + 10] = fz * s
      m[e + 11] = 0
      m[e + 12] = x
      m[e + 13] = y
      m[e + 14] = z
      m[e + 15] = 1
      const w = i * 4
      swim[w] = ca[o + 1] - Math.PI * 2 * ca[o + 2] * b * dtSim
      swim[w + 1] = ca[o + 3]
      swim[w + 2] = bend
      swim[w + 3] = 0
    }
    RP.count = n
    mesh.count = n
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceMatrix.addUpdateRange(0, n * 16)
    mesh.instanceMatrix.needsUpdate = true
    const sa = mesh.geometry.getAttribute('aSwim') as THREE.InstancedBufferAttribute
    sa.clearUpdateRanges()
    sa.addUpdateRange(0, n * 4)
    sa.needsUpdate = true

    const col = mesh.instanceColor!
    if (showSchools && c.labels) {
      const arr = col.array as Float32Array
      for (let i = 0; i < n; i++) {
        const l = c.labels[i]
        if (l < 0) {
          arr[i * 3] = 0.35
          arr[i * 3 + 1] = 0.35
          arr[i * 3 + 2] = 0.35
        } else {
          const cc = SCHOOL_COLORS[l % SCHOOL_COLORS.length]
          arr[i * 3] = cc.r * 1.4
          arr[i * 3 + 1] = cc.g * 1.4
          arr[i * 3 + 2] = cc.b * 1.4
        }
      }
      col.needsUpdate = true
      colorsDirty.current = true
    } else if (colorsDirty.current) {
      ;(col.array as Float32Array).fill(1)
      col.needsUpdate = true
      colorsDirty.current = false
    }
  }, -2)

  return <primitive object={mesh} />
}

/** A soft ring marking the selected fish. */
export function SelectionMarker() {
  const selectedId = useSimStore((s) => s.selectedId)
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [],
  )
  useFrame(({ camera }) => {
    const m = ref.current
    if (!m) return
    const i = selectedId >= 0 ? renderIndexOf(selectedId) : -1
    m.visible = i >= 0
    if (i < 0) return
    m.position.set(renderFish.pos[i * 3], renderFish.pos[i * 3 + 1], renderFish.pos[i * 3 + 2])
    m.quaternion.copy(camera.quaternion)
    const d = camera.position.distanceTo(m.position)
    m.scale.setScalar(Math.max(0.25, d * 0.03))
    mat.opacity = 0.55 + 0.3 * Math.sin(performance.now() * 0.006)
  }, -1)
  return (
    <mesh ref={ref} material={mat} renderOrder={20}>
      <ringGeometry args={[0.9, 1.0, 40]} />
    </mesh>
  )
}
