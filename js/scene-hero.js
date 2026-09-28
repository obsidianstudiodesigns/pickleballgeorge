import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBall, createBallMaterial, makeRenderer, visibilityLoop } from './ball.js';

const FACE_W = 1.62;
const FACE_H = 2.2;
const FACE_DEPTH = 0.07;

function roundedRect(w, h, rTop, rBottom) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + rBottom, y);
  s.lineTo(x + w - rBottom, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rBottom);
  s.lineTo(x + w, y + h - rTop);
  s.quadraticCurveTo(x + w, y + h, x + w - rTop, y + h);
  s.lineTo(x + rTop, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rTop);
  s.lineTo(x, y + rBottom);
  s.quadraticCurveTo(x, y, x + rBottom, y);
  return s;
}

// Paddle face artwork, drawn to match the Pickleball George logo stripes.
function faceTexture(renderer) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round(1024 * (FACE_H / FACE_W));
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, '#0d0cb0');
  grad.addColorStop(0.55, '#06057a');
  grad.addColorStop(1, '#02022e');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  // subtle carbon weave
  g.globalAlpha = 0.07;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  for (let i = -c.height; i < c.width; i += 14) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + c.height, c.height); g.stroke();
  }
  g.globalAlpha = 1;

  // logo stripes
  g.save();
  g.translate(c.width * 0.22, c.height * 0.2);
  g.rotate(-Math.PI / 5);
  g.fillStyle = '#ffc91f';
  [0, 70, 140].forEach((o, i) => {
    const len = 420 - i * 60;
    g.beginPath();
    g.roundRect(-len / 2 + 60, o, len, 36, 18);
    g.fill();
  });
  g.restore();

  // inset keyline
  g.strokeStyle = 'rgba(255,201,31,.55)';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(46, 46, c.width - 92, c.height - 92, [150, 150, 80, 80]);
  g.stroke();

  // wordmark
  g.fillStyle = '#ffc91f';
  g.textAlign = 'center';
  g.font = '190px Anton, Impact, sans-serif';
  g.fillText('PICKLEBALL', c.width / 2, c.height * 0.78);
  g.fillStyle = '#ffffff';
  g.font = '96px Anton, Impact, sans-serif';
  g.fillText('GEORGE', c.width / 2, c.height * 0.87);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // Extrude cap UVs are raw shape coordinates: remap -w/2..w/2 to 0..1.
  tex.repeat.set(1 / FACE_W, 1 / FACE_H);
  tex.offset.set(0.5, 0.5);
  return tex;
}

function buildPaddle(renderer) {
  const group = new THREE.Group();
  const shape = roundedRect(FACE_W, FACE_H, 0.5, 0.32);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: FACE_DEPTH, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.035, bevelSegments: 5, curveSegments: 28,
  });
  geo.translate(0, 0, -FACE_DEPTH / 2);
  const faceMat = new THREE.MeshPhysicalMaterial({ map: faceTexture(renderer), roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.45 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#ffc91f', roughness: 0.45, metalness: 0.1 });
  group.add(new THREE.Mesh(geo, [faceMat, edgeMat]));

  const gripMat = new THREE.MeshStandardMaterial({ color: '#15152a', roughness: 0.75 });
  const handleLen = 1.05;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.165, handleLen, 32), gripMat);
  handle.position.y = -FACE_H / 2 - handleLen / 2 + 0.06;
  group.add(handle);

  const wrapMat = new THREE.MeshStandardMaterial({ color: '#2b2b52', roughness: 0.6 });
  for (let i = 0; i < 7; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.162, 0.014, 8, 40), wrapMat);
    ring.rotation.x = Math.PI / 2 + 0.28;
    ring.position.y = handle.position.y + handleLen / 2 - 0.12 - i * 0.13;
    group.add(ring);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 32), edgeMat);
  cap.position.y = handle.position.y - handleLen / 2;
  group.add(cap);

  return group;
}

