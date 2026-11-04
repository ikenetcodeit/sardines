// Spherical-linear-interpolates a unit direction toward a target unit
// direction, limited to `maxAngle` radians — this is what keeps turns
// looking like swimming rather than teleporting. Shared by sardines and
// predators since both are biomechanically turn-rate-limited swimmers.
export function rotateToward(
  curX: number, curY: number, curZ: number,
  targetX: number, targetY: number, targetZ: number,
  maxAngle: number,
): [number, number, number] {
  let dot = curX * targetX + curY * targetY + curZ * targetZ
  dot = Math.min(1, Math.max(-1, dot))
  const angle = Math.acos(dot)
  if (angle < 1e-5) return [targetX, targetY, targetZ]
  if (angle <= maxAngle) return [targetX, targetY, targetZ]

  const t = maxAngle / angle
  const sinAngle = Math.sin(angle)
  const a = Math.sin((1 - t) * angle) / sinAngle
  const b = Math.sin(t * angle) / sinAngle
  const x = a * curX + b * targetX
  const y = a * curY + b * targetY
  const z = a * curZ + b * targetZ
  const len = Math.sqrt(x * x + y * y + z * z) || 1
  return [x / len, y / len, z / len]
}
