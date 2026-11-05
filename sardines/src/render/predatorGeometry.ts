import * as THREE from 'three'

type V3 = [number, number, number]

/** Minimal triangle-soup builder producing the attributes the swim shader expects. */
class Builder {
  pos: number[] = []
  nrm: number[] = []
  col: number[] = []
  s: number[] = []
  metal: number[] = []

  v(p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, m: number) {
    this.pos.push(p.x, p.y, p.z)
    this.nrm.push(n.x, n.y, n.z)
    this.col.push(c.r, c.g, c.b)
    this.metal.push(m)
    this.s.push(Math.max(0, Math.min(1.05, 0.5 - p.z)))
  }

  tri(a: V3, b: V3, c: V3, color: THREE.Color, m = 0.1) {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const vc = new THREE.Vector3(...c)
    const n = new THREE.Vector3().subVectors(vb, va).cross(new THREE.Vector3().subVectors(vc, va)).normalize()
    this.v(va, n, color, m)
    this.v(vb, n, color, m)
    this.v(vc, n, color, m)
  }

  /** Lofted body along -Z from s=0 (snout, z=+0.5) to s=end. */
  body(
    rings: number,
    segments: number,
    end: number,
    h: (s: number) => number,
    w: (s: number) => number,
    paint: (s: number, ct: number, st: number) => [THREE.Color, number],
  ) {
    const around = segments * 2
    const S: number[] = []
    for (let r = 0; r <= rings; r++) S.push(end * Math.pow(r / rings, 1.1))
    const P: THREE.Vector3[][] = []
    const N: THREE.Vector3[][] = []
    const C: [THREE.Color, number][][] = []
    for (let r = 0; r <= rings; r++) {
      const s = S[r]
      const hh = Math.max(0.003, h(s))
      const ww = Math.max(0.003, w(s))
      const ds = 0.01
      const dh = (h(Math.min(end, s + ds)) - h(Math.max(0, s - ds))) / (2 * ds)
      const row: THREE.Vector3[] = []
      const rowN: THREE.Vector3[] = []
      const rowC: [THREE.Color, number][] = []
      for (let a = 0; a < around; a++) {
        const th = (a / around) * Math.PI * 2
        const ct = Math.cos(th)
        const st = Math.sin(th)
        row.push(new THREE.Vector3(ww * st, hh * ct, 0.5 - s))
        rowN.push(new THREE.Vector3(st / ww, ct / hh, dh / Math.max(hh, 0.01)).normalize())
        rowC.push(paint(s, ct, st))
      }
      P.push(row)
      N.push(rowN)
      C.push(rowC)
    }
    for (let r = 0; r < rings; r++) {
      for (let a = 0; a < around; a++) {
        const a2 = (a + 1) % around
        for (const [ri, ai] of [
          [r, a],
          [r + 1, a],
          [r + 1, a2],
          [r, a],
          [r + 1, a2],
          [r, a2],
        ])
          this.v(P[ri][ai], N[ri][ai], C[ri][ai][0], C[ri][ai][1])
      }
    }
  }

