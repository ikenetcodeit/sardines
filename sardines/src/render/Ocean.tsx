import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { QUALITY } from '../sim/config'
import { simClient } from '../sim/client'
import { useSimStore } from '../store/useSimStore'
import { createUnderwaterEnvironment } from './envMap'
import { rockGeometry } from './predatorGeometry'
import { Environment } from '../sim/Environment'
import { HAZE_GLSL, fogDensityFor, horizonColor, oceanUniforms } from './underwater'

const SUN_DIR = new THREE.Vector3(0.32, 1, 0.18).normalize()
/** Direction sunlight travels underwater (refracted toward the vertical). */
const SUN_UNDERWATER = (() => {
  const i = SUN_DIR.clone().negate()
  const n = new THREE.Vector3(0, 1, 0)
  const eta = 1 / 1.333
  const cosi = -n.dot(i)
  const k = 1 - eta * eta * (1 - cosi * cosi)
  return i.multiplyScalar(eta).add(n.multiplyScalar(eta * cosi - Math.sqrt(k))).normalize()
})()

const WAVES_GLSL = /* glsl */ `
float waveHeight(vec2 p, float t, float amp) {
  float h = 0.0;
  h += sin(dot(p, vec2(0.12, 0.05)) + t * 0.9) * 0.35;
  h += sin(dot(p, vec2(-0.07, 0.11)) + t * 1.1) * 0.25;
  h += sin(dot(p, vec2(0.21, -0.17)) + t * 1.7) * 0.12;
  h += sin(dot(p, vec2(-0.31, -0.23)) + t * 2.3) * 0.06;
  return h * amp;
}
vec2 waveGrad(vec2 p, float t, float amp) {
  vec2 g = vec2(0.0);
  g += vec2(0.12, 0.05) * cos(dot(p, vec2(0.12, 0.05)) + t * 0.9) * 0.35;
  g += vec2(-0.07, 0.11) * cos(dot(p, vec2(-0.07, 0.11)) + t * 1.1) * 0.25;
  g += vec2(0.21, -0.17) * cos(dot(p, vec2(0.21, -0.17)) + t * 1.7) * 0.12;
  g += vec2(-0.31, -0.23) * cos(dot(p, vec2(-0.31, -0.23)) + t * 2.3) * 0.06;
  // fine ripples
  g += vec2(0.9, 0.4) * cos(dot(p, vec2(0.9, 0.4)) + t * 3.1) * 0.035;
  g += vec2(-0.5, 1.1) * cos(dot(p, vec2(-0.5, 1.1)) + t * 3.7) * 0.03;
  g += vec2(1.7, -1.3) * cos(dot(p, vec2(1.7, -1.3)) + t * 5.3) * 0.012;
  return g * amp;
}
`

/** Keeps fog, haze colours, lights and the environment map in sync with parameters and camera depth. */
export function Atmosphere() {
  const { scene, gl, camera } = useThree()
  const env = useSimStore((s) => s.params.env)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const envTex = useMemo(() => createUnderwaterEnvironment(gl, SUN_DIR), [gl])
  useEffect(() => {
    scene.environment = envTex
    scene.fog = new THREE.FogExp2(0x0b4a5e, 0.03)
    return () => {
      scene.environment = null
      scene.fog = null
    }
  }, [scene, envTex])
  const col = useMemo(() => new THREE.Color(), [])
  const mirror = useMemo(() => new Environment(env), [])
  useFrame((_, dt) => {
    oceanUniforms.uTime.value += dt
    const f = simClient.cur
    mirror.params = env
    mirror.time = f?.envTime ?? 0
    mirror.updateDrift()
    const c = oceanUniforms.uCurrent.value
    const tmp = [0, 0, 0]
    mirror.currentAt(camera.position.x, Math.min(-1, camera.position.y), camera.position.z, tmp)
    const ts = f && !f.paused ? f.timeScale : 0
    c.set(tmp[0] * ts, tmp[1] * ts, tmp[2] * ts)
    horizonColor(env, camera.position.y, col)
    oceanUniforms.uHorizon.value.copy(col)
    oceanUniforms.uFogDensity.value = fogDensityFor(env.visibility)
    oceanUniforms.uSun.value = env.sunlight
    oceanUniforms.uWave.value = env.waveIntensity
    oceanUniforms.uSunDir.value.copy(SUN_DIR)
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(col)
      scene.fog.density = oceanUniforms.uFogDensity.value
    }
    gl.setClearColor(col)
    scene.environmentIntensity = 0.35 + 0.65 * env.sunlight
    const depthK = Math.exp(Math.min(0, camera.position.y) / 70)
    if (hemi.current) hemi.current.intensity = (0.5 + 0.6 * env.sunlight) * (0.5 + 0.5 * depthK)
    if (sun.current) sun.current.intensity = 2.2 * env.sunlight * (0.4 + 0.6 * depthK)
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={[0x9fe3ff, 0x03121c, 0.9]} />
      <directionalLight ref={sun} position={SUN_DIR.clone().multiplyScalar(80)} intensity={2} color={0xfff4e0} />
    </>
  )
}

