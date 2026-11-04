import * as THREE from 'three'

// Nose points toward local -Z, matching Object3D.lookAt's -Z-forward convention,
// so instances can be oriented directly from a lookAt target with no extra rotation.
export function createBodyGeometry(radialSegments = 8): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.001, -0.5), // tail base
    new THREE.Vector2(0.09, -0.32),
    new THREE.Vector2(0.15, -0.06),
    new THREE.Vector2(0.155, 0.06),
    new THREE.Vector2(0.1, 0.26),
    new THREE.Vector2(0.001, 0.46), // nose tip
  ]
  const geometry = new THREE.LatheGeometry(profile, radialSegments)
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()
  applyDorsalVentralShading(geometry)
  return geometry
}

const DORSAL_COLOR = new THREE.Color('#5c6b74') // darker top, seen from above
const VENTRAL_COLOR = new THREE.Color('#e8eef0') // bright silver belly, seen from below

// Real sardines are countershaded: dark above, pale below. A lathe-revolved
// body is radially symmetric, but after the -90° rotation above, a given
// cross-section's local y-coordinate divided by its radius is exactly
// sin(theta) of the revolve angle — i.e. a clean -1..1 top/bottom factor
// with the taper already canceled out, no need to track theta separately.
function applyDorsalVentralShading(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const radius = Math.sqrt(x * x + y * y)
    const factor = radius > 1e-4 ? y / radius : 0
    const t = (factor + 1) / 2
    color.copy(VENTRAL_COLOR).lerp(DORSAL_COLOR, t)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

// Local origin sits exactly at the body attach point (the body's own tail
// base), not at the fish's center — so rotating this geometry's instance
// around its own Y axis pivots at the seam, not through the fish's middle,
// letting the tail swing without ever visibly detaching from the body.
export function createTailGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array([
    // triangle 1: attach -> top tip -> notch
    0, 0, 0, -0.2, 0.01, 0.28, 0, 0, 0.12,
    // triangle 2: attach -> notch -> bottom tip
    0, 0, 0, 0, 0, 0.12, 0.2, 0.01, 0.28,
  ])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}
