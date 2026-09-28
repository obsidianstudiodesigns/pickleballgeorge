import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBall, createBallMaterial, makeRenderer, visibilityLoop } from './ball.js';

// A crowd of balls around the headline. They drift, and scatter from the cursor.
export function initCommunity(canvas, { reduced }) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 14);
  const key = new THREE.DirectionalLight('#fff3d1', 2.2);
  key.position.set(3, 6, 8);
  const rim = new THREE.DirectionalLight('#5b5bff', 3);
  rim.position.set(-5, -2, -6);
  scene.add(key, rim, new THREE.AmbientLight('#8080ff', 0.3));

  const mat = createBallMaterial();
  const balls = [];
  let halfW = 8, halfH = 5;

  function seed() {
    balls.forEach((b) => scene.remove(b.m));
    balls.length = 0;
    const count = halfW > 6 ? 22 : 12;
    let guard = 0;
    while (balls.length < count && guard++ < 800) {
      const x = (Math.random() * 2 - 1) * halfW * 1.05;
      const y = (Math.random() * 2 - 1) * halfH * 1.05;
      // keep the headline area clear
      if (Math.abs(x) < halfW * (halfW > 6 ? 0.62 : 1.2) && Math.abs(y) < halfH * 0.74) continue;
      const r = 0.35 + Math.random() * 0.75;
      if (balls.some((b) => b.home.distanceTo(new THREE.Vector3(x, y, b.home.z)) < b.r + r + 0.2)) continue;
      const m = createBall(r, mat);
      const home = new THREE.Vector3(x, y, -Math.random() * 4);
      m.position.copy(home);
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      m.scale.setScalar(0.0001);
      scene.add(m);
      balls.push({ m, r, home, vel: new THREE.Vector3(), off: new THREE.Vector3(), phase: Math.random() * 6, grow: reduced ? 1 : 0, spin: 0.2 + Math.random() * 0.6 });
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    halfW = halfH * camera.aspect;
    seed();
    if (reduced) tick(0, 0);
  }

  const pointer = new THREE.Vector3(999, 999, 0);
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ray.ray.intersectPlane(plane, pointer);
  }, { passive: true });
  canvas.parentElement.addEventListener('pointerleave', () => pointer.set(999, 999, 0));

  const tmp = new THREE.Vector3();
  function tick(dt, time) {
    balls.forEach((b, i) => {
      if (b.grow < 1) b.grow = Math.min(1, b.grow + dt * (0.8 + (i % 5) * 0.12));
      const eased = 1 - Math.pow(1 - b.grow, 3);
      // spring back home + push away from pointer
      tmp.copy(b.m.position).sub(pointer);
      tmp.z = 0;
      const d = tmp.length();
      const reach = 3 + b.r;
      if (d < reach) b.vel.addScaledVector(tmp.normalize(), (1 - d / reach) * 40 * dt);
      b.vel.addScaledVector(b.off, -12 * dt);
      b.vel.multiplyScalar(1 - Math.min(1, 4 * dt));
      b.off.addScaledVector(b.vel, dt);
      b.m.position.set(
        b.home.x + b.off.x + Math.sin(time * 0.5 + b.phase) * 0.25,
        b.home.y + b.off.y + Math.cos(time * 0.6 + b.phase) * 0.3,
        b.home.z
      );
      b.m.rotation.x += dt * b.spin + b.vel.y * dt * 0.8;
      b.m.rotation.y += dt * b.spin * 0.7 - b.vel.x * dt * 0.8;
      b.m.scale.setScalar(Math.max(0.0001, b.r * eased));
    });
    renderer.render(scene, camera);
  }

  resize();
  new ResizeObserver(resize).observe(canvas);
  if (!reduced) visibilityLoop(canvas, tick);
}
