import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PredatorSpecies } from '../sim/config'
import { simClient } from '../sim/client'
import type { PredatorFrame } from '../sim/protocol'
import { createSwimMaterial } from './fishGeometry'
import { dolphinGeometry, gannetBodyGeometry, gannetWingGeometry, sailfishGeometry, sharkGeometry } from './predatorGeometry'
import { renderPredators } from './renderState'

const MAX_PRED = 12

interface Slot {
  group: THREE.Group
  body: THREE.Mesh
  wings: THREE.Group | null
  wingL: THREE.Mesh | null
  wingR: THREE.Mesh | null
  uniforms: { uSwim: { value: THREE.Vector4 } }
  species: PredatorSpecies | null
}

/**
 * Predators are few, so each gets its own mesh and material; swimming is the
 * same procedural undulation as the sardines (vertical for dolphins).
 */
export function Predators() {
  const geos = useMemo(
    () => ({
      dolphin: dolphinGeometry(),
      shark: sharkGeometry(),
      sailfish: sailfishGeometry(),
      seabird: gannetBodyGeometry(),
      wing: gannetWingGeometry(),
    }),
    [],
  )
  const root = useRef<THREE.Group>(null)
  const slots = useMemo<Slot[]>(() => {
    const out: Slot[] = []
    const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide })
    for (let k = 0; k < MAX_PRED; k++) {
      const { material, uniforms } = createSwimMaterial({
        instanced: false,
        params: { metalness: 0.15, roughness: 0.45, envMapIntensity: 0.9 },
      })
      const group = new THREE.Group()
      const body = new THREE.Mesh(geos.dolphin, material)
      group.add(body)
      const wings = new THREE.Group()
      const wingL = new THREE.Mesh(geos.wing, wingMat)
      const wingR = new THREE.Mesh(geos.wing, wingMat)
      wingL.scale.x = -1
      wings.add(wingL, wingR)
      wings.position.set(0, 0.03, 0.08)
      group.add(wings)
      group.visible = false
      out.push({ group, body, wings, wingL, wingR, uniforms, species: null })
    }
    return out
  }, [geos])

  const tmp = useMemo(
    () => ({
      f: new THREE.Vector3(),
      r: new THREE.Vector3(),
      u: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  useFrame(() => {
    const c = simClient.cur
    const p = simClient.prev
    if (!c) return
    const a = simClient.alpha(performance.now())
    const prevById = new Map<number, PredatorFrame>()
    if (p && p.version === c.version) for (const q of p.predators) prevById.set(q.id, q)
    renderPredators.length = 0
    for (let k = 0; k < MAX_PRED; k++) {
      const slot = slots[k]
      const cur = c.predators[k]
      if (!cur) {
        slot.group.visible = false
        continue
      }
      const prev = prevById.get(cur.id) ?? cur
      if (slot.species !== cur.species) {
        slot.species = cur.species
        slot.body.geometry = geos[cur.species]
        slot.wings!.visible = cur.species === 'seabird'
      }
      const b = 1 - a
      const x = prev.x * b + cur.x * a
      const y = prev.y * b + cur.y * a
      const z = prev.z * b + cur.z * a
      tmp.f.set(prev.dx * b + cur.dx * a, prev.dy * b + cur.dy * a, prev.dz * b + cur.dz * a).normalize()
      const roll = prev.roll * b + cur.roll * a
      tmp.r.crossVectors(tmp.up, tmp.f)
      if (tmp.r.lengthSq() < 1e-6) tmp.r.set(1, 0, 0)
      tmp.r.normalize()
      tmp.u.crossVectors(tmp.f, tmp.r)
      const cr = Math.cos(roll)
      const sr = Math.sin(roll)
      const rx = tmp.r.clone().multiplyScalar(cr).addScaledVector(tmp.u, sr)
      const ux = tmp.u.clone().multiplyScalar(cr).addScaledVector(tmp.r, -sr)
      const L = cur.length
      tmp.m.makeBasis(rx.multiplyScalar(L), ux.multiplyScalar(L), tmp.f.clone().multiplyScalar(L))
      tmp.m.setPosition(x, y, z)
      slot.group.matrixAutoUpdate = false
      slot.group.matrix.copy(tmp.m)
      slot.group.matrixWorldNeedsUpdate = true
      slot.group.visible = true
      const phase = prev.tailPhase * b + cur.tailPhase * a
      const attacking = cur.state === 'attack' || cur.state === 'slash'
      if (cur.species === 'seabird') {
        slot.uniforms.uSwim.value.set(0, 0, 0, 0)
        const fold = prev.wingFold * b + cur.wingFold * a
        const flap = cur.state === 'resting' ? 0 : Math.sin(phase * Math.PI * 2) * (cur.state === 'takeoff' ? 0.75 : 0.35)
        for (const [w, side] of [
          [slot.wingL!, -1],
          [slot.wingR!, 1],
        ] as const) {
          w.rotation.set(0, side * fold * 1.25, side * flap * (1 - fold))
          w.scale.set(side * (1.05 - 0.55 * fold), 1, 1)
        }
      } else {
        const vertical = cur.species === 'dolphin' ? 1 : 0
        const amp = (cur.species === 'shark' ? 0.06 : 0.05) * (attacking ? 1.5 : 1)
        slot.uniforms.uSwim.value.set(phase * Math.PI * 2, amp, 0, vertical)
      }
      renderPredators.push({
        id: cur.id,
        species: cur.species,
        state: cur.state,
        length: L,
        pos: new THREE.Vector3(x, y, z),
        dir: tmp.f.clone(),
        speed: cur.speed,
      })
    }
  }, -2)

  return (
    <group ref={root}>
      {slots.map((s, k) => (
        <primitive key={k} object={s.group} />
      ))}
    </group>
  )
}
