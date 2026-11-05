import * as THREE from 'three'

/**
 * A simple underwater radiance environment used for image-based lighting:
 * the bright "Snell's window" overhead (the whole sky compressed into a
 * ~97° cone), blue-green water horizontally and darkness below. Reflective
 * fish flanks pick this up, so flashes depend on fish orientation and the
 * viewer — exactly how real sardine scales sparkle.
 */
export function createUnderwaterEnvironment(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3) {
  const scene = new THREE.Scene()
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: sunDir.clone().normalize() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 water = vec3(0.05, 0.3, 0.4);
        vec3 deep = vec3(0.004, 0.025, 0.045);
        vec3 c = d.y > 0.0 ? mix(water, water * 1.6, d.y) : mix(water, deep, pow(-d.y, 0.5));
        // Snell's window: everything above the water is squeezed into a cone of ~48.6° half-angle
        float win = smoothstep(0.6, 0.72, d.y);
        c = mix(c, vec3(1.3, 1.55, 1.6), win);
        // refracted sun
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(1.0, 0.95, 0.85) * (pow(s, 90.0) * 6.0 + pow(s, 12.0) * 0.6) * win;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat))
  const pmrem = new THREE.PMREMGenerator(renderer)
  const rt = pmrem.fromScene(scene, 0.02)
  pmrem.dispose()
  mat.dispose()
  return rt.texture
}
