import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBall, makeRenderer, visibilityLoop } from './ball.js';

// Units are feet. Court is 20 x 44, net at z = 0, kitchen 7 ft each side.
// Colours match the real courts: slate-blue playing area, yellow kitchen, grey surround.
const COURT_BLUE = '#2c5b90';
const KITCHEN = '#dcae2c';
const HIGHLIGHT = '#ffe45c';
const BOX_GLOW = '#ffffff'; // white lift reads as a highlight on blue (yellow over blue turns green)
const BALL_R = 0.6;

function arc(a, b, peak, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(
      THREE.MathUtils.lerp(a.x, b.x, t),
      THREE.MathUtils.lerp(a.y, b.y, t) + 4 * peak * t * (1 - t),
      THREE.MathUtils.lerp(a.z, b.z, t)
    ));
  }
  return pts;
}
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const join = (...arcs) => arcs.reduce((acc, a, i) => acc.concat(i ? a.slice(1) : a), []);

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(20,20,30,1)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(44, 6);
  return t;
}

export function initCourt(canvas, { reduced }) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  const sun = new THREE.DirectionalLight('#ffffff', 1.3);
  sun.position.set(12, 30, 18);
  scene.add(sun, new THREE.AmbientLight('#9aa0ff', 0.35));

  const court = new THREE.Group();
  scene.add(court);

  const flat = (w, d, color, y, extra = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };

  // Rounded slab under the court so it reads as an object floating in space
  const slabShape = new THREE.Shape();
  const sw = 32, sd = 60, r = 3;
  slabShape.moveTo(-sw / 2 + r, -sd / 2);
  slabShape.lineTo(sw / 2 - r, -sd / 2); slabShape.quadraticCurveTo(sw / 2, -sd / 2, sw / 2, -sd / 2 + r);
  slabShape.lineTo(sw / 2, sd / 2 - r); slabShape.quadraticCurveTo(sw / 2, sd / 2, sw / 2 - r, sd / 2);
  slabShape.lineTo(-sw / 2 + r, sd / 2); slabShape.quadraticCurveTo(-sw / 2, sd / 2, -sw / 2, sd / 2 - r);
  slabShape.lineTo(-sw / 2, -sd / 2 + r); slabShape.quadraticCurveTo(-sw / 2, -sd / 2, -sw / 2 + r, -sd / 2);
  const slab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(slabShape, { depth: 1.2, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 3 }),
    [new THREE.MeshStandardMaterial({ color: '#3b3f4c', roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#1a1a3a', roughness: 0.7 })]
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = -1.55; // extrude spans -0.3..1.5, so the top sits just under the court
  court.add(slab);

  court.add(flat(20, 44, COURT_BLUE, 0.02));
  const kitchenMat = () => new THREE.MeshStandardMaterial({ color: KITCHEN, roughness: 0.8, emissive: KITCHEN, emissiveIntensity: 0 });
  const kitchens = [3.5, -3.5].map((z) => {
    const k = new THREE.Mesh(new THREE.PlaneGeometry(20, 7), kitchenMat());
    k.rotation.x = -Math.PI / 2;
    k.position.set(0, 0.03, z);
    court.add(k);
    return k;
  });

  // Lines (2 inch wide)
  const lineMat = new THREE.MeshStandardMaterial({ color: '#f4f6ff', roughness: 0.6 });
  const L = 0.17;
  const line = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
    m.position.set(x, 0.05, z);
    court.add(m);
  };
  line(20 + L, L, 0, 22); line(20 + L, L, 0, -22);
  line(L, 44, 10, 0); line(L, 44, -10, 0);
  line(20, L, 0, 7); line(20, L, 0, -7);
  line(L, 15, 0, 14.5); line(L, 15, 0, -14.5);

  // Service box highlights
  const hlBox = (x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 15), new THREE.MeshBasicMaterial({ color: BOX_GLOW, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.06, z);
    court.add(m);
    return m.material;
  };
  const boxes = { nearR: hlBox(5, 14.5), nearL: hlBox(-5, 14.5), farL: hlBox(-5, -14.5), farR: hlBox(5, -14.5) };

  // Net
  const postMat = new THREE.MeshStandardMaterial({ color: '#f1f1f5', roughness: 0.4 });
  [-11, 11].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.1, 16), postMat);
    post.position.set(x, 1.55, 0);
    court.add(post);
  });
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 2.6),
    new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, color: '#111' })
  );
  net.position.set(0, 1.65, 0);
  court.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 0.08), postMat);
  tape.position.set(0, 3, 0);
  court.add(tape);

  // Ball, trail and bounce markers
  const ball = createBall(BALL_R);
  ball.visible = false;
  court.add(ball);
  const trailMat = new THREE.MeshBasicMaterial({ color: HIGHLIGHT, transparent: true, opacity: 0.9, depthWrite: false });
  let trail = null;
  let curve = null;
  const TUBE_SEG = 320, RAD_SEG = 8;
  const markerMat = () => new THREE.MeshBasicMaterial({ color: HIGHLIGHT, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const markers = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 40), markerMat());
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.08;
    court.add(m);
    return m;
  });

  function setPath(points) {
    if (trail) { court.remove(trail); trail.geometry.dispose(); }
    curve = new THREE.CatmullRomCurve3(points);
    trail = new THREE.Mesh(new THREE.TubeGeometry(curve, TUBE_SEG, 0.14, RAD_SEG), trailMat);
    trail.geometry.setDrawRange(0, 0);
    court.add(trail);
  }
  function setProgress(p) {
    if (!curve) return;
    trail.geometry.setDrawRange(0, Math.floor(p * TUBE_SEG) * RAD_SEG * 6);
    ball.position.copy(curve.getPointAt(Math.min(p, 0.999)));
  }

  // Paths
  const serveR = join(arc(v(5.5, 2.2, 23.5), v(-5, BALL_R, -15), 7));
  const serveL = join(arc(v(-5.5, 2.2, 23.5), v(5, BALL_R, -15), 7));
  const B1 = v(-5, BALL_R, -15), H2 = v(-5.6, 2.4, -20), B2 = v(4, BALL_R, 13);
  const rally = join(arc(v(5.5, 2.2, 23.5), B1, 7), arc(B1, H2, 1.8), arc(H2, B2, 6.5), arc(B2, v(4.6, 2.6, 18.5), 1.8));
  const dink = join(arc(v(3, 1.2, 9), v(-2, 3.2, -6.2), 3.2)); // volley attempt at the kitchen

  // Camera presets per rule
  const cams = [
    { pos: v(34, 26, 62), look: v(-5, 0, 3) },
    { pos: v(0, 84, 42), look: v(0, 0, 1) },
    { pos: v(-58, 30, 40), look: v(0, 0, 0) },
    { pos: v(38, 28, 20), look: v(0, 0, 0) },
    { pos: v(0, 100, 22), look: v(0, 0, 0) },
  ];

  const camPos = cams[0].pos.clone();
  const camLook = cams[0].look.clone();
  const hud = { onServeSide: null };
  let tl = null;
  let orbit = 0;
  let current = -1;
  const prog = { p: 0 };

  function resetFx() {
    Object.values(boxes).forEach((m) => gsap.to(m, { opacity: 0, duration: 0.4 }));
    kitchens.forEach((k) => { gsap.killTweensOf(k.material); gsap.to(k.material, { emissiveIntensity: 0, duration: 0.4 }); });
    markers.forEach((m) => { gsap.killTweensOf(m.material); gsap.killTweensOf(m.scale); m.material.opacity = 0; });
  }

  function flyThrough(points, dur = 2) {
    const t = gsap.timeline();
    t.call(() => { setPath(points); ball.visible = true; prog.p = 0; setProgress(0); trailMat.opacity = 0.9; });
    t.to(prog, { p: 1, duration: dur, ease: 'none', onUpdate: () => setProgress(prog.p) });
    return t;
  }
  function pulseMarker(m, pos) {
    return gsap.timeline()
      .call(() => { m.position.x = pos.x; m.position.z = pos.z; })
      .fromTo(m.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1.6, y: 1.6, z: 1.6, duration: 0.7, ease: 'power2.out' }, 0)
      .fromTo(m.material, { opacity: 1 }, { opacity: 0, duration: 0.9, ease: 'power2.out' }, 0);
  }

  const builders = [
    // 0 serve underhand
    () => gsap.timeline({ repeat: -1, repeatDelay: 0.6 })
      .to(boxes.farL, { opacity: 0.22, duration: 0.4 })
      .add(flyThrough(serveR, 1.9))
      .add(pulseMarker(markers[0], B1), '-=0.05')
      .to(trailMat, { opacity: 0, duration: 0.6 }, '+=0.5'),
    // 1 serve side: alternate even / odd
    () => gsap.timeline({ repeat: -1 })
      .call(() => hud.onServeSide?.('even'))
      .to([boxes.nearR, boxes.farL], { opacity: 0.22, duration: 0.4 })
      .add(flyThrough(serveR, 1.8))
      .to(trailMat, { opacity: 0, duration: 0.5 }, '+=0.5')
      .to([boxes.nearR, boxes.farL], { opacity: 0, duration: 0.4 }, '<')
      .call(() => hud.onServeSide?.('odd'))
      .to([boxes.nearL, boxes.farR], { opacity: 0.22, duration: 0.4 })
      .add(flyThrough(serveL, 1.8))
      .to(trailMat, { opacity: 0, duration: 0.5 }, '+=0.5')
      .to([boxes.nearL, boxes.farR], { opacity: 0, duration: 0.4 }, '<'),
    // 2 two bounces
    () => gsap.timeline({ repeat: -1, repeatDelay: 0.5 })
      .add(flyThrough(rally, 3.6))
      .add(pulseMarker(markers[0], B1), 1.35)
      .add(pulseMarker(markers[1], B2), 3.2)
      .to(trailMat, { opacity: 0, duration: 0.6 }, '+=0.4'),
    // 3 kitchen
    () => gsap.timeline({ repeat: -1, repeatDelay: 0.4 })
      .to(kitchens.map((k) => k.material), { emissiveIntensity: 0.9, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 0)
      .add(flyThrough(dink, 1.4), 0.3)
      .to(trailMat, { opacity: 0, duration: 0.6 }, '+=0.3'),
    // 4 play to 11: slow orbit overview
    () => { ball.visible = false; if (trail) trail.geometry.setDrawRange(0, 0); return gsap.timeline(); },
  ];

  function setStep(i) {
    if (i === current) return;
    current = i;
    tl?.kill();
    gsap.killTweensOf(prog);
    resetFx();
    if (trail) trail.geometry.setDrawRange(0, 0);
    gsap.to(camPos, { x: cams[i].pos.x, y: cams[i].pos.y, z: cams[i].pos.z, duration: reduced ? 0 : 1.6, ease: 'power3.inOut' });
    gsap.to(camLook, { x: cams[i].look.x, y: cams[i].look.y, z: cams[i].look.z, duration: reduced ? 0 : 1.6, ease: 'power3.inOut' });
    if (reduced) {
      // static illustration of each rule
      const statics = [
        () => { boxes.farL.opacity = 0.22; setPath(serveR); setProgress(1); ball.visible = true; },
        () => { boxes.nearR.opacity = boxes.farL.opacity = 0.22; setPath(serveR); setProgress(1); ball.visible = true; },
        () => { setPath(rally); setProgress(1); ball.visible = true; },
        () => { kitchens.forEach((k) => (k.material.emissiveIntensity = 0.6)); ball.visible = false; },
        () => { ball.visible = false; },
      ];
      trailMat.opacity = 0.9;
      statics[i]();
      render();
      return;
    }
    tl = builders[i]();
  }

  // Pointer tilt
  const pointer = { x: 0, tx: 0 };
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
  }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // pull back on tall/narrow stages so the whole court stays in frame
    camera.fov = camera.aspect < 1 ? 44 : 38;
    camera.updateProjectionMatrix();
    if (reduced) render();
  }
  function render() {
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  if (!reduced) {
    visibilityLoop(canvas, (dt) => {
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      if (current === 4) orbit += dt * 0.25;
      else orbit += (Math.round(orbit / (Math.PI * 2)) * Math.PI * 2 - orbit) * 0.04; // ease back to square
      court.rotation.y = pointer.x * 0.12 + orbit;
      render();
    });
  }

  setStep(0);
  return { setStep, hud };
}
