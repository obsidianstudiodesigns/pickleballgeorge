import * as THREE from 'three';

// 40-hole outdoor ball pattern, evenly spread with a Fibonacci lattice.
const HOLE_COUNT = 40;
const HOLE_COS = Math.cos(0.135); // angular radius of each hole

function fibonacciSphere(n) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    pts.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r));
  }
  return pts;
}

const holes = fibonacciSphere(HOLE_COUNT);
const sharedGeometry = new THREE.SphereGeometry(1, 96, 64);

// Hollow ball: holes are discarded in the fragment shader so you can see
// the darker inside wall through them, like a real plastic pickleball.
export function createBallMaterial(color = '#ffc91f') {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.45,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHoles = { value: holes };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform vec3 uHoles[${HOLE_COUNT}];\nvarying vec3 vObjPos;`
      )
      .replace(
        'void main() {',
        `void main() {
          vec3 dN = normalize(vObjPos);
          for (int i = 0; i < ${HOLE_COUNT}; i++) {
            if (dot(dN, uHoles[i]) > ${HOLE_COS.toFixed(6)}) discard;
          }`
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb *= 0.28;'
      );
  };
  mat.customProgramCacheKey = () => 'pickleball-holes';
  return mat;
}

export function createBall(radius = 1, material = createBallMaterial()) {
  const mesh = new THREE.Mesh(sharedGeometry, material);
  mesh.scale.setScalar(radius);
  return mesh;
}

export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Neutral tone mapping keeps the brand cobalt and ball yellow true (ACES pushes blue to violet).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

// Renders only while the element is on screen and the tab is visible.
export function visibilityLoop(el, tick) {
  let onScreen = false;
  let raf = 0;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tick(dt, now / 1000);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (raf || !onScreen || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; onScreen ? start() : stop(); }, { rootMargin: '100px' }).observe(el);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
}
