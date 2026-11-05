import * as THREE from 'three'

/**
 * Procedural sardine (Sardinops-like) geometry, 1 unit long, head at +Z.
 * Extra attributes:
 *   aS     — position along the body (0 = snout, 1 = tail tip), drives bending
 *   aMetal — how mirror-like the surface is (silver flanks vs dark back)
 */
export function createSardineGeometry(rings: number, segments: number) {
  const pos: number[] = []
  const col: number[] = []
  const sAttr: number[] = []
  const metal: number[] = []
  const nrm: number[] = []

  const dorsal = new THREE.Color(0.07, 0.17, 0.25)
  const band = new THREE.Color(0.35, 0.5, 0.62)
  const flank = new THREE.Color(0.86, 0.9, 0.92)
  const belly = new THREE.Color(0.95, 0.96, 0.96)
  const fin = new THREE.Color(0.42, 0.5, 0.54)
  const eyeDark = new THREE.Color(0.02, 0.02, 0.03)
  const eyeRing = new THREE.Color(0.75, 0.68, 0.45)

  const bodyEnd = 0.86
  const h = (s: number) => {
    if (s < 0.3) return 0.004 + 0.098 * Math.pow(Math.sin((s / 0.3) * Math.PI * 0.5), 0.75)
    if (s < 0.46) return 0.102
    const t = Math.min(1, (s - 0.46) / (bodyEnd - 0.46))
    const k = t * t * (3 - 2 * t)
    return 0.102 + (0.017 - 0.102) * k
  }
  const w = (s: number) => h(s) * (s < 0.12 ? 0.62 : 0.54)

  // ---- body (indexed grid, converted to triangles) ----
  const around = segments * 2
  const ringS: number[] = []
  for (let r = 0; r <= rings; r++) {
    const u = r / rings
    // more rings near snout and peduncle
    ringS.push(bodyEnd * (u < 0.5 ? 0.5 * Math.pow(u * 2, 1.35) : 1 - 0.5 * Math.pow((1 - u) * 2, 1.15)))
  }
  const grid: THREE.Vector3[][] = []
  const gridN: THREE.Vector3[][] = []
  const gridC: THREE.Color[][] = []
  const gridM: number[][] = []
  for (let r = 0; r <= rings; r++) {
    const s = ringS[r]
    const hh = h(s)
    const ww = w(s)
    const row: THREE.Vector3[] = []
    const rowN: THREE.Vector3[] = []
    const rowC: THREE.Color[] = []
    const rowM: number[] = []
    for (let a = 0; a < around; a++) {
      const th = (a / around) * Math.PI * 2
      const ct = Math.cos(th)
      const st = Math.sin(th)
      const yScale = ct < 0 ? 1.06 : 0.94
      const v = new THREE.Vector3(ww * st, hh * ct * yScale - 0.004, 0.5 - s)
      row.push(v)
      // approximate normal of an ellipse cross-section (+ slight forward lean near the snout)
      const n = new THREE.Vector3(st / Math.max(ww, 1e-3), (ct / Math.max(hh, 1e-3)) * yScale, s < 0.15 ? 18 * (0.15 - s) : 0)
      if (s > 0.46) n.z = -((0.102 - 0.017) / (bodyEnd - 0.46)) * 4
      rowN.push(n.normalize())
      let c: THREE.Color
      let m: number
      if (ct > 0.62) {
        c = dorsal.clone()
        m = 0.25
      } else if (ct > 0.3) {
        const t = (ct - 0.3) / 0.32
        c = band.clone().lerp(dorsal, t)
        m = 0.55 + 0.25 * (1 - t)
      } else if (ct > -0.45) {
        const t = (0.3 - ct) / 0.75
        c = flank.clone().lerp(belly, Math.max(0, t - 0.6) * 1.5)
        m = 1.0
      } else {
        c = belly.clone()
        m = 0.7
      }
      // faint row of dark spots along the upper flank (characteristic of Sardinops)
      if (ct > 0.28 && ct < 0.45 && s > 0.22 && s < 0.62 && r % 2 === 0) {
        c = c.clone().multiplyScalar(0.55)
        m *= 0.6
      }
      // gill cover edge
      if (s > 0.19 && s < 0.215) c = c.clone().multiplyScalar(0.82)
      rowC.push(c)
      rowM.push(m)
    }
    grid.push(row)
    gridN.push(rowN)
    gridC.push(rowC)
    gridM.push(rowM)
  }
  const pushV = (v: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, m: number, s: number) => {
    pos.push(v.x, v.y, v.z)
    nrm.push(n.x, n.y, n.z)
    col.push(c.r, c.g, c.b)
    metal.push(m)
    sAttr.push(s)
  }
  for (let r = 0; r < rings; r++) {
    for (let a = 0; a < around; a++) {
      const a2 = (a + 1) % around
      const quad = [
        [r, a],
        [r + 1, a],
        [r + 1, a2],
        [r, a],
        [r + 1, a2],
        [r, a2],
      ]
      for (const [ri, ai] of quad) pushV(grid[ri][ai], gridN[ri][ai], gridC[ri][ai], gridM[ri][ai], ringS[ri])
    }
  }
  // cap the peduncle
  {
    const r = rings
    const c = new THREE.Vector3(0, -0.004, 0.5 - bodyEnd)
    for (let a = 0; a < around; a++) {
      const a2 = (a + 1) % around
      const n = new THREE.Vector3(0, 0, -1)
      pushV(c, n, fin, 0.3, bodyEnd)
      pushV(grid[r][a2], n, gridC[r][a2], 0.3, bodyEnd)
      pushV(grid[r][a], n, gridC[r][a], 0.3, bodyEnd)
    }
  }

  // ---- fins (rendered double-sided) ----
  const tri = (a: number[], b: number[], c: number[], color: THREE.Color, m: number) => {
    const va = new THREE.Vector3(...(a as [number, number, number]))
    const vb = new THREE.Vector3(...(b as [number, number, number]))
    const vc = new THREE.Vector3(...(c as [number, number, number]))
    const n = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize()
    for (const v of [va, vb, vc]) pushV(v, n, color, m, Math.max(0, Math.min(1.05, 0.5 - v.z)))
  }
  const zs = (s: number) => 0.5 - s
  // forked caudal fin
  const pt = 0.018
  tri([0, pt, zs(0.85)], [0, 0.118, zs(1.02)], [0, 0.004, zs(0.93)], fin, 0.35)
  tri([0, pt, zs(0.85)], [0, 0.004, zs(0.93)], [0, -pt, zs(0.85)], fin, 0.35)
  tri([0, -pt, zs(0.85)], [0, 0.004, zs(0.93)], [0, -0.112, zs(1.02)], fin, 0.35)
  // dorsal fin
  tri([0, h(0.38) * 0.94, zs(0.38)], [0, h(0.4) + 0.07, zs(0.44)], [0, h(0.52) * 0.94, zs(0.52)], fin, 0.3)
  // anal fin
  tri([0, -h(0.68) * 1.02, zs(0.68)], [0, -h(0.72) - 0.03, zs(0.79)], [0, -h(0.8) * 1.02, zs(0.8)], fin, 0.3)
  // pelvic fins
  for (const sx of [-1, 1]) {
    tri([sx * 0.02, -h(0.5) * 0.95, zs(0.48)], [sx * 0.05, -h(0.5) - 0.03, zs(0.58)], [sx * 0.015, -h(0.56) * 0.95, zs(0.56)], fin, 0.4)
    // pectoral fins
    tri([sx * w(0.21) * 0.9, -0.05, zs(0.2)], [sx * (w(0.21) + 0.045), -0.085, zs(0.31)], [sx * w(0.24) * 0.9, -0.07, zs(0.26)], fin, 0.5)
  }
  // eyes: small discs on each side of the head
  const eyeS = 0.075
  const eyeY = 0.022
  const eyeR = 0.019
  const seg = Math.max(6, segments)
  for (const sx of [-1, 1]) {
    const cx = sx * (w(eyeS) + 0.002)
    const center = [cx + sx * 0.003, eyeY, zs(eyeS)]
    const n = new THREE.Vector3(sx, 0.1, 0.25).normalize()
    for (let k = 0; k < seg; k++) {
      const a1 = (k / seg) * Math.PI * 2
      const a2 = ((k + 1) / seg) * Math.PI * 2
      const p1 = new THREE.Vector3(cx, eyeY + Math.sin(a1) * eyeR, zs(eyeS) + Math.cos(a1) * eyeR)
      const p2 = new THREE.Vector3(cx, eyeY + Math.sin(a2) * eyeR, zs(eyeS) + Math.cos(a2) * eyeR)
      const q1 = new THREE.Vector3(cx + sx * 0.002, eyeY + Math.sin(a1) * eyeR * 0.55, zs(eyeS) + Math.cos(a1) * eyeR * 0.55)
      const q2 = new THREE.Vector3(cx + sx * 0.002, eyeY + Math.sin(a2) * eyeR * 0.55, zs(eyeS) + Math.cos(a2) * eyeR * 0.55)
      const c = new THREE.Vector3(...(center as [number, number, number]))
      // ring
      for (const v of [p1, p2, q2, p1, q2, q1]) pushV(v, n, eyeRing, 0.9, eyeS)
      // pupil
      for (const v of [q1, q2, c]) pushV(v, n, eyeDark, 0.1, eyeS)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sAttr, 1))
  g.setAttribute('aMetal', new THREE.Float32BufferAttribute(metal, 1))
  g.computeBoundingSphere()
  return g
}

