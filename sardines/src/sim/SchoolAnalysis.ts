import { BODY_LENGTH, MAX_NEIGHBORS, type SimParams } from './config.ts'
import type { PredatorSystem } from './PredatorSystem.ts'
import { ATTACK_STATES } from './PredatorSystem.ts'
import type { SardineSchool, SchoolBeacons } from './SardineSchool.ts'

export interface SchoolInfo {
  count: number
  cx: number
  cy: number
  cz: number
  /** Mean heading (unit-ish; its length is the polarization). */
  hx: number
  hy: number
  hz: number
  polarization: number
  /** Couzin rotation order parameter: ~1 for a mill, ~0 otherwise. */
  rotation: number
  /** RMS radius (m). */
  radius: number
  /** Spread along the heading divided by spread across it. */
  elongation: number
  /** Mean local packing density (fish / m^3). */
  density: number
  feeding: number
  alarmed: number
  /** Mean speed over ground of the school (m/s). */
  speed: number
}

export interface SimStats {
  fishCount: number
  schools: number
  stragglers: number
  avgSpeed: number
  avgNND: number
  density: number
  polarization: number
  rotation: number
  formation: string
  formationDetail: string
  predators: number
  predatorsHunting: number
  predatorsAttacking: number
  predatorActivity: string
  captures: number
  attempts: number
  feedingFraction: number
  alarmedFraction: number
  largest: SchoolInfo | null
  /** The biggest schools (for overlays and camera framing). */
  top: SchoolInfo[]
}

export const EMPTY_STATS: SimStats = {
  fishCount: 0,
  schools: 0,
  stragglers: 0,
  avgSpeed: 0,
  avgNND: 0,
  density: 0,
  polarization: 0,
  rotation: 0,
  formation: '—',
  formationDetail: '',
  predators: 0,
  predatorsHunting: 0,
  predatorsAttacking: 0,
  predatorActivity: 'None',
  captures: 0,
  attempts: 0,
  feedingFraction: 0,
  alarmedFraction: 0,
  largest: null,
  top: [],
}

/**
 * Detects schools by single-linkage clustering of each fish's perceived
 * neighbours (union–find), then computes order parameters per school.
 */
export class SchoolAnalysis {
  parent: Int32Array
  /** Cluster index per fish (into `schools`), or -1 for stragglers. */
  label: Int32Array
  schools: SchoolInfo[] = []
  beacons: SchoolBeacons
  private rootToCluster: Int32Array
  private acc: Float64Array
  private static readonly A = 16

  constructor(capacity: number) {
    this.parent = new Int32Array(capacity)
    this.label = new Int32Array(capacity).fill(-1)
    this.beacons = { n: 0, data: new Float32Array(16 * 4), label: this.label }
    this.rootToCluster = new Int32Array(capacity)
    this.acc = new Float64Array(capacity * SchoolAnalysis.A)
  }

  private find(i: number) {
    const p = this.parent
    while (p[i] !== i) {
      p[i] = p[p[i]]
      i = p[i]
    }
    return i
  }

