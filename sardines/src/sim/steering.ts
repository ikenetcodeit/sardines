/**
 * Behavioural steering helpers shared by sardines and predators.
 * All functions operate on plain numbers / typed arrays (no allocation).
 */

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v
}

export function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Rotate unit vector `d` (at arr[o..o+2]) toward desired direction (dx,dy,dz)
 * by at most `maxAngle` radians, writing the result into out[oo..oo+2].
 * Returns the angle actually turned.
 */
export function rotateToward(
  arr: Float32Array | number[],
  o: number,
  dx: number,
  dy: number,
  dz: number,
  maxAngle: number,
  out: Float32Array | number[],
  oo: number,
): number {
  const ax = arr[o]
  const ay = arr[o + 1]
  const az = arr[o + 2]
  let dl = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (dl < 1e-6) {
    out[oo] = ax
    out[oo + 1] = ay
    out[oo + 2] = az
    return 0
  }
  dx /= dl
  dy /= dl
  dz /= dl
  let c = ax * dx + ay * dy + az * dz
  if (c > 1) c = 1
  else if (c < -1) c = -1
  const ang = Math.acos(c)
  if (ang <= maxAngle) {
    out[oo] = dx
    out[oo + 1] = dy
    out[oo + 2] = dz
    return ang
  }
  // Perpendicular component of desired relative to current.
  let px = dx - ax * c
  let py = dy - ay * c
  let pz = dz - az * c
  dl = Math.sqrt(px * px + py * py + pz * pz)
  if (dl < 1e-6) {
    // Desired is exactly opposite: turn around the vertical axis.
    px = -az
    py = 0
    pz = ax
    dl = Math.sqrt(px * px + pz * pz) || 1
  }
  px /= dl
  py /= dl
  pz /= dl
  const cs = Math.cos(maxAngle)
  const sn = Math.sin(maxAngle)
  out[oo] = ax * cs + px * sn
  out[oo + 1] = ay * cs + py * sn
  out[oo + 2] = az * cs + pz * sn
  return maxAngle
}

/** Limit the pitch of a unit direction so swimmers never point straight up/down. */
export function limitPitch(arr: Float32Array | number[], o: number, maxSin: number) {
  const y = arr[o + 1]
  if (y > maxSin || y < -maxSin) {
    const ny = y > 0 ? maxSin : -maxSin
    const h = Math.sqrt(arr[o] * arr[o] + arr[o + 2] * arr[o + 2])
    const k = h > 1e-6 ? Math.sqrt(1 - ny * ny) / h : 0
    if (k === 0) {
      arr[o] = Math.sqrt(1 - ny * ny)
      arr[o + 2] = 0
    } else {
      arr[o] *= k
      arr[o + 2] *= k
    }
    arr[o + 1] = ny
  }
}

/**
 * Threat posed by a predator to a fish, combining distance, approach
 * (closing) speed, the predator's conspicuity and the fish's exposure.
 * Returns 0–~1.5.
 */
export function predatorThreat(
  dist: number,
  range: number,
  approachSpeed: number,
  conspicuity: number,
  exposure: number,
  attacking: boolean,
) {
  if (dist >= range) return 0
  const prox = Math.pow(1 - dist / range, 1.25)
  const af = clamp(0.45 + approachSpeed / 3, 0.2, 1.4)
  return prox * af * conspicuity * (0.7 + 0.5 * exposure) * (attacking ? 1.3 : 1)
}
