import * as THREE from 'three'
import type { EnvironmentParams } from '../sim/config'

/**
 * Underwater optics shared by every material:
 *  - distance haze whose colour depends on view direction (bright towards the
 *    surface, deep blue horizontally, near-black looking down);
 *  - wavelength-dependent attenuation with depth (red is absorbed first).
 * Implemented by replacing three.js' fog shader chunks, so any material with
 * `fog: true` picks it up automatically.
 */
export const HAZE_GLSL = /* glsl */ `
vec3 underwaterHaze(vec3 dir, vec3 horizon) {
  float up = dir.y;
  vec3 bright = horizon * 1.85 + vec3(0.03, 0.08, 0.08);
  vec3 deep = horizon * 0.16;
  vec3 c = up > 0.0 ? mix(horizon, bright, pow(up, 0.75)) : mix(horizon, deep, pow(-up, 0.55));
  return c;
}
vec3 depthAttenuation(float depth) {
  return exp(-vec3(0.055, 0.017, 0.012) * max(depth, 0.0));
}
`

let installed = false
export function installUnderwaterFog() {
  if (installed) return
  installed = true
  const C = THREE.ShaderChunk as unknown as Record<string, string>
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogViewPos;
#endif`
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogViewPos = mvPosition.xyz;
#endif`
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogViewPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${HAZE_GLSL}
#endif`
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  vec3 fogOff = (vec4(vFogViewPos, 0.0) * viewMatrix).xyz;
  vec3 fogWorld = cameraPosition + fogOff;
  gl_FragColor.rgb *= depthAttenuation(-fogWorld.y);
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogDir = normalize(fogOff);
  gl_FragColor.rgb = mix( gl_FragColor.rgb, underwaterHaze(fogDir, fogColor), fogFactor );
#endif`
}

/** Uniforms shared by custom ocean shaders (surface, seafloor, rays, particles). */
export const oceanUniforms = {
  uTime: { value: 0 },
  uHorizon: { value: new THREE.Color(0.04, 0.3, 0.4) },
  uFogDensity: { value: 0.03 },
  uSunDir: { value: new THREE.Vector3(0.25, 1, 0.15).normalize() },
  uSun: { value: 1 },
  uWave: { value: 1 },
  uCurrent: { value: new THREE.Vector3() },
}

/** Fog density so that objects fade to ~10% contrast at `visibility` metres. */
export function fogDensityFor(visibility: number) {
  return 1.5 / Math.max(5, visibility)
}

const tmp = new THREE.Color()
/** Horizontal water colour seen from the camera's depth. */
export function horizonColor(env: EnvironmentParams, cameraY: number, out: THREE.Color) {
  const depth = Math.max(0, -cameraY)
  // clear oceanic blue-green, shifting greener in plankton-rich, turbid water
  out.setRGB(0.05, 0.37, 0.5)
  const green = Math.min(1, env.plankton * 0.6 + Math.max(0, (35 - env.visibility) / 60))
  tmp.setRGB(0.07, 0.3, 0.27)
  out.lerp(tmp, green)
  const s = 0.35 + 0.65 * Math.min(1.6, env.sunlight)
  out.multiplyScalar(s)
  out.r *= Math.exp(-depth * 0.03)
  out.g *= Math.exp(-depth * 0.011)
  out.b *= Math.exp(-depth * 0.008)
  return out
}