  analyze(school: SardineSchool, params: SimParams, preds: PredatorSystem): SimStats {
    const n = school.count
    const parent = this.parent
    for (let i = 0; i < n; i++) parent[i] = i
    const link = Math.max(1.2, params.school.preferredSpacing * BODY_LENGTH * 7)
    const M = MAX_NEIGHBORS
    for (let i = 0; i < n; i++) {
      const c = school.nbrCount[i]
      for (let k = 0; k < c; k++) {
        const j = school.nbr[i * M + k]
        if (j >= n || school.nbrDist[i * M + k] > link) continue
        const a = this.find(i)
        const b = this.find(j)
        if (a !== b) parent[a] = b
      }
    }
    const r2c = this.rootToCluster
    r2c.fill(-1, 0, n)
    const A = SchoolAnalysis.A
    const acc = this.acc
    let nc = 0
    const label = this.label
    const pos = school.pos
    const dir = school.dir
    let speedSum = 0
    let nndSum = 0
    let nndN = 0
    let feedN = 0
    let alarmN = 0
    let gx = 0
    let gy = 0
    let gz = 0
    for (let i = 0; i < n; i++) {
      const r = this.find(i)
      let c = r2c[r]
      if (c < 0) {
        c = r2c[r] = nc++
        acc.fill(0, c * A, c * A + A)
      }
      label[i] = c
      const o = c * A
      const i3 = i * 3
      acc[o] += 1
      acc[o + 1] += pos[i3]
      acc[o + 2] += pos[i3 + 1]
      acc[o + 3] += pos[i3 + 2]
      acc[o + 4] += dir[i3]
      acc[o + 5] += dir[i3 + 1]
      acc[o + 6] += dir[i3 + 2]
      const kc = school.nbrCount[i]
      if (kc >= 3) {
        const kd = Math.max(0.03, school.kthDist[i])
        acc[o + 7] += (kc + 1) / ((4 / 3) * Math.PI * kd * kd * kd)
        acc[o + 8] += 1
      }
      const f = school.food[i] > 0 ? 1 : 0
      const al = school.alarm[i] > 0.2 ? 1 : 0
      acc[o + 9] += f
      acc[o + 10] += al
      acc[o + 11] += school.speed[i]
      feedN += f
      alarmN += al
      speedSum += school.speed[i]
      gx += dir[i3]
      gy += dir[i3 + 1]
      gz += dir[i3 + 2]
      if (kc > 0) {
        nndSum += school.nearest[i]
        nndN++
      }
    }
    // second pass: spread and rotation (relative to each cluster centroid)
    for (let c = 0; c < nc; c++) {
      const o = c * A
      const m = acc[o]
      acc[o + 1] /= m
      acc[o + 2] /= m
      acc[o + 3] /= m
      acc[o + 12] = 0
      acc[o + 13] = 0
      acc[o + 14] = 0
      acc[o + 15] = 0
    }
    // reuse slots 12..15: along^2, total^2, rotation sum (projected on mean axis), r count
    const rot = new Float64Array(nc * 3)
    for (let i = 0; i < n; i++) {
      const c = label[i]
      const o = c * A
      if (acc[o] < 12) continue
      const i3 = i * 3
      const dx = pos[i3] - acc[o + 1]
      const dy = pos[i3 + 1] - acc[o + 2]
      const dz = pos[i3 + 2] - acc[o + 3]
      const hl = Math.hypot(acc[o + 4], acc[o + 5], acc[o + 6]) || 1
      const along = (dx * acc[o + 4] + dy * acc[o + 5] + dz * acc[o + 6]) / hl
      const d2 = dx * dx + dy * dy + dz * dz
      acc[o + 12] += along * along
      acc[o + 13] += d2
      const d = Math.sqrt(d2) || 1
      const rx = dx / d
      const ry = dy / d
      const rz = dz / d
      rot[c * 3] += ry * dir[i3 + 2] - rz * dir[i3 + 1]
      rot[c * 3 + 1] += rz * dir[i3] - rx * dir[i3 + 2]
      rot[c * 3 + 2] += rx * dir[i3 + 1] - ry * dir[i3]
    }
    const schools: SchoolInfo[] = []
    let stragglers = 0
    const MIN = 12
    for (let c = 0; c < nc; c++) {
      const o = c * A
      const m = acc[o]
      if (m < MIN) {
        stragglers += m
        continue
      }
      const hx = acc[o + 4] / m
      const hy = acc[o + 5] / m
      const hz = acc[o + 6] / m
      const along2 = acc[o + 12] / m
      const tot2 = acc[o + 13] / m
      const perp2 = Math.max(1e-6, (tot2 - along2) / 2)
      schools.push({
        count: m,
        cx: acc[o + 1],
        cy: acc[o + 2],
        cz: acc[o + 3],
        hx,
        hy,
        hz,
        polarization: Math.hypot(hx, hy, hz),
        rotation: Math.hypot(rot[c * 3], rot[c * 3 + 1], rot[c * 3 + 2]) / m,
        radius: Math.sqrt(tot2),
        elongation: Math.sqrt(along2 / perp2),
        density: acc[o + 8] > 0 ? acc[o + 7] / acc[o + 8] : 0,
        feeding: acc[o + 9] / m,
        alarmed: acc[o + 10] / m,
        speed: acc[o + 11] / m,
      })
    }
    // relabel to sorted order
    const order = schools.map((s, k) => ({ s, k })).sort((a, b) => b.s.count - a.s.count)
    const clusterToSorted = new Int32Array(nc).fill(-1)
    {
      // map original cluster ids of retained schools -> sorted index
      let k = 0
      const retained: number[] = []
      for (let c = 0; c < nc; c++) if (acc[c * A] >= MIN) retained.push(c)
      for (const { k: orig } of order) clusterToSorted[retained[orig]] = k++
    }
    for (let i = 0; i < n; i++) label[i] = clusterToSorted[label[i]]
    this.schools = order.map((o) => o.s)

    // beacons: large aggregations visible from afar to isolated fish
    const b = this.beacons
    b.n = 0
    for (const s of this.schools) {
      if (s.count < 20 || b.n >= 16) break
      const o = b.n * 4
      b.data[o] = s.cx
      b.data[o + 1] = s.cy
      b.data[o + 2] = s.cz
      b.data[o + 3] = s.count
      b.n++
    }

    // global stats
    const largest = this.schools[0] ?? null
    let hunting = 0
    let attacking = 0
    for (const p of preds.predators) {
      if (ATTACK_STATES.has(p.state)) attacking++
      if (p.state === 'herd' || p.state === 'stalk' || p.state === 'approach' || ATTACK_STATES.has(p.state)) hunting++
    }
    let density = 0
    let densN = 0
    for (const s of this.schools) {
      density += s.density * s.count
      densN += s.count
    }
    density = densN > 0 ? density / densN : 0
    const [formation, detail] = classify(largest, params, attacking + hunting > 0)
    const npred = preds.predators.length
    let activity = 'None'
    if (npred > 0) {
      if (attacking > 0) activity = `${attacking} attacking`
      else if (preds.predators.some((p) => p.state === 'herd')) activity = 'Herding'
      else if (hunting > 0) activity = 'Stalking / approaching'
      else activity = 'Patrolling'
    }
    return {
      fishCount: n,
      schools: this.schools.length,
      stragglers,
      avgSpeed: n > 0 ? speedSum / n : 0,
      avgNND: nndN > 0 ? nndSum / nndN : 0,
      density,
      polarization: n > 0 ? Math.hypot(gx, gy, gz) / n : 0,
      rotation: largest ? largest.rotation : 0,
      formation,
      formationDetail: detail,
      predators: npred,
      predatorsHunting: hunting,
      predatorsAttacking: attacking,
      predatorActivity: activity,
      captures: preds.totalCaptures,
      attempts: preds.totalAttempts,
      feedingFraction: n > 0 ? feedN / n : 0,
      alarmedFraction: n > 0 ? alarmN / n : 0,
      largest,
      top: this.schools.slice(0, 8),
    }
  }
}