/** Gradient water "sky" around the camera. */
export function Background() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uHorizon: oceanUniforms.uHorizon, uSunDir: oceanUniforms.uSunDir, uSun: oceanUniforms.uSun },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vDir = wp.xyz - cameraPosition;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uSunDir;
          uniform float uSun;
          varying vec3 vDir;
          ${HAZE_GLSL}
          void main() {
            vec3 d = normalize(vDir);
            vec3 c = underwaterHaze(d, uHorizon);
            // faint glow toward the refracted sun
            float s = max(dot(d, normalize(uSunDir + vec3(0.0, 1.5, 0.0))), 0.0);
            c += uHorizon * pow(s, 6.0) * 0.6 * uSun;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  )
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => ref.current?.position.copy(camera.position))
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  )
}

/** The water surface seen from below: waves, Snell's window, total internal reflection. */
export function Surface() {
  const quality = useSimStore((s) => s.quality)
  const seg = QUALITY[quality].surfaceSegments
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: oceanUniforms,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uWave;
          varying vec3 vWorld;
          ${WAVES_GLSL}
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            wp.y += waveHeight(wp.xz, uTime, uWave);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uWave;
          uniform vec3 uHorizon;
          uniform vec3 uSunDir;
          uniform float uSun;
          uniform float uFogDensity;
          varying vec3 vWorld;
          ${HAZE_GLSL}
          ${WAVES_GLSL}
          void main() {
            vec2 g = waveGrad(vWorld.xz, uTime, max(uWave, 0.05));
            vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
            vec3 I = normalize(vWorld - cameraPosition);
            vec3 R = refract(I, -n, 1.333);
            vec3 col;
            float alpha = 1.0;
            vec3 refl = reflect(I, -n);
            vec3 below = underwaterHaze(normalize(vec3(refl.x, -abs(refl.y), refl.z)), uHorizon) * 1.1;
            if (dot(R, R) < 1e-4) {
              // total internal reflection: the surface mirrors the deep water
              col = below;
            } else {
              vec3 sky = mix(vec3(0.45, 0.68, 0.8), vec3(0.7, 0.86, 0.95), clamp(R.y, 0.0, 1.0)) * (0.45 + 0.6 * uSun);
              float sd = max(dot(R, uSunDir), 0.0);
              sky += vec3(1.0, 0.95, 0.85) * (pow(sd, 800.0) * 6.0 + pow(sd, 30.0) * 0.5) * uSun;
              float cosT = clamp(dot(-I, -n), 0.0, 1.0);
              float edge = smoothstep(0.66, 0.78, cosT);
              col = mix(below, sky, edge);
              alpha = mix(1.0, 0.82, edge);
            }
            float d = length(vWorld - cameraPosition);
            float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d * 0.5);
            col = mix(col, underwaterHaze(I, uHorizon), fog);
            gl_FragColor = vec4(col, alpha);
          }`,
      }),
    [],
  )
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => {
    if (!ref.current) return
    ref.current.position.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4)
  })
  return (
    <mesh ref={ref} material={mat} rotation-x={-Math.PI / 2} renderOrder={5} frustumCulled={false}>
      <planeGeometry args={[700, 700, seg, seg]} />
    </mesh>
  )
}

/** Sandy seafloor with animated caustics and soft shadows under schools. */
export function Seafloor() {
  const depth = useSimStore((s) => s.params.env.oceanDepth)
  const uniforms = useMemo(
    () => ({
      ...oceanUniforms,
      uDepth: { value: depth },
      uShadows: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 1, 0)) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  uniforms.uDepth.value = depth
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uSun;
          uniform float uWave;
          uniform float uDepth;
          uniform vec3 uHorizon;
          uniform float uFogDensity;
          uniform vec4 uShadows[6];
          varying vec3 vWorld;
          ${HAZE_GLSL}
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
          }
          // Caustics: warped interference of sines, sharpened into bright filaments.
          // (No divisions, so it is numerically safe on every GPU.)
          float caustic(vec2 p, float t) {
            vec2 q = p;
            float c = 0.0;
            for (int n = 0; n < 3; n++) {
              float fn = float(n) + 1.0;
              q += vec2(sin(q.y * 1.3 + t * 0.7 * fn), cos(q.x * 1.1 - t * 0.6 * fn)) * 0.45;
              c += abs(sin(q.x * 1.7 + t) * cos(q.y * 1.9 - t * 0.8));
            }
            c /= 3.0;
            return pow(clamp(1.0 - c, 0.0, 1.0), 6.0) * 2.5;
          }
          void main() {
            vec2 p = vWorld.xz;
            float n = noise(p * 0.35) * 0.6 + noise(p * 1.7) * 0.3 + noise(p * 6.0) * 0.1;
            float ripple = sin(p.x * 1.3 + noise(p * 0.2) * 6.0) * 0.5 + 0.5;
            vec3 sand = mix(vec3(0.42, 0.39, 0.3), vec3(0.62, 0.57, 0.44), n) * (0.9 + 0.1 * ripple);
            float light = exp(-uDepth / 28.0);
            float ca = caustic(p * 0.35, uTime * 0.8) * uWave;
            vec3 col = sand * (0.18 + 0.55 * light * uSun) + vec3(0.7, 0.9, 0.85) * ca * light * uSun * 0.9;
            float sh = 0.0;
            for (int k = 0; k < 6; k++) {
              vec4 s = uShadows[k];
              float d = length(p - s.xy) / max(s.z, 0.1);
              sh = max(sh, s.w * (1.0 - smoothstep(0.3, 1.3, d)));
            }
            col *= 1.0 - 0.55 * sh;
            col *= depthAttenuation(uDepth) * 1.6 + 0.04;
            float d = length(vWorld - cameraPosition);
            float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
            col = mix(col, underwaterHaze(normalize(vWorld - cameraPosition), uHorizon), fog);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [uniforms],
  )
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => {
    if (!ref.current) return
    ref.current.position.set(Math.round(camera.position.x / 8) * 8, -depth, Math.round(camera.position.z / 8) * 8)
    const f = simClient.cur
    const top = f?.stats.top ?? []
    for (let k = 0; k < 6; k++) {
      const s = top[k]
      const v = uniforms.uShadows.value[k]
      if (s) {
        // darker under big, dense, shallow schools
        const strength = Math.min(0.8, (s.count / 1500) * 0.6 + 0.15) * Math.exp(-(s.cy + depth) / 60)
        v.set(s.cx, s.cz, s.radius * 1.6 + 2, strength)
      } else v.w = 0
    }
  })
  return (
    <mesh ref={ref} material={mat} rotation-x={-Math.PI / 2} frustumCulled={false}>
      <planeGeometry args={[700, 700, 1, 1]} />
    </mesh>
  )
}

/** Rock pinnacles used as obstacles. */
export function Rocks() {
  const depth = useSimStore((s) => s.params.env.oceanDepth)
  const obstacles = useObstacles()
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x2b2924, roughness: 1, metalness: 0, envMapIntensity: 0.12, flatShading: true }), [])
  const geos = useMemo(() => obstacles.map((_, i) => rockGeometry(i + 1)), [obstacles])
  return (
    <group>
      {obstacles.map((o, i) => {
        const h = o.y + o.radius * 0.6 + depth
        return <mesh key={i} geometry={geos[i]} material={mat} position={[o.x, -depth - 0.5, o.z]} scale={[o.radius, h + 0.5, o.radius]} />
      })}
    </group>
  )
}

function useObstacles() {
  const version = useSimStore((s) => s.frameVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => simClient.cur?.obstacles ?? [], [version])
}

/** Sunbeams slanting down from the surface (additive, camera-facing around their axis). */
export function LightShafts() {
  const quality = useSimStore((s) => s.quality)
  const count = QUALITY[quality].lightShafts
  const mesh = useMemo(() => {
    if (count === 0) return null
    const g = new THREE.PlaneGeometry(1, 1)
    g.translate(0, -0.5, 0)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) seeds[i] = Math.random()
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { ...oceanUniforms, uCamDepth: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec2 vUv;
        varying float vSeed;
        varying float vDist;
        void main() {
          vUv = uv;
          vSeed = aSeed;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vDist = length(wp.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uSun;
        uniform float uWave;
        uniform float uCamDepth;
        uniform vec3 uHorizon;
        varying vec2 vUv;
        varying float vSeed;
        varying float vDist;
        void main() {
          float across = sin(vUv.x * 3.14159);
          float stripes = 0.55 + 0.45 * sin(vUv.x * 9.0 + vSeed * 40.0 + uTime * (0.15 + vSeed * 0.2));
          stripes *= 0.6 + 0.4 * sin(vUv.x * 23.0 - uTime * 0.31 + vSeed * 13.0);
          float along = pow(vUv.y, 2.2);
          float flicker = 0.75 + 0.25 * sin(uTime * (0.6 + vSeed) + vSeed * 20.0);
          float fadeNear = smoothstep(2.0, 12.0, vDist);
          float fadeFar = 1.0 - smoothstep(40.0, 90.0, vDist);
          float a = across * across * stripes * along * flicker * fadeNear * fadeFar;
          a *= 0.075 * uSun * (0.5 + 0.5 * min(uWave, 1.5)) * exp(-uCamDepth / 45.0);
          gl_FragColor = vec4(vec3(0.55, 0.85, 0.85) * a, a);
        }`,
    })
    const im = new THREE.InstancedMesh(g, m, count)
    im.frustumCulled = false
    im.renderOrder = 6
    return im
  }, [count])
  const bases = useMemo(
    () => Array.from({ length: count }, () => [Math.random() * 90 - 45, Math.random() * 90 - 45, 3 + Math.random() * 5, 30 + Math.random() * 45]),
    [count],
  )
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const v = useMemo(() => ({ a: SUN_UNDERWATER.clone(), r: new THREE.Vector3(), n: new THREE.Vector3(), to: new THREE.Vector3() }), [])
  useFrame(({ camera }) => {
    if (!mesh) return
    ;(mesh.material as THREE.ShaderMaterial).uniforms.uCamDepth.value = Math.max(0, -camera.position.y)
    const t = oceanUniforms.uTime.value
    for (let i = 0; i < count; i++) {
      const b = bases[i]
      const B = 90
      const ox = ((((b[0] + t * 0.25 - camera.position.x) % B) + B * 1.5) % B) - B / 2 + camera.position.x
      const oz = ((((b[1] + t * 0.12 - camera.position.z) % B) + B * 1.5) % B) - B / 2 + camera.position.z
      v.to.set(camera.position.x - ox, 0, camera.position.z - oz)
      v.r.crossVectors(v.a, v.to).normalize()
      const w = b[2]
      const len = b[3]
      // columns: X = right*width, Y = -axis*length, Z = normal
      v.n.crossVectors(v.r, v.a)
      m4.set(
        v.r.x * w, -v.a.x * len, v.n.x, ox,
        v.r.y * w, -v.a.y * len, v.n.y, -0.3,
        v.r.z * w, -v.a.z * len, v.n.z, oz,
        0, 0, 0, 1,
      )
      mesh.setMatrixAt(i, m4)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return mesh ? <primitive object={mesh} /> : null
}

/** Suspended particles ("marine snow") drifting with the current around the camera. */
export function MarineSnow() {
  const quality = useSimStore((s) => s.quality)
  const plankton = useSimStore((s) => s.params.env.plankton)
  const count = Math.round(QUALITY[quality].particles * (0.6 + plankton * 0.8))
  const pts = useMemo(() => {
    const B = 36
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * B
      pos[i * 3 + 1] = Math.random() * B
      pos[i * 3 + 2] = Math.random() * B
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { ...oceanUniforms, uOffset: { value: new THREE.Vector3() }, uB: { value: B }, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        uniform vec3 uOffset;
        uniform float uB;
        uniform float uTime;
        uniform float uScale;
        attribute float aSeed;
        varying float vA;
        varying float vSeed;
        void main() {
          vec3 p = mod(position - uOffset + vec3(sin(uTime * 0.2 + aSeed * 30.0), cos(uTime * 0.13 + aSeed * 20.0), 0.0) * 0.3, uB) - uB * 0.5 + cameraPosition;
          p.y -= mod(uTime * 0.02 * (0.5 + aSeed), 1.0) * 0.0;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = (1.0 - smoothstep(uB * 0.3, uB * 0.5, d)) * smoothstep(0.3, 1.5, d) * step(p.y, -0.1);
          vSeed = aSeed;
          gl_PointSize = clamp(uScale * (0.02 + 0.03 * aSeed) / max(d, 0.1), 1.0, 9.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        varying float vA;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = dot(c, c);
          if (r > 0.25) discard;
          float a = (1.0 - r * 4.0) * vA * (0.25 + 0.3 * vSeed);
          vec3 col = mix(vec3(0.75, 0.85, 0.8), uHorizon * 3.0, 0.35);
          gl_FragColor = vec4(col, a);
        }`,
    })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    return p
  }, [count])
  const offset = useMemo(() => new THREE.Vector3(), [])
  const { size } = useThree()
  useFrame((_, dt) => {
    const m = pts.material as THREE.ShaderMaterial
    // drift with the local current
    offset.addScaledVector(oceanUniforms.uCurrent.value, -dt)
    m.uniforms.uOffset.value.copy(offset)
    m.uniforms.uScale.value = size.height * 0.9
  })
  return <primitive object={pts} />
}

const MAX_PATCHES = 8
/** Plankton clouds marking feeding patches. */
export function PlanktonClouds() {
  const per = 900
  const { pts, uniforms } = useMemo(() => {
    const n = per * MAX_PATCHES
    const off = new Float32Array(n * 3)
    const idx = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      // gaussian ball, flattened vertically
      let x = 0
      let y = 0
      let z = 0
      do {
        x = Math.random() * 2 - 1
        y = Math.random() * 2 - 1
        z = Math.random() * 2 - 1
      } while (x * x + y * y + z * z > 1)
      const r = Math.pow(Math.random(), 0.6)
      off[i * 3] = x * r
      off[i * 3 + 1] = y * r * 0.6
      off[i * 3 + 2] = z * r
      idx[i] = Math.floor(i / per)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(off, 3))
    g.setAttribute('aPatch', new THREE.BufferAttribute(idx, 1))
    const uniforms = {
      ...oceanUniforms,
      uPatch: { value: Array.from({ length: MAX_PATCHES }, () => new THREE.Vector4()) },
      uDensity: { value: new Array(MAX_PATCHES).fill(0) },
      uScale: { value: 400 },
    }
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms,
      vertexShader: /* glsl */ `
        uniform vec4 uPatch[${MAX_PATCHES}];
        uniform float uDensity[${MAX_PATCHES}];
        uniform float uTime;
        uniform float uScale;
        attribute float aPatch;
        varying float vA;
        void main() {
          int k = int(aPatch + 0.5);
          vec4 P = uPatch[k];
          float dens = uDensity[k];
          vec3 o = position;
          float ph = dot(o, vec3(12.9, 78.2, 37.7));
          o += 0.06 * vec3(sin(uTime * 0.3 + ph), sin(uTime * 0.23 + ph * 1.3), cos(uTime * 0.27 + ph));
          vec3 p = P.xyz + o * P.w;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = dens * smoothstep(0.5, 2.5, d) * (1.0 - smoothstep(60.0, 90.0, d)) * step(length(position), sqrt(dens) + 0.02);
          gl_PointSize = clamp(uScale * 0.06 / max(d, 0.1), 1.0, 7.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uHorizon;
        uniform float uFogDensity;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = dot(c, c);
          if (r > 0.25) discard;
          gl_FragColor = vec4(vec3(0.55, 0.72, 0.42), (1.0 - r * 4.0) * vA * 0.45);
        }`,
    })
    const pts = new THREE.Points(g, m)
    pts.frustumCulled = false
    return { pts, uniforms }
  }, [])
  const { size } = useThree()
  useFrame(() => {
    const f = simClient.cur
    uniforms.uScale.value = size.height * 0.9
    for (let k = 0; k < MAX_PATCHES; k++) {
      const p = f?.food[k]
      if (p) {
        uniforms.uPatch.value[k].set(p.x, p.y, p.z, p.radius)
        uniforms.uDensity.value[k] = p.density
      } else uniforms.uDensity.value[k] = 0
    }
  })
  return <primitive object={pts} />
}

const MAX_BURSTS = 10
/** Bubble trails from plunging seabirds and violent strikes. */
export function Bubbles() {
  const per = 70
  const { pts, uniforms } = useMemo(() => {
    const n = per * MAX_BURSTS
    const off = new Float32Array(n * 3)
    const idx = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      off[i * 3] = (Math.random() - 0.5) * 1.6
      off[i * 3 + 1] = Math.random()
      off[i * 3 + 2] = (Math.random() - 0.5) * 1.6
      idx[i] = Math.floor(i / per)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(off, 3))
    g.setAttribute('aBurst', new THREE.BufferAttribute(idx, 1))
    const uniforms = {
      uBurst: { value: Array.from({ length: MAX_BURSTS }, () => new THREE.Vector4()) },
      uLife: { value: new Array(MAX_BURSTS).fill(1) },
      uScale: { value: 400 },
    }
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms,
      vertexShader: /* glsl */ `
        uniform vec4 uBurst[${MAX_BURSTS}];
        uniform float uLife[${MAX_BURSTS}];
        uniform float uScale;
        attribute float aBurst;
        varying float vA;
        void main() {
          int k = int(aBurst + 0.5);
          vec4 B = uBurst[k];
          float age = B.w / uLife[k];
          vec3 p = B.xyz + vec3(position.x * (0.4 + age), position.y * 2.5 * age - 0.5 + age * 2.0, position.z * (0.4 + age));
          p.y = min(p.y, -0.05);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = (1.0 - age) * step(0.0, 1.0 - age);
          gl_PointSize = clamp(uScale * (0.03 + 0.03 * fract(position.y * 17.0)) / max(d, 0.1), 1.0, 10.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          if (r > 0.5) discard;
          float ring = smoothstep(0.32, 0.45, r) * (1.0 - smoothstep(0.45, 0.5, r));
          gl_FragColor = vec4(vec3(0.85, 0.95, 1.0), (ring * 0.8 + 0.1) * vA);
        }`,
    })
    const pts = new THREE.Points(g, m)
    pts.frustumCulled = false
    return { pts, uniforms }
  }, [])
  const { size } = useThree()
  useFrame(() => {
    const f = simClient.cur
    uniforms.uScale.value = size.height * 0.9
    const ds = (f?.disturbances ?? []).filter((d) => d.strength > 0.8)
    for (let k = 0; k < MAX_BURSTS; k++) {
      const d = ds[ds.length - 1 - k]
      if (d) {
        uniforms.uBurst.value[k].set(d.x, d.y, d.z, d.age)
        uniforms.uLife.value[k] = d.life
      } else {
        uniforms.uBurst.value[k].w = 1
        uniforms.uLife.value[k] = 1
      }
    }
  })
  return <primitive object={pts} />
}