  eye(s: number, x: number, y: number, r: number, color = new THREE.Color(0.02, 0.02, 0.03)) {
    for (const sx of [-1, 1]) {
      const n = new THREE.Vector3(sx, 0, 0)
      const z = 0.5 - s
      const k = 8
      for (let i = 0; i < k; i++) {
        const a1 = (i / k) * Math.PI * 2
        const a2 = ((i + 1) / k) * Math.PI * 2
        this.v(new THREE.Vector3(sx * x, y, z), n, color, 0.6)
        this.v(new THREE.Vector3(sx * x, y + Math.sin(a1) * r, z + Math.cos(a1) * r), n, color, 0.6)
        this.v(new THREE.Vector3(sx * x, y + Math.sin(a2) * r, z + Math.cos(a2) * r), n, color, 0.6)
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aS', new THREE.Float32BufferAttribute(this.s, 1))
    g.setAttribute('aMetal', new THREE.Float32BufferAttribute(this.metal, 1))
    g.computeBoundingSphere()
    return g
  }
}

const zs = (s: number) => 0.5 - s
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function dolphinGeometry() {
  const b = new Builder()
  const end = 0.88
  const h = (s: number) => {
    if (s < 0.07) return 0.012 + 0.012 * (s / 0.07)
    if (s < 0.16) return 0.024 + 0.06 * smooth(0.07, 0.16, s)
    if (s < 0.42) return 0.084 + 0.02 * smooth(0.16, 0.38, s)
    return 0.104 - 0.086 * smooth(0.42, end, s)
  }
  const w = (s: number) => h(s) * (s < 0.6 ? 0.85 : 0.85 - 0.45 * smooth(0.6, end, s))
  const dark = new THREE.Color(0.11, 0.13, 0.16)
  const tan = new THREE.Color(0.58, 0.5, 0.36)
  const grey = new THREE.Color(0.4, 0.43, 0.47)
  const white = new THREE.Color(0.86, 0.86, 0.85)
  b.body(28, 9, end, h, w, (s, ct) => {
    if (ct > 0.35 + 0.15 * Math.sin(s * 9)) return [dark, 0.08]
    if (ct < -0.25) return [white, 0.1]
    return [s < 0.48 ? tan : grey, 0.12]
  })
  // flukes (horizontal)
  for (const sx of [-1, 1]) {
    b.tri([0, 0, zs(0.86)], [sx * 0.07, 0, zs(0.9)], [sx * 0.16, 0, zs(1.0)], dark)
    b.tri([0, 0, zs(0.86)], [sx * 0.16, 0, zs(1.0)], [0, 0, zs(0.955)], dark)
    // flippers
    b.tri([sx * w(0.25) * 0.9, -0.045, zs(0.23)], [sx * (w(0.25) + 0.1), -0.1, zs(0.36)], [sx * w(0.3) * 0.9, -0.06, zs(0.31)], dark)
  }
  // dorsal fin (falcate)
  b.tri([0, h(0.4) * 0.95, zs(0.4)], [0, h(0.47) + 0.055, zs(0.47)], [0, h(0.56) * 0.95, zs(0.56)], dark)
  b.tri([0, h(0.47) + 0.055, zs(0.47)], [0, h(0.5) + 0.1, zs(0.57)], [0, h(0.56) * 0.95, zs(0.56)], dark)
  b.eye(0.13, w(0.13) + 0.002, 0.012, 0.008)
  return b.build()
}

export function sharkGeometry() {
  const b = new Builder()
  const end = 0.86
  const h = (s: number) => {
    if (s < 0.2) return 0.006 + 0.076 * Math.pow(s / 0.2, 0.6)
    if (s < 0.4) return 0.082 + 0.012 * smooth(0.2, 0.35, s)
    return 0.094 - 0.078 * smooth(0.4, end, s)
  }
  const w = (s: number) => h(s) * (s < 0.4 ? 0.95 : 0.95 - 0.35 * smooth(0.4, end, s))
  const top = new THREE.Color(0.36, 0.33, 0.27)
  const mid = new THREE.Color(0.5, 0.48, 0.42)
  const white = new THREE.Color(0.88, 0.88, 0.86)
  const slit = new THREE.Color(0.2, 0.19, 0.16)
  b.body(28, 9, end, h, w, (s, ct) => {
    if (s > 0.19 && s < 0.28 && ct > -0.3 && ct < 0.4 && Math.floor(s * 110) % 2 === 0) return [slit, 0.05]
    if (ct > 0.2) return [top, 0.1]
    if (ct > -0.15) return [mid, 0.1]
    return [white, 0.1]
  })
  // first dorsal
  b.tri([0, h(0.3) * 0.95, zs(0.3)], [0, h(0.36) + 0.13, zs(0.42)], [0, h(0.45) * 0.95, zs(0.45)], top)
  // second dorsal
  b.tri([0, h(0.7) * 0.95, zs(0.7)], [0, h(0.72) + 0.035, zs(0.76)], [0, h(0.77) * 0.95, zs(0.77)], top)
  // anal fin
  b.tri([0, -h(0.72) * 0.95, zs(0.72)], [0, -h(0.74) - 0.03, zs(0.79)], [0, -h(0.79) * 0.95, zs(0.79)], top)
  // pectoral fins
  for (const sx of [-1, 1]) {
    b.tri([sx * w(0.24) * 0.8, -0.045, zs(0.22)], [sx * (w(0.24) + 0.17), -0.12, zs(0.39)], [sx * w(0.33) * 0.8, -0.06, zs(0.34)], top)
    b.tri([sx * w(0.6) * 0.8, -h(0.6) * 0.8, zs(0.58)], [sx * (w(0.6) + 0.04), -h(0.6) - 0.03, zs(0.66)], [sx * w(0.64) * 0.8, -h(0.64) * 0.8, zs(0.64)], top)
  }
  // heterocercal tail
  b.tri([0, 0.015, zs(0.84)], [0, 0.175, zs(1.03)], [0, 0.005, zs(0.93)], top)
  b.tri([0, 0.015, zs(0.84)], [0, 0.005, zs(0.93)], [0, -0.015, zs(0.84)], top)
  b.tri([0, -0.015, zs(0.84)], [0, 0.005, zs(0.93)], [0, -0.095, zs(0.97)], top)
  b.eye(0.1, w(0.1) + 0.002, 0.03, 0.007)
  return b.build()
}

export function sailfishGeometry() {
  const b = new Builder()
  const end = 0.86
  const h = (s: number) => {
    if (s < 0.2) return 0.006 + 0.004 * (s / 0.2)
    if (s < 0.32) return 0.01 + 0.06 * smooth(0.2, 0.32, s)
    if (s < 0.5) return 0.07 + 0.01 * smooth(0.32, 0.45, s)
    return 0.08 - 0.066 * smooth(0.5, end, s)
  }
  const w = (s: number) => h(s) * 0.62
  const dorsal = new THREE.Color(0.06, 0.1, 0.22)
  const flank = new THREE.Color(0.52, 0.6, 0.7)
  const bar = new THREE.Color(0.62, 0.76, 0.92)
  const white = new THREE.Color(0.9, 0.91, 0.92)
  const sail = new THREE.Color(0.1, 0.15, 0.34)
  b.body(30, 8, end, h, w, (s, ct) => {
    if (ct > 0.45) return [dorsal, 0.3]
    if (ct < -0.35) return [white, 0.6]
    if (s > 0.3 && s < 0.8 && Math.floor(s * 26) % 2 === 0) return [bar, 0.75]
    return [flank, 0.75]
  })
  // the sail: a tall fan along the back
  const n = 8
  for (let i = 0; i < n; i++) {
    const s0 = 0.25 + (i / n) * 0.42
    const s1 = 0.25 + ((i + 1) / n) * 0.42
    const ht = (s: number) => 0.06 + 0.17 * Math.sin(Math.min(1, (s - 0.25) / 0.42) * Math.PI * 0.85)
    b.tri([0, h(s0) * 0.95, zs(s0)], [0, h(s0) + ht(s0), zs(s0 + 0.01)], [0, h(s1) * 0.95, zs(s1)], sail)
    b.tri([0, h(s1) * 0.95, zs(s1)], [0, h(s0) + ht(s0), zs(s0 + 0.01)], [0, h(s1) + ht(s1), zs(s1 + 0.01)], sail)
  }
  for (const sx of [-1, 1]) {
    // long pelvic fins
    b.tri([sx * 0.01, -h(0.34) * 0.95, zs(0.33)], [sx * 0.02, -h(0.34) - 0.02, zs(0.36)], [sx * 0.012, -h(0.4) - 0.06, zs(0.55)], dorsal)
    // pectorals
    b.tri([sx * w(0.33) * 0.9, -0.03, zs(0.32)], [sx * (w(0.33) + 0.08), -0.06, zs(0.44)], [sx * w(0.38) * 0.9, -0.04, zs(0.38)], dorsal)
  }
  // lunate tail
  b.tri([0, 0.012, zs(0.84)], [0, 0.16, zs(1.0)], [0, 0.006, zs(0.91)], dorsal)
  b.tri([0, 0.012, zs(0.84)], [0, 0.006, zs(0.91)], [0, -0.012, zs(0.84)], dorsal)
  b.tri([0, -0.012, zs(0.84)], [0, 0.006, zs(0.91)], [0, -0.15, zs(1.0)], dorsal)
  b.eye(0.24, w(0.24) + 0.002, 0.012, 0.008)
  return b.build()
}

export function gannetBodyGeometry() {
  const b = new Builder()
  const end = 1.0
  const h = (s: number) => {
    if (s < 0.14) return 0.008 + 0.016 * (s / 0.14)
    if (s < 0.3) return 0.024 + 0.05 * smooth(0.14, 0.28, s)
    if (s < 0.62) return 0.074 + 0.018 * smooth(0.3, 0.45, s)
    return 0.092 - 0.084 * smooth(0.62, end, s)
  }
  const w = (s: number) => h(s) * (s < 0.62 ? 1 : 1 + 1.6 * smooth(0.62, 0.95, s))
  const beak = new THREE.Color(0.55, 0.62, 0.7)
  const head = new THREE.Color(0.93, 0.83, 0.52)
  const white = new THREE.Color(0.95, 0.95, 0.94)
  const dark = new THREE.Color(0.08, 0.08, 0.09)
  b.body(24, 8, end, h, w, (s) => {
    if (s < 0.14) return [beak, 0.2]
    if (s < 0.3) return [head, 0.1]
    if (s > 0.9) return [dark, 0.1]
    return [white, 0.1]
  })
  b.eye(0.17, w(0.17) + 0.002, 0.012, 0.007)
  return b.build()
}

/** One wing, root at the origin, extending along +X; chord along Z. */
export function gannetWingGeometry() {
  const b = new Builder()
  const white = new THREE.Color(0.95, 0.95, 0.94)
  const black = new THREE.Color(0.05, 0.05, 0.06)
  const pts: [number, number, number][] = [
    [0, 0, 0.11], // root leading
    [0, 0, -0.11], // root trailing
    [0.55, 0, 0.07], // mid leading
    [0.55, 0, -0.1], // mid trailing
    [1.0, 0, -0.05], // tip
  ]
  b.tri(pts[0], pts[2], pts[1], white)
  b.tri(pts[1], pts[2], pts[3], white)
  b.tri(pts[2], pts[4], pts[3], black)
  const g = b.build()
  // wings don't bend with the swim shader
  ;(g.getAttribute('aS') as THREE.BufferAttribute).array.fill(0)
  return g
}

/** Irregular rock pinnacle (unit radius, unit height above base). */
export function rockGeometry(seed: number) {
  const g = new THREE.CylinderGeometry(0.75, 1.1, 1, 14, 10, false)
  g.translate(0, 0.5, 0)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const rnd = (x: number) => {
    const t = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453
    return t - Math.floor(t)
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const a = Math.atan2(z, x)
    const n =
      1 +
      0.18 * Math.sin(a * 3 + seed * 5 + y * 4) +
      0.1 * Math.sin(a * 7 + y * 9 + seed) +
      0.08 * (rnd(i * 0.37) - 0.5)
    const taper = y > 0.85 ? 1 - (y - 0.85) * 2.2 : 1
    p.setXYZ(i, x * n * taper, y + 0.04 * Math.sin(a * 5 + seed), z * n * taper)
  }
  g.computeVertexNormals()
  return g
}