/** Label the dominant collective state from measured order parameters. */
function classify(s: SchoolInfo | null, params: SimParams, predatorsEngaged: boolean): [string, string] {
  if (!s) return ['Dispersed', 'No cohesive school detected — fish are scattered.']
  const spacing = params.school.preferredSpacing * BODY_LENGTH
  const relaxed = 0.75 / (spacing * spacing * spacing)
  const dense = s.density > relaxed * 1.8
  if (predatorsEngaged && dense && s.alarmed > 0.25 && s.count >= 60)
    return [
      'Bait ball',
      s.polarization < 0.55
        ? 'A compact, swirling defensive aggregation under predator pressure.'
        : 'A compact defensive aggregation under pressure, still moving as one polarized mass.',
    ]
  if (s.alarmed > 0.35) return ['Evasive manoeuvres', 'Escape responses are spreading through the school.']
  if (s.rotation > 0.5 && s.polarization < 0.45) return ['Milling', 'Fish circulate around a common centre (high rotational order).']
  if (s.feeding > 0.3) return ['Foraging', 'Spacing loosens and headings diverge while feeding.']
  if (s.polarization > 0.65) {
    if (dense) return ['Dense school', 'Tightly packed and well aligned.']
    if (s.elongation > 1.8) return ['Elongated school', 'Stretched along the direction of travel.']
    return ['Traveling school', 'Coordinated, polarized swimming in a common direction.']
  }
  return ['Shoaling', 'Fish stay together socially without a shared heading.']
}