/**
 * Injects procedural swimming into a standard PBR material:
 * a travelling lateral wave whose amplitude grows toward the tail
 * (body bending diminishes toward the head), plus whole-body curvature
 * while turning. Per-instance attribute aSwim = (phase, amplitude, bend, 0).
 */
export function createSwimMaterial(opts: { instanced: boolean; params?: THREE.MeshStandardMaterialParameters }) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.95,
    roughness: 0.24,
    envMapIntensity: 1.25,
    side: THREE.DoubleSide,
    ...opts.params,
  })
  const uniforms = {
    uSwim: { value: new THREE.Vector4(0, 0.06, 0, 0) },
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute float aS;
        attribute float aMetal;
        ${opts.instanced ? 'attribute vec4 aSwim;' : 'uniform vec4 uSwim;'}
        varying float vMetal;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        vec4 swim = ${opts.instanced ? 'aSwim' : 'uSwim'};
        float fs = aS;
        float fenv = 0.07 + fs * fs * 1.05;
        float fk = 6.2831853 * 0.95;
        float fwave = swim.x - fk * fs;
        float fdisp = swim.y * fenv * sin(fwave) + swim.z * fs * fs;
        float fslope = swim.y * (2.1 * fs * sin(fwave) - fenv * cos(fwave) * fk) + swim.z * 2.0 * fs;
        // w > 0.5: vertical (dolphin-style) undulation instead of lateral
        vec3 faxis = swim.w > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 objectNormal = vec3(normal);
        objectNormal.z += fslope * dot(objectNormal, faxis);
        objectNormal = normalize(objectNormal);
        vMetal = aMetal;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = vec3(position);
        transformed += faxis * fdisp;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMetal;')
      .replace(
        '#include <metalnessmap_fragment>',
        /* glsl */ `#include <metalnessmap_fragment>
        metalnessFactor *= vMetal;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor + 0.25, roughnessFactor, vMetal);`,
      )
  }
  mat.customProgramCacheKey = () => (opts.instanced ? 'swim-inst' : 'swim-single')
  return { material: mat, uniforms }
}