export function initHero(canvas, { reduced }) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 1.6, 10);

  const key = new THREE.DirectionalLight('#fff3d1', 1.8);
  key.position.set(4, 7, 6);
  const rim = new THREE.DirectionalLight('#5b5bff', 4);
  rim.position.set(-6, 2, -5);
  scene.add(key, rim, new THREE.AmbientLight('#8080ff', 0.25));

  const rig = new THREE.Group();
  scene.add(rig);

  const paddle = buildPaddle(renderer);
  const paddlePivot = new THREE.Group();
  paddlePivot.add(paddle);
  paddlePivot.rotation.set(-0.72, 0, 0.42);
  rig.add(paddlePivot);

  const ballMat = createBallMaterial();
  const BALL_R = 0.44;
  const ball = createBall(BALL_R, ballMat);
  rig.add(ball);

  // Background balls for depth
  const floaters = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  // Kept to the right-hand side and pushed back so they never sit on the headline.
  for (let i = 0; i < 8; i++) {
    const m = createBall(rand(0.14, 0.32), ballMat);
    const home = new THREE.Vector3(rand(0.5, 9), rand(-3, 3.2), rand(-10, -4));
    m.position.copy(home);
    m.rotation.set(rand(0, 6), rand(0, 6), 0);
    scene.add(m);
    floaters.push({ m, home, speed: rand(0.3, 0.8), phase: rand(0, 6) });
  }

  // Layout: object sits right of the headline on desktop, below it on mobile.
  function layout() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dist = camBase.length();
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    const visW = visH * camera.aspect;
    if (w >= 900) {
      rig.position.set(visW * 0.2, -0.7, 0);
      rig.scale.setScalar(1);
    } else {
      rig.position.set(0, -visH * 0.24, 0);
      rig.scale.setScalar(Math.min(0.78, visW / 5.2));
    }
    // on phones the copy sits above the object, so only keep floaters low in the frame
    floaters.forEach((f) => { f.m.visible = w >= 900 || f.home.y < -1.2; });
  }
  layout();
  new ResizeObserver(layout).observe(canvas);

  // Pointer parallax
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  const state = { exit: 0 };
  const normal = new THREE.Vector3();
  const facePos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const PERIOD = 1.25;
  const HEIGHT = 2.0;
  let t = 0;

  function frame(dt) {
    t += dt;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    // keepy-uppy loop
    const p = (t % PERIOD) / PERIOD;
    const hit = Math.max(0, 1 - Math.min(p, 1 - p) / 0.09); // 1 at contact
    paddle.position.z = hit * 0.12;
    paddle.rotation.x = -hit * 0.08;

    paddlePivot.updateMatrixWorld();
    normal.set(0, 0, 1).applyQuaternion(paddlePivot.quaternion);
    facePos.set(0, 0.15, 0).applyMatrix4(paddlePivot.matrix);
    const lift = 4 * HEIGHT * p * (1 - p);
    ball.position.copy(facePos).addScaledVector(normal, FACE_DEPTH / 2 + 0.03 + BALL_R).addScaledVector(up, lift);
    const squash = 1 - hit * 0.12;
    ball.scale.set(BALL_R * (2 - squash), BALL_R * squash, BALL_R * (2 - squash));
    ball.rotation.x += dt * 2.6;
    ball.rotation.z += dt * 1.1;

    // idle sway + pointer + scroll exit
    rig.rotation.y = Math.sin(t * 0.4) * 0.12 + pointer.x * 0.35 + state.exit * 1.4;
    rig.rotation.x = pointer.y * 0.12 - state.exit * 0.3;
    camera.position.set(camBase.x - pointer.x * 0.3, camBase.y + pointer.y * 0.2 + state.exit * 1.5, camBase.z + state.exit * 4);
    camera.lookAt(0, 0, 0);

    floaters.forEach((f) => {
      f.m.position.y = f.home.y + Math.sin(t * f.speed + f.phase) * 0.35 + state.exit * 3 * f.speed;
      f.m.rotation.y += dt * f.speed * 0.6;
    });

    renderer.render(scene, camera);
  }

  if (reduced) {
    t = PERIOD * 0.5;
    frame(0);
    new ResizeObserver(() => frame(0)).observe(canvas);
  } else {
    visibilityLoop(canvas, frame);
  }

  canvas.classList.add('is-ready');
  return state;
}
