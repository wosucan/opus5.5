import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =========================================================
   鹈鹕骑行记 · Pelican Ride 3D
   ========================================================= */
const $ = (id) => document.getElementById(id);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const UP = v3(0, 1, 0);

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf7b98a, 45, 320);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 1500);
camera.position.set(4.2, 2.0, 5.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, -0.8);
controls.enableDamping = true;
controls.minDistance = 1.8;
controls.maxDistance = 35;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.addEventListener('start', () => { controls.autoRotate = false; });

// post-processing (bloom)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let bloomOn = true;
function renderFrame() { if (bloomOn) composer.render(); else renderer.render(scene, camera); }

// ---------- helpers ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
const sphGeo = new THREE.SphereGeometry(1, 28, 20);

function tube(a, b, r, mat) {
  const m = new THREE.Mesh(cylGeo, mat);
  setTube(m, a, b, r);
  return m;
}
function setTube(m, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  if (r !== undefined) m.scale.set(r, len, r); else m.scale.y = len;
}
function limb(a, b, rx, rz, mat) {
  const m = new THREE.Mesh(sphGeo, mat);
  const d = new THREE.Vector3().subVectors(b, a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.clone().normalize());
  m.scale.set(rx, d.length() / 2, rz);
  return m;
}
function ball(r, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(sphGeo, mat);
  m.position.set(x, y, z);
  m.scale.set(r * sx, r * sy, r * sz);
  return m;
}
function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function noise(g, w, h, n, base, spread, size = 2) {
  for (let i = 0; i < n; i++) {
    const k = Math.random() * spread - spread / 2;
    g.fillStyle = `rgb(${base[0] + k | 0},${base[1] + k | 0},${base[2] + k | 0})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}
function glowTexture(inner = 'rgba(255,230,160,1)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,200,120,.45)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = glowTexture();

// ---------- sky ----------
const skyU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, offset: { value: 30 }, exponent: { value: 0.55 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exponent; varying vec3 vW;
    void main(){ float h = normalize(vW + vec3(0.,offset,0.)).y; gl_FragColor = vec4(mix(bottom, top, pow(max(h,0.), exponent)), 1.);
    #include <colorspace_fragment>
    }`
}));
scene.add(sky);

// stars
const starGeo = new THREE.BufferGeometry();
{
  const p = [];
  for (let i = 0; i < 2000; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
    p.push(800 * Math.sin(ph) * Math.cos(th), 800 * Math.cos(ph), 800 * Math.sin(ph) * Math.sin(th));
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
scene.add(new THREE.Points(starGeo, starMat));

// sun / moon orb
const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
const orb = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 16), orbMat);
scene.add(orb);
const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
orbGlow.scale.set(160, 160, 1);
scene.add(orbGlow);

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xdfefff, 0x6b8a4a, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 250 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xfff3e6, 0.9); fill.position.set(8, 10, 30); scene.add(fill);

// ---------- ground: road / sidewalk / grass / beach ----------
const TILE = 10;
const roadTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#3d3f45'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 6000, [62, 64, 70], 30);
  g.fillStyle = '#eeeeee'; g.fillRect(0, 12, w, 8); g.fillRect(0, h - 20, w, 8);
  g.fillStyle = '#ffc93c'; g.fillRect(0, h / 2 - 12, 300, 7); g.fillRect(0, h / 2 + 5, 300, 7);
}, 600 / TILE, 1);
const road = new THREE.Mesh(new THREE.PlaneGeometry(600, 4.2), M(0xffffff, { map: roadTex, roughness: 0.85 }));
road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);

const walkTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 2500, [205, 197, 183], 30);
  g.strokeStyle = '#9d9486'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
}, 600 / 2.5, 1);
const walk = new THREE.Mesh(new THREE.BoxGeometry(600, 0.16, 2.5), M(0xffffff, { map: walkTex, roughness: 0.9 }));
walk.position.set(0, 0.08, 3.35); walk.receiveShadow = true; scene.add(walk);

const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#5e9a3e'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 9000, [90, 150, 60], 50, 2);
}, 600 / 8, 120 / 8);
const grass = new THREE.Mesh(new THREE.PlaneGeometry(600, 120), M(0xffffff, { map: grassTex, roughness: 1 }));
grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0.03, 64.6); grass.receiveShadow = true; scene.add(grass);

const stoneTex = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#8d8579'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
    const k = rand(-18, 18);
    g.fillStyle = `rgb(${150 + k | 0},${140 + k | 0},${125 + k | 0})`;
    const off = (r % 2) * 28;
    g.beginPath(); g.roundRect(c * 58 + off - 28 + 3, r * 43 + 3, 52, 37, 8); g.fill();
  }
  noise(g, w, h, 2000, [130, 122, 110], 40);
}, 600 / 4, 1);
const wall = new THREE.Mesh(new THREE.BoxGeometry(600, 0.7, 0.45), M(0xffffff, { map: stoneTex, roughness: 0.95 }));
wall.position.set(0, 0.2, -2.35); wall.castShadow = wall.receiveShadow = true; scene.add(wall);

const sandTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#e3c894'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 8000, [220, 195, 145], 40);
}, 600 / 6, 2);
const beach = new THREE.Mesh(new THREE.PlaneGeometry(600, 9.8), M(0xffffff, { map: sandTex, roughness: 1 }));
beach.rotation.x = -Math.PI / 2 - 0.155;
beach.position.set(0, -1.05, -7.4); beach.receiveShadow = true; scene.add(beach);
const scrollTextures = [[roadTex, TILE], [walkTex, 2.5], [grassTex, 8], [stoneTex, 4], [sandTex, 6]];

// ---------- ocean ----------
const oceanGeo = new THREE.PlaneGeometry(700, 320, 170, 80);
oceanGeo.rotateX(-Math.PI / 2);
const oceanBase = Float32Array.from(oceanGeo.attributes.position.array);
const oceanMat = M(0x2a6f8f, { roughness: 0.12, metalness: 0.35, flatShading: true, transparent: true, opacity: 0.93 });
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.position.set(0, -1.05, -162);
scene.add(ocean);
function waveH(x, z, t) {
  return Math.sin(x * 0.12 + t * 0.8) * 0.28 + Math.sin(z * 0.17 + t * 1.1) * 0.22 + Math.sin((x + z) * 0.31 + t * 1.7) * 0.09;
}
function updateOcean(t, scroll) {
  const p = oceanGeo.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const x = oceanBase[i] + scroll, z = oceanBase[i + 2] - 162;
    const shore = THREE.MathUtils.smoothstep(-z, 4, 22);
    p[i + 1] = waveH(x, z, t) * (0.25 + 0.75 * shore);
  }
  oceanGeo.attributes.position.needsUpdate = true;
}

// ---------- scrolling world ----------
const scrollers = [];
function addScroll(obj, wrap = 170, factor = 1) { scrollers.push({ obj, wrap, factor }); scene.add(obj); return obj; }
function shadows(o, cast = true, recv = true) { o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = recv; } }); return o; }

// shared night-reactive materials
const lampMat = M(0xfff1c4, { emissive: 0xffc56b, emissiveIntensity: 0.2 });
const windowMat = M(0x5a6b80, { emissive: 0xffb95c, emissiveIntensity: 0, roughness: 0.3 });
const glowSprites = [];
const lightPools = [];

// palms
const trunkMat = M(0x8a6a45, { roughness: 1 });
const leafMat = M(0x3f9b3a, { roughness: 0.8, side: THREE.DoubleSide });
const cocoMat = M(0x5a3b1c);
function makePalm() {
  const g = new THREE.Group();
  const h = rand(4.5, 7), lean = rand(-1.2, 1.2), leanZ = rand(-0.6, 0.6);
  const pts = []; const N = 9;
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(v3(lean * t * t, h * t, leanZ * t * t)); }
  for (let i = 0; i < N; i++) g.add(tube(pts[i], pts[i + 1], 0.2 - i * 0.012, trunkMat));
  const top = pts[N];
  for (let i = 0; i < 8; i++) {
    const pivot = new THREE.Group();
    pivot.position.copy(top);
    pivot.rotation.set(0, (i / 8) * Math.PI * 2 + rand(-.2, .2), -rand(0.25, 0.7));
    const leaf = ball(1, leafMat, 1.3, 0, 0, 1.5, 0.04, 0.32);
    pivot.add(leaf);
    g.add(pivot);
  }
  for (let i = 0; i < 3; i++) g.add(ball(0.13, cocoMat, top.x + Math.cos(i * 2.1) * 0.18, top.y - 0.15, top.z + Math.sin(i * 2.1) * 0.18));
  return shadows(g, true, false);
}

// houses
const housePalette = [0xf6e3c5, 0xbfe0e8, 0xf3c9b8, 0xfff2b3, 0xd7eccb, 0xf7d6e0];
const roofMats = [M(0xc2513a), M(0xb8432f), M(0x3f6f9a), M(0xd0703a)];
const doorMat = M(0x6b4226);
const awningMat = M(0xe86a4f, { side: THREE.DoubleSide });
function makeHouse() {
  const g = new THREE.Group();
  const w = rand(3.5, 5.5), h = rand(2.8, 4.8), d = rand(3.5, 4.5);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(housePalette[Math.random() * housePalette.length | 0], { roughness: 0.9 }));
  body.position.y = h / 2; g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1.7, 4), roofMats[Math.random() * roofMats.length | 0]);
  roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.SQRT2 * 1.18, 1, d / Math.SQRT2 * 1.18);
  roof.position.y = h + 0.85; g.add(roof);
  const floors = h > 3.8 ? 2 : 1;
  const winGeo = new THREE.PlaneGeometry(0.6, 0.75);
  for (let f = 0; f < floors; f++) for (let i = 0; i < 3; i++) {
    const x = -w / 2 + (i + 0.5) * (w / 3);
    if (f === 0 && i === 1) continue;
    const win = new THREE.Mesh(winGeo, windowMat);
    win.position.set(x, 1.3 + f * 1.7, -d / 2 - 0.01); win.rotation.y = Math.PI; g.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.6), doorMat);
  door.position.set(0, 0.8, -d / 2 - 0.01); door.rotation.y = Math.PI; g.add(door);
  const aw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 0.9), awningMat);
  aw.position.set(0, 2.05, -d / 2 - 0.4); aw.rotation.x = -Math.PI / 2 + 0.5; g.add(aw);
  if (Math.random() < 0.6) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), M(0x8d6e63)); ch.position.set(w * 0.25, h + 1.2, d * 0.15); g.add(ch);
  }
  return shadows(g);
}

// street lamps
const poleMat = M(0x2f4f4f, { metalness: 0.6, roughness: 0.4 });
function makeLamp() {
  const g = new THREE.Group();
  g.add(tube(v3(0, 0, 0), v3(0, 3.3, 0), 0.06, poleMat));
  g.add(tube(v3(0, 3.3, 0), v3(0, 3.5, -0.8), 0.04, poleMat));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.25, 12), poleMat); head.position.set(0, 3.45, -0.85); g.add(head);
  const bulb = ball(0.1, lampMat, 0, 3.3, -0.85); g.add(bulb);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  s.position.set(0, 3.3, -0.85); s.scale.set(2.2, 2.2, 1); g.add(s); glowSprites.push(s);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshBasicMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, -0.06, -1.6); g.add(pool); lightPools.push(pool);
  shadows(g, true, false);
  bulb.castShadow = false;
  return g;
}

// bushes with flowers
const bushMat = M(0x3c7d33, { roughness: 1 });
const flowerMats = [M(0xff6b6b), M(0xffd93d), M(0xff9ff3), M(0xffffff), M(0xff8c42)];
function makeBush() {
  const g = new THREE.Group();
  const n = 3 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) g.add(ball(rand(0.3, 0.5), bushMat, rand(-0.5, 0.5), rand(0.2, 0.4), rand(-0.3, 0.3)));
  const fm = flowerMats[Math.random() * flowerMats.length | 0];
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * 1.2;
    g.add(ball(0.06, fm, Math.cos(a) * 0.5 * Math.sin(b) + rand(-.2, .2), 0.35 + Math.cos(b) * 0.35, Math.sin(a) * 0.4));
  }
  return shadows(g);
}

// beach rocks
const rockMat = M(0x7b7d80, { roughness: 1, flatShading: true });
function makeRock() {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.9), 0), rockMat);
  m.scale.y = rand(0.5, 0.9); m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); return g;
}

// billboard with the AI poster
function makeBillboard(img = 'assets/poster.jpg', bw = 6, bh = 4) {
  const g = new THREE.Group();
  const tex = new THREE.TextureLoader().load(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, roughness: 0.6 }));
  board.position.y = 2.4 + bh / 2; board.rotation.y = Math.PI; g.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.3, bh + 0.3, 0.15), M(0x333333)); frame.position.set(0, 2.4 + bh / 2, 0.09); g.add(frame);
  g.add(tube(v3(-bw / 3, 0, 0.2), v3(-bw / 3, 2.4, 0.2), 0.1, poleMat));
  g.add(tube(v3(bw / 3, 0, 0.2), v3(bw / 3, 2.4, 0.2), 0.1, poleMat));
  return shadows(g);
}

// populate
const W = 170;
for (let i = 0; i < 20; i++) { const p = makePalm(); p.position.set(-W / 2 + (i + Math.random() * 0.6) * (W / 20), 0.05, rand(4.8, 6.2)); addScroll(p, W); }
for (let i = 0; i < 10; i++) { const p = makePalm(); p.position.set(rand(-W / 2, W / 2), 0.05, rand(14, 22)); p.scale.setScalar(rand(1, 1.3)); addScroll(p, W); }
for (let i = 0; i < 10; i++) { const h = makeHouse(); h.position.set(-W / 2 + i * (W / 10) + rand(0, 4), 0.05, rand(9.5, 11.5)); h.rotation.y = rand(-0.08, 0.08); addScroll(h, W); }
for (let i = 0; i < 12; i++) { const l = makeLamp(); l.position.set(-W / 2 + i * (W / 12), 0.16, 2.4); addScroll(l, W); }
for (let i = 0; i < 34; i++) { const b = makeBush(); b.position.set(rand(-W / 2, W / 2), 0.05, rand(4.2, 5.0)); b.scale.setScalar(rand(0.7, 1.2)); addScroll(b, W); }
for (let i = 0; i < 26; i++) { const r = makeRock(); const z = rand(-3.5, -9); r.position.set(rand(-W / 2, W / 2), -0.35 + (z + 2.4) * 0.157, z); addScroll(r, W); }
{ const bb = makeBillboard(); bb.position.set(30, 0.05, 7.2); addScroll(bb, W); }
{ const bb = makeBillboard('assets/poster2.jpg', 3, 4.5); bb.position.set(-45, 0.05, 7.0); addScroll(bb, W); }

// distant hills & mountains
const mountMat = M(0x6f86a6, { roughness: 1, flatShading: true });
const hillMat = M(0x5c8f4a, { roughness: 1, flatShading: true });
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(rand(30, 60), rand(25, 55), 7), mountMat);
  m.position.set(-300 + i * 45 + rand(-10, 10), -1, rand(-230, -270)); m.rotation.y = rand(0, 3);
  addScroll(m, 630, 1);
}
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(rand(15, 30), 9, 6), hillMat);
  m.scale.y = rand(0.35, 0.6); m.position.set(-300 + i * 45 + rand(-10, 10), -2, rand(70, 110));
  addScroll(m, 630, 1);
}

// lighthouse on an island
const lighthouse = new THREE.Group();
let beamPivot, lhLight, beamMat, lampRoomMat;
{
  const island = new THREE.Mesh(new THREE.CylinderGeometry(7, 11, 4, 9), rockMat); island.position.y = 0; lighthouse.add(island);
  const isGrass = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 7, 0.4, 9), hillMat); isGrass.position.y = 2.1; lighthouse.add(isGrass);
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.5 - (i + 1) * 0.1, 1.5 - i * 0.1, 2, 20), M(i % 2 ? 0xffffff : 0xd62828, { roughness: 0.7 }));
    seg.position.y = 3.2 + i * 2; lighthouse.add(seg);
  }
  const gal = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.25, 20), M(0x333333)); gal.position.y = 14.3; lighthouse.add(gal);
  lampRoomMat = M(0xfff4c2, { emissive: 0xffd36b, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 });
  const room = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 16), lampRoomMat); room.position.y = 15.1; lighthouse.add(room);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.2, 16), M(0xb02020)); cap.position.y = 16.35; lighthouse.add(cap);
  beamPivot = new THREE.Group(); beamPivot.position.y = 15.1; lighthouse.add(beamPivot);
  beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.ConeGeometry(5, 70, 24, 1, true); beamGeo.translate(0, -35, 0); beamGeo.rotateZ(Math.PI / 2);
  beamPivot.add(new THREE.Mesh(beamGeo, beamMat));
  const beam2 = new THREE.Mesh(beamGeo, beamMat); beam2.rotation.y = Math.PI; beamPivot.add(beam2);
  lhLight = new THREE.PointLight(0xffd98a, 0, 80, 1.2); lhLight.position.y = 15.1; lighthouse.add(lhLight);
  shadows(lighthouse, false, true);
  lighthouse.position.set(40, -1.8, -48);
  addScroll(lighthouse, 360, 1);
}

// sailboats
const boats = [];
function makeBoat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1), M(0xffffff)); hull.position.y = 0.3; g.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.12, 1.02), M(0x1d4e89)); stripe.position.y = 0.45; g.add(stripe);
  g.add(tube(v3(0, 0.6, 0), v3(0, 4.6, 0), 0.05, M(0x8d6e63)));
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 3.8); sh.lineTo(-1.8, 0); sh.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), M(Math.random() < 0.5 ? 0xfff8e7 : 0xffd6a5, { side: THREE.DoubleSide }));
  sail.position.set(-0.05, 0.75, 0); g.add(sail);
  const sh2 = new THREE.Shape(); sh2.moveTo(0, 0); sh2.lineTo(0, 3.4); sh2.lineTo(1.3, 0); sh2.closePath();
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(sh2), M(0xffffff, { side: THREE.DoubleSide })); jib.position.set(0.05, 0.9, 0); g.add(jib);
  return g;
}
for (let i = 0; i < 7; i++) {
  const b = makeBoat(); b.position.set(rand(-150, 150), -1.05, rand(-18, -110)); b.userData = { drift: rand(0.5, 2), phase: rand(0, 6) };
  b.scale.setScalar(rand(0.9, 1.4)); boats.push(b); addScroll(b, 320, 1);
}

// clouds
const cloudMat = M(0xffffff, { roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.05, flatShading: true });
const clouds = [];
for (let i = 0; i < 18; i++) {
  const g = new THREE.Group();
  const n = 5 + (Math.random() * 5 | 0);
  for (let j = 0; j < n; j++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(3, 7), 1), cloudMat);
    s.position.set(j * 4 - n * 2 + rand(-1, 1), rand(-1, 2), rand(-2, 2)); s.scale.y = 0.6; g.add(s);
  }
  const side = Math.random() < 0.75 ? -1 : 1;
  g.position.set(rand(-250, 250), rand(30, 60), side < 0 ? rand(-60, -220) : rand(60, 180));
  clouds.push(g); addScroll(g, 520, 0.35);
}

// seagulls
const gulls = [];
const gullBody = M(0xffffff), gullWing = M(0xdfe3e8), gullTip = M(0x333333);
for (let i = 0; i < 8; i++) {
  const g = new THREE.Group();
  g.add(ball(1, gullBody, 0, 0, 0, 0.09, 0.08, 0.28));
  g.add(ball(1, M(0xffb000), 0, 0, 0.3, 0.02, 0.02, 0.06));
  const wings = [];
  for (const s of [1, -1]) {
    const p = new THREE.Group();
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.2), gullWing); w.position.x = 0.35 * s; p.add(w);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.14), gullTip); t.position.x = 0.75 * s; p.add(t);
    g.add(p); wings.push(p);
  }
  g.userData = { wings, cx: rand(-10, 25), cy: rand(6, 14), cz: rand(-8, -30), r: rand(4, 12), sp: rand(0.3, 0.6) * (Math.random() < .5 ? 1 : -1), ph: rand(0, 6) };
  gulls.push(g); scene.add(g);
}

// ---------- the rider: bike + pelican ----------
const rig = new THREE.Group();
rig.position.set(0, 0, -0.8);
scene.add(rig);
const bike = new THREE.Group();
rig.add(bike);

const redMat = M(0xd62828, { metalness: 0.45, roughness: 0.3 });
const chromeMat = M(0xe6e6e6, { metalness: 0.95, roughness: 0.18 });
const rubberMat = M(0x1b1b1b, { roughness: 0.95 });
const darkMat = M(0x222222, { metalness: 0.5, roughness: 0.5 });
const R = 0.35;
const P = { rear: v3(-0.55, R, 0), bb: v3(0, 0.3, 0), seat: v3(-0.15, 0.85, 0), headT: v3(0.42, 0.92, 0), headB: v3(0.47, 0.68, 0), front: v3(0.58, R, 0) };

function makeWheel() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 12, 48), rubberMat));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(R - 0.035, 0.014, 8, 48), chromeMat));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, s = i % 2 ? 1 : -1;
    g.add(tube(v3(0, 0, 0.035 * s), v3(Math.cos(a) * (R - 0.04), Math.sin(a) * (R - 0.04), 0), 0.004, chromeMat));
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), chromeMat); hub.rotation.x = Math.PI / 2; g.add(hub);
  // reflector for spin readability
  const refl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.01), M(0xff7b00, { emissive: 0xff5500, emissiveIntensity: 0.4 }));
  refl.position.set(0, R * 0.6, 0.03); g.add(refl);
  return g;
}
const rearW = makeWheel(); rearW.position.copy(P.rear); bike.add(rearW);
const frontW = makeWheel(); frontW.position.copy(P.front); bike.add(frontW);

bike.add(tube(P.bb, P.seat, 0.028, redMat));
bike.add(tube(P.bb, P.headB, 0.033, redMat));
bike.add(tube(P.seat, P.headT, 0.028, redMat));
bike.add(tube(P.headB, P.headT, 0.038, redMat));
for (const s of [-1, 1]) {
  bike.add(tube(v3(-0.55, R, 0.06 * s), v3(0, 0.3, 0.03 * s), 0.016, redMat));
  bike.add(tube(v3(-0.55, R, 0.06 * s), v3(-0.15, 0.83, 0.02 * s), 0.014, redMat));
  bike.add(tube(v3(0.47, 0.68, 0.03 * s), v3(0.58, R, 0.06 * s), 0.018, chromeMat));
}
bike.add(tube(P.seat, v3(-0.17, 0.93, 0), 0.018, chromeMat));
bike.add(ball(1, rubberMat, -0.19, 0.955, 0, 0.15, 0.04, 0.09));
bike.add(tube(P.headT, v3(0.4, 1.05, 0), 0.02, chromeMat));
bike.add(tube(v3(0.4, 1.05, -0.2), v3(0.4, 1.05, 0.2), 0.016, chromeMat));
for (const s of [-1, 1]) {
  bike.add(tube(v3(0.4, 1.05, 0.2 * s), v3(0.34, 1.07, 0.28 * s), 0.016, chromeMat));
  bike.add(tube(v3(0.34, 1.07, 0.24 * s), v3(0.32, 1.075, 0.31 * s), 0.025, rubberMat));
}
// fenders
for (const [w, rz] of [[P.rear, 0.1], [P.front, 0.35]]) {
  const f = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 6, 24, Math.PI * 0.85), redMat);
  f.position.copy(w); f.rotation.z = rz; f.scale.z = 2.4; bike.add(f);
}
// chain
bike.add(tube(v3(0, 0.4, 0.07), v3(-0.55, R + 0.045, 0.07), 0.006, darkMat));
bike.add(tube(v3(0, 0.2, 0.07), v3(-0.55, R - 0.045, 0.07), 0.006, darkMat));
const cog = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), darkMat); cog.rotation.x = Math.PI / 2; cog.position.set(-0.55, R, 0.07); bike.add(cog);
// crank
const crank = new THREE.Group(); crank.position.copy(P.bb); bike.add(crank);
{
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 28), chromeMat); ring.rotation.x = Math.PI / 2; ring.position.z = 0.07; crank.add(ring);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; crank.add(tube(v3(0, 0, 0.078), v3(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.078), 0.008, darkMat)); }
  crank.add(tube(v3(0, 0, -0.12), v3(0, 0, 0.12), 0.018, chromeMat));
  crank.add(tube(v3(0, 0, 0.11), v3(0.15, 0, 0.12), 0.013, chromeMat));
  crank.add(tube(v3(0, 0, -0.11), v3(-0.15, 0, -0.12), 0.013, chromeMat));
}
const pedals = [];
for (const s of [1, -1]) {
  const p = new THREE.Group(); p.position.set(0.15 * s, 0, 0.16 * s);
  p.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.08), rubberMat));
  crank.add(p); pedals.push(p);
}
// basket + fish
const wickerTex = canvasTex(128, 64, (g, w, h) => {
  g.fillStyle = '#a8733a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#6e4620'; g.lineWidth = 2;
  for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 16) { g.fillStyle = (y / 8) % 2 ? '#c48a48' : '#b37a3b'; g.fillRect(x + ((y / 8) % 2) * 8, y + 1, 8, 6); }
}, 4, 1);
const basket = new THREE.Group(); basket.position.set(0.66, 0.9, 0); bike.add(basket);
{
  const wickMat = M(0xffffff, { map: wickerTex, side: THREE.DoubleSide, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.2, 18, 1, true), wickMat); basket.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.14, 18), wickMat); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.1; basket.add(bottom);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 6, 24), M(0x7a4b20)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; basket.add(rim);
  const fishMat = M(0x9fb6c8, { metalness: 0.7, roughness: 0.3 });
  const fish = new THREE.Group(); fish.position.set(0.02, 0.1, 0.05); fish.rotation.z = 1.0; basket.add(fish);
  fish.add(ball(1, fishMat, 0, 0, 0, 0.13, 0.05, 0.035));
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 4), fishMat); tail.rotation.z = Math.PI / 2; tail.position.x = -0.15; tail.scale.z = 0.3; fish.add(tail);
  fish.add(ball(0.012, M(0x111111), 0.09, 0.015, 0.03));
  basket.userData.fish = fish;
}
bike.add(tube(v3(0.42, 0.9, 0), v3(0.62, 0.82, 0), 0.01, chromeMat));
// bell
const bellMesh = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xffd24a, { metalness: 0.9, roughness: 0.2 }));
bellMesh.position.set(0.4, 1.066, 0.12); bike.add(bellMesh);
// headlight
const headLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 14), chromeMat); headLamp.rotation.z = Math.PI / 2; headLamp.position.set(0.46, 0.94, 0); bike.add(headLamp);
const headLampGlass = ball(0.03, lampMat, 0.49, 0.94, 0, 0.4, 1, 1); bike.add(headLampGlass);
const headlight = new THREE.SpotLight(0xfff2cc, 0, 30, 0.45, 0.6, 1.2);
headlight.position.set(0.5, 0.94, 0); bike.add(headlight);
const hlTarget = new THREE.Object3D(); hlTarget.position.set(8, 0, 0); bike.add(hlTarget); headlight.target = hlTarget;
const tailLight = ball(0.025, M(0xff2020, { emissive: 0xff0000, emissiveIntensity: 0.3 }), -0.7, 0.62, 0, 0.5, 1, 1.4); bike.add(tailLight);

// pelican
const pel = new THREE.Group(); bike.add(pel);
const featherMat = M(0xfbfbf8, { roughness: 0.85 });
const creamMat = M(0xf2e6cc, { roughness: 0.9 });
const beakMat = M(0xff9a2e, { roughness: 0.45 });
const pouchMat = M(0xffb35c, { roughness: 0.5 });
const legMat = M(0xf28c28, { roughness: 0.6 });
const blackMat = M(0x151515, { roughness: 0.6 });
const scarfMat = M(0xe63946, { roughness: 0.7, side: THREE.DoubleSide });

const torso = new THREE.Group(); pel.add(torso);
{
  const body = ball(1, featherMat, -0.08, 1.2, 0, 0.34, 0.44, 0.3); body.rotation.z = -0.4; torso.add(body);
  const belly = ball(1, creamMat, 0.06, 1.12, 0, 0.22, 0.3, 0.24); belly.rotation.z = -0.4; torso.add(belly);
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), i === 1 ? featherMat : blackMat);
    t.position.set(-0.4, 0.95, (i - 1) * 0.08); t.rotation.z = Math.PI / 2 + 0.5; t.scale.z = 0.4; torso.add(t);
  }
}
// neck & head
const neckG = new THREE.Group(); neckG.position.set(0.05, 1.45, 0); torso.add(neckG);
{
  const curve = new THREE.CatmullRomCurve3([v3(0, 0, 0), v3(0.07, 0.2, 0), v3(0.0, 0.4, 0), v3(0.1, 0.56, 0)]);
  neckG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.07, 12), featherMat));
  neckG.add(ball(0.075, featherMat));
}
const headG = new THREE.Group(); headG.position.set(0.12, 0.58, 0); neckG.add(headG);
const eyes = [];
let pouchG;
{
  headG.add(ball(0.13, featherMat, 0, 0, 0, 1.05, 1, 0.95));
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), featherMat);
    c.position.set(-0.05 + i * 0.015, 0.13, (i % 3 - 1) * 0.03); c.rotation.z = 0.5 - i * 0.12; headG.add(c);
  }
  for (const s of [1, -1]) {
    const e = new THREE.Group(); e.position.set(0.07, 0.04, 0.085 * s);
    e.add(ball(0.042, M(0xffffff, { roughness: 0.2 })));
    e.add(ball(0.024, M(0x2a6fdb, { roughness: 0.2 }), 0.022, 0.004, 0.022 * s));
    e.add(ball(0.013, blackMat, 0.03, 0.004, 0.03 * s));
    e.add(ball(0.006, M(0xffffff, { emissive: 0xffffff }), 0.04, 0.016, 0.03 * s));
    headG.add(e); eyes.push(e);
  }
  const beakG = new THREE.Group(); beakG.position.set(0.1, -0.02, 0); beakG.rotation.z = -0.28; headG.add(beakG);
  const upperGeo = new THREE.CylinderGeometry(0.022, 0.055, 0.62, 12); upperGeo.rotateZ(-Math.PI / 2);
  const upper = new THREE.Mesh(upperGeo, beakMat); upper.position.x = 0.31; upper.scale.y = 0.55; beakG.add(upper);
  beakG.add(ball(0.028, M(0xe0701a), 0.62, -0.012, 0, 1.2, 0.8, 0.8));
  pouchG = new THREE.Group(); pouchG.position.set(0.01, -0.02, 0); beakG.add(pouchG);
  const lowerGeo = new THREE.CylinderGeometry(0.018, 0.045, 0.58, 10); lowerGeo.rotateZ(-Math.PI / 2);
  const lower = new THREE.Mesh(lowerGeo, beakMat); lower.position.set(0.3, -0.01, 0); lower.scale.y = 0.4; pouchG.add(lower);
  pouchG.add(ball(1, pouchMat, 0.26, -0.07, 0, 0.27, 0.1, 0.065));
}
// scarf
const scarfTails = [];
{
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.035, 8, 20), scarfMat);
  ring.rotation.x = Math.PI / 2; ring.position.set(0.02, 0.08, 0); neckG.add(ring);
  for (let i = 0; i < 2; i++) {
    const piv = new THREE.Group(); piv.position.set(-0.07, 0.08, 0.02 - i * 0.04); neckG.add(piv);
    const seg1 = new THREE.Group(); piv.add(seg1);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), scarfMat); a.position.x = -0.1; seg1.add(a);
    const seg2 = new THREE.Group(); seg2.position.x = -0.2; seg1.add(seg2);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.065), scarfMat); b.position.x = -0.09; seg2.add(b);
    scarfTails.push({ piv, seg1, seg2, ph: i * 1.3 });
  }
}
// wings
for (const s of [1, -1]) {
  const sh = v3(0.02, 1.42, 0.27 * s), el = v3(-0.12, 1.14, 0.33 * s), hand = v3(0.34, 1.07, 0.27 * s);
  torso.add(limb(sh, el, 0.09, 0.055, featherMat));
  torso.add(limb(el, hand, 0.075, 0.045, featherMat));
  torso.add(limb(v3(-0.1, 1.09, 0.34 * s), v3(0.3, 1.02, 0.29 * s), 0.05, 0.03, blackMat));
  torso.add(limb(v3(0.2, 1.08, 0.29 * s), v3(0.4, 1.06, 0.27 * s), 0.05, 0.035, blackMat));
  torso.add(ball(0.055, featherMat, hand.x, hand.y + 0.01, hand.z, 1.2, 0.9, 0.9));
}
// legs (IK driven)
const legs = [];
for (const s of [1, -1]) {
  const hip = v3(-0.1, 0.98, 0.13 * s);
  const thigh = new THREE.Mesh(cylGeo, featherMat);
  const shin = new THREE.Mesh(cylGeo, legMat);
  const knee = ball(0.04, legMat);
  const foot = new THREE.Group();
  const fShape = new THREE.Shape(); fShape.moveTo(0, 0); fShape.lineTo(0.14, 0.06); fShape.quadraticCurveTo(0.16, 0, 0.14, -0.06); fShape.closePath();
  const fm = new THREE.Mesh(new THREE.ShapeGeometry(fShape), M(0xf07f1c, { side: THREE.DoubleSide })); fm.rotation.x = -Math.PI / 2; foot.add(fm);
  pel.add(thigh, shin, knee, foot);
  legs.push({ s, hip, thigh, shin, knee, foot });
}
shadows(rig, true, true);
headlight.castShadow = false;

// ---------- particles (dust) ----------
const DUST = 90;
const dustPos = new Float32Array(DUST * 3).fill(-999);
const dustVel = new Float32Array(DUST * 3);
const dustLife = new Float32Array(DUST);
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd8c7a8, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false }));
scene.add(dust);
let dustIdx = 0, dustAcc = 0;

// ---------- time of day ----------
const PRESETS = {
  day: { top: 0x2f7fe0, bottom: 0xcfeaff, fog: 0xd4ecff, sun: 0xfff4dc, sunI: 2.8, dir: v3(30, 70, -60), hemi: 1.1, night: 0, water: 0x1f8fb3, orb: 0xfffbe8, orbS: 0.8, exp: 1.0 },
  sunset: { top: 0x4b5aa6, bottom: 0xffa966, fog: 0xf7b98a, sun: 0xffa45c, sunI: 2.2, dir: v3(70, 14, -140), hemi: 0.7, night: 0.25, water: 0x2f6f96, orb: 0xffd08a, orbS: 1.4, exp: 1.05 },
  night: { top: 0x040919, bottom: 0x1b2754, fog: 0x10182f, sun: 0x9fb4ff, sunI: 0.55, dir: v3(-40, 60, -90), hemi: 0.22, night: 1, water: 0x0c2946, orb: 0xe8eeff, orbS: 0.7, exp: 1.15 },
};
const cur = {
  top: new THREE.Color(), bottom: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), water: new THREE.Color(), orb: new THREE.Color(),
  dir: v3(0, 1, 0), sunI: 1, hemi: 1, night: 0, orbS: 1, exp: 1,
};
let tod = 'sunset';
function snapTod(name) {
  const p = PRESETS[name];
  for (const k of ['top', 'bottom', 'fog', 'sun', 'water', 'orb']) cur[k].set(p[k]);
  cur.dir.copy(p.dir); Object.assign(cur, { sunI: p.sunI, hemi: p.hemi, night: p.night, orbS: p.orbS, exp: p.exp });
}
snapTod(tod);
const tmpC = new THREE.Color();
function updateTod(dt) {
  const p = PRESETS[tod], k = 1 - Math.exp(-dt * 1.6);
  for (const key of ['top', 'bottom', 'fog', 'sun', 'water', 'orb']) cur[key].lerp(tmpC.set(p[key]), k);
  cur.dir.lerp(p.dir, k);
  for (const key of ['sunI', 'hemi', 'night', 'orbS', 'exp']) cur[key] += (p[key] - cur[key]) * k;
  skyU.top.value.copy(cur.top); skyU.bottom.value.copy(cur.bottom);
  scene.fog.color.copy(cur.fog);
  const d = cur.dir.clone().normalize();
  sun.position.copy(d).multiplyScalar(90); sun.color.copy(cur.sun); sun.intensity = cur.sunI;
  orb.position.copy(d).multiplyScalar(700); orbMat.color.copy(cur.orb); orb.scale.setScalar(cur.orbS * 1.6);
  orbGlow.position.copy(d).multiplyScalar(690); orbGlow.material.color.copy(cur.orb); orbGlow.scale.setScalar(260 * cur.orbS);
  hemi.intensity = cur.hemi;
  oceanMat.color.copy(cur.water);
  renderer.toneMappingExposure = cur.exp;
  const n = cur.night;
  starMat.opacity = Math.max(0, n * 1.1 - 0.1);
  lampMat.emissiveIntensity = 0.2 + n * 4;
  windowMat.emissiveIntensity = Math.max(0, n * 1.6 - 0.1);
  for (const s of glowSprites) s.material.opacity = n * 0.9;
  for (const p2 of lightPools) p2.material.opacity = n * 0.45;
  headlight.intensity = n * 25;
  beamMat.opacity = Math.max(0, n - 0.5) * 0.3;
  fill.intensity = 0.35 + (1 - n) * 0.7;
  lhLight.intensity = Math.max(0, n - 0.4) * 500;
  lampRoomMat.emissiveIntensity = 0.5 + n * 4;
  cloudMat.emissiveIntensity = 0.05 + (1 - n) * 0.05;
  tailLight.material.emissiveIntensity = 0.3 + n * 3;
}

// ---------- state ----------
let speed = 5, speedCur = 0;
let distance = 0, rideTime = 0, jumps = 0;
let crankA = 0;
let jumpY = 0, jumpV = 0;
let honkT = 0, bellT = 0;
let blinkT = 2;
let camMode = 'orbit';
let started = false;
const clock = new THREE.Clock();
const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), lookCur = new THREE.Vector3(0, 1.1, -0.8);

// ---------- audio ----------
let actx, master, oceanGain, oceanOn = true;
const voice = new Audio('assets/intro.mp3');
function initAudio() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
    const len = actx.sampleRate * 6, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    oceanGain = actx.createGain(); oceanGain.gain.value = 0.22;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoG = actx.createGain(); lfoG.gain.value = 0.14; lfo.connect(lfoG); lfoG.connect(oceanGain.gain);
    src.connect(lp); lp.connect(oceanGain); oceanGain.connect(master);
    src.start(); lfo.start();
  } catch (e) { console.warn(e); }
}
function ding(t0) {
  for (const [f, g] of [[2350, 0.22], [3520, 0.08], [5800, 0.03]]) {
    const o = actx.createOscillator(), a = actx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(g, t0 + 0.005); a.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    o.connect(a); a.connect(master); o.start(t0); o.stop(t0 + 1.2);
  }
}
function ringBell() { bellT = 0.8; if (actx) { const t = actx.currentTime; ding(t); ding(t + 0.2); } }
function honk() {
  honkT = 1.0;
  if (!actx) return;
  const t = actx.currentTime;
  for (const off of [0, 0.32]) {
    const o = actx.createOscillator(), f = actx.createBiquadFilter(), a = actx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(330, t + off); o.frequency.exponentialRampToValueAtTime(170, t + off + 0.25);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
    a.gain.setValueAtTime(0, t + off); a.gain.linearRampToValueAtTime(0.35, t + off + 0.02); a.gain.exponentialRampToValueAtTime(0.001, t + off + 0.28);
    o.connect(f); f.connect(a); a.connect(master); o.start(t + off); o.stop(t + off + 0.3);
  }
}
function jump() {
  if (jumpY > 0.001) return;
  jumpV = 3.4; jumps++; $('sJump').textContent = jumps;
  if (actx) { // whoosh
    const o = actx.createOscillator(), a = actx.createGain(), t = actx.currentTime;
    o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    a.gain.setValueAtTime(0.12, t); a.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(a); a.connect(master); o.start(t); o.stop(t + 0.3);
  }
}
function landThump() {
  if (!actx) return;
  const o = actx.createOscillator(), a = actx.createGain(), t = actx.currentTime;
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
  a.gain.setValueAtTime(0.3, t); a.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(a); a.connect(master); o.start(t); o.stop(t + 0.25);
}
voice.addEventListener('play', () => { if (oceanGain) oceanGain.gain.value = 0.08; $('bVoice').classList.add('on'); });
voice.addEventListener('ended', () => { if (gameOn && !voLast.game) setTimeout(() => say('game'), 600); if (oceanGain && oceanOn) oceanGain.gain.value = 0.22; $('bVoice').classList.remove('on'); });
voice.addEventListener('pause', () => { if (oceanGain && oceanOn) oceanGain.gain.value = 0.22; $('bVoice').classList.remove('on'); });

// ---------- UI ----------
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800); }
function setSpeed(s) { speed = THREE.MathUtils.clamp(s, 0, 12); $('speed').value = speed; $('spdLabel').textContent = Math.round(speed * 3.6) + ' km/h'; }
setSpeed(5);
$('speed').addEventListener('input', (e) => setSpeed(+e.target.value));
const TOD_NAMES = { day: '☀️ 白天', sunset: '🌇 黄昏', night: '🌙 夜晚' };
function setTod(n) { tod = n; document.querySelectorAll('#todGrp button').forEach(b => b.classList.toggle('on', b.dataset.v === n)); toast('切换到 ' + TOD_NAMES[n]); }
document.querySelectorAll('#todGrp button').forEach(b => b.onclick = () => setTod(b.dataset.v));
const CAM_NAMES = { orbit: '环绕镜头', chase: '跟随镜头', side: '侧面镜头', cinema: '电影镜头', pov: '第一人称（鹈鹕视角）' };
function setCam(m) {
  camMode = m; controls.enabled = m === 'orbit';
  if (m === 'orbit') { controls.autoRotate = true; }
  document.querySelectorAll('#camGrp button').forEach(b => b.classList.toggle('on', b.dataset.v === m));
  toast('🎥 ' + CAM_NAMES[m]);
}
document.querySelectorAll('#camGrp button').forEach(b => b.onclick = () => setCam(b.dataset.v));
$('bBell').onclick = ringBell; $('bHonk').onclick = honk; $('bJump').onclick = jump;
$('bVoice').onclick = () => { if (voice.paused) { voice.currentTime = 0; voice.play(); } else voice.pause(); };
$('bOcean').onclick = () => { oceanOn = !oceanOn; $('bOcean').classList.toggle('on', oceanOn); if (oceanGain) oceanGain.gain.value = oceanOn ? 0.22 : 0; };
$('bShot').onclick = screenshot;
$('toggle').onclick = () => $('panel').classList.toggle('open');
function screenshot() {
  renderFrame();
  const url = renderer.domElement.toDataURL('image/png');
  $('shotImg').src = url; $('shotLink').href = url; $('shot').style.display = 'block';
  toast('📷 截图已生成，点击左下角下载');
  if (actx) { const n = actx.createBufferSource(), b = actx.createBuffer(1, 4000, actx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < 4000; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / 4000); n.buffer = b; const g = actx.createGain(); g.gain.value = 0.3; n.connect(g); g.connect(master); n.start(); }
}
addEventListener('keydown', (e) => {
  if (!started) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowup') setSpeed(speed + 0.5);
  else if (k === 'arrowdown') setSpeed(speed - 0.5);
  else if (k === ' ') { e.preventDefault(); jump(); }
  else if (k === 'b') ringBell();
  else if (k === 'h') honk();
  else if (k === 'p') screenshot();
  else if (k === 'c') { const ms = Object.keys(CAM_NAMES); setCam(ms[(ms.indexOf(camMode) + 1) % ms.length]); }
  else if (k === 't') { const ts = ['day', 'sunset', 'night']; setTod(ts[(ts.indexOf(tod) + 1) % 3]); }
});
$('startBtn').onclick = () => {
  started = true;
  $('splash').classList.add('hidden');
  setTimeout(() => $('splash').remove(), 900);
  ['stats', 'panel', 'hint'].forEach(id => $(id).classList.remove('hidden'));
  document.body.classList.add('playing');
  initAudio();
  initWeatherAudio();
  setCam('chase');
  voice.play().catch(() => {});
  setTimeout(ringBell, 600);
};
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// =========================================================
//  v2: 捉鱼小游戏 · 天气系统 · 烟花 · 语音事件
// =========================================================
let pouchFull = 0, crashT = 0;

// ---------- voice lines ----------
const VO = {};
for (const n of ['fish1', 'fish20', 'crash', 'gold', 'rain', 'snow', 'rainbow', 'game']) { VO[n] = new Audio(`assets/v_${n}.mp3`); VO[n].preload = 'auto'; }
const voLast = {};
function say(n, cd = 25) {
  if (!started) return;
  const now = performance.now() / 1000;
  if (voLast[n] && now - voLast[n] < cd) return;
  if (!voice.paused || Object.values(VO).some(a => !a.paused)) return;
  voLast[n] = now;
  VO[n].currentTime = 0; VO[n].play().catch(() => {});
}

// ---------- lanes ----------
const LANES = [-1.6, -0.8, 0.0];
let lane = 1;
function changeLane(d) {
  const nl = THREE.MathUtils.clamp(lane + d, 0, 2);
  if (nl === lane) return;
  lane = nl;
  if (actx) { const o = actx.createOscillator(), a = actx.createGain(), t = actx.currentTime; o.type = 'triangle'; o.frequency.setValueAtTime(d > 0 ? 500 : 700, t); o.frequency.linearRampToValueAtTime(d > 0 ? 700 : 500, t + 0.08); a.gain.setValueAtTime(0.06, t); a.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(a); a.connect(master); o.start(t); o.stop(t + 0.15); }
}
function updateLanes(dt) {
  const tz = LANES[lane];
  const dz = tz - rig.position.z;
  rig.position.z += dz * (1 - Math.exp(-dt * 7));
  rig.rotation.x += (THREE.MathUtils.clamp(dz * 0.45, -0.3, 0.3) - rig.rotation.x) * 0.2;
}

// ---------- items: fish / golden fish / cones ----------
const fishM = M(0x9fc3e0, { metalness: 0.7, roughness: 0.25, emissive: 0x2a5d9a, emissiveIntensity: 0.35 });
const goldM = M(0xffc629, { metalness: 0.9, roughness: 0.2, emissive: 0xff9900, emissiveIntensity: 0.6 });
const coneM = M(0xff6a00, { roughness: 0.5 });
const stripeM = M(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 });
const tailGeo = new THREE.ConeGeometry(0.09, 0.14, 4);
const coneGeo = new THREE.ConeGeometry(0.2, 0.6, 16);
const stripeGeo = new THREE.CylinderGeometry(0.105, 0.135, 0.09, 16);
const baseGeo = new THREE.BoxGeometry(0.42, 0.05, 0.42);
function makeFishItem(gold) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const m = gold ? goldM : fishM;
  inner.add(ball(1, m, 0, 0, 0, 0.22, 0.09, 0.06));
  const tail = new THREE.Mesh(tailGeo, m); tail.rotation.z = Math.PI / 2; tail.position.x = -0.26; tail.scale.z = 0.3; inner.add(tail);
  inner.add(ball(0.02, blackMat, 0.15, 0.025, 0.05)); inner.add(ball(0.02, blackMat, 0.15, 0.025, -0.05));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: gold ? 0xffd24a : 0x9fd8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: gold ? 0.9 : 0.55 }));
  glow.scale.setScalar(gold ? 1.3 : 0.9); g.add(glow);
  inner.traverse(c => { if (c.isMesh) c.castShadow = true; });
  return g;
}
function makeCone() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(coneGeo, coneM); c.position.y = 0.33; g.add(c);
  const s = new THREE.Mesh(stripeGeo, stripeM); s.position.y = 0.33; g.add(s);
  const b = new THREE.Mesh(baseGeo, M(0x222222)); b.position.y = 0.025; g.add(b);
  return shadows(g);
}
const items = [];
let gameOn = true, score = 0, combo = 0, bestCombo = 0, spawnAcc = 0, nextGap = 2, fishTotal = 0;
let best = +(localStorage.getItem('pelicanBest') || 0);
function spawnItem(type, x, ln, y = 0.9) {
  const obj = type === 'cone' ? makeCone() : makeFishItem(type === 'gold');
  obj.position.set(x, type === 'cone' ? 0 : y, LANES[ln]);
  scene.add(obj);
  items.push({ obj, type, lane: ln, y, hit: false, vy: 0, spin: 0 });
}
function spawnPattern() {
  const X = 50, r = Math.random(), ln = Math.random() * 3 | 0;
  if (r < 0.2) {                             // cone + fish arc above it
    spawnItem('cone', X, ln);
    for (let i = -1; i <= 1; i++) spawnItem('fish', X + i * 1.3, ln, i === 0 ? 1.95 : 1.6);
    if (Math.random() < 0.5) spawnItem('fish', X, (ln + 1 + (Math.random() * 2 | 0)) % 3);
  } else if (r < 0.28) {
    spawnItem('gold', X, ln, 1.1);
  } else if (r < 0.62) {                     // row of fish
    const n = 3 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) spawnItem('fish', X + i * 2.2, ln);
  } else if (r < 0.8) {                      // zig-zag
    for (let i = 0; i < 4; i++) spawnItem('fish', X + i * 3, (ln + i) % 3);
  } else if (r < 0.9) {                      // cone wall with gap
    for (let l = 0; l < 3; l++) if (l !== ln) spawnItem('cone', X, l);
    spawnItem('fish', X, ln);
  } else spawnItem('fish', X, ln);
  nextGap = rand(9, 16);
}
function removeItem(i) { scene.remove(items[i].obj); items.splice(i, 1); }
function collect(it) {
  it.hit = true;
  const gold = it.type === 'gold';
  const pts = gold ? 5 : 1;
  combo++; bestCombo = Math.max(bestCombo, combo);
  const mult = combo >= 20 ? 3 : combo >= 10 ? 2 : 1;
  score += pts * mult; fishTotal++;
  pouchFull = Math.min(1, pouchFull + (gold ? 0.6 : 0.2));
  honkT = Math.max(honkT, 0.35);
  burst(it.obj.position, gold ? 0xffd24a : 0x9fd8ff, gold ? 60 : 25);
  pop((gold ? '✨+' : '+') + pts * mult + (mult > 1 ? ` ×${mult}` : ''), gold ? '#ffd24a' : '#bfe6ff');
  if (actx) {
    const t = actx.currentTime;
    const notes = gold ? [880, 1108, 1318, 1760] : [660 + Math.min(combo, 12) * 40];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), a = actx.createGain(); o.type = gold ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, t + i * 0.07); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + i * 0.07 + 0.08);
      a.gain.setValueAtTime(0.0001, t + i * 0.07); a.gain.linearRampToValueAtTime(0.14, t + i * 0.07 + 0.01); a.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.25);
      o.connect(a); a.connect(master); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.3);
    });
  }
  if (fishTotal === 1) say('fish1', 999);
  else if (gold) say('gold', 60);
  const milestone = Math.floor(score / 20);
  if (milestone > lastMilestone) { lastMilestone = milestone; if (milestone === 1) say('fish20', 999); for (let k = 0; k < 4; k++) setTimeout(launchFirework, k * 450); toast(`🎉 ${milestone * 20} 分！放烟花庆祝！`); }
  if (score > best) { best = score; localStorage.setItem('pelicanBest', best); }
}
let lastMilestone = 0;
function crash(it) {
  it.hit = true; it.vy = 4; it.spin = rand(8, 14) * (Math.random() < .5 ? 1 : -1);
  crashT = 0.9; speedCur *= 0.35; combo = 0;
  pop('💥 撞到路障！', '#ff8a7a');
  burst(it.obj.position, 0xff8a3d, 30);
  if (actx) {
    const t = actx.currentTime, n = actx.createBufferSource(), b = actx.createBuffer(1, 8000, actx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < 8000; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / 8000, 3);
    n.buffer = b; const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; const g = actx.createGain(); g.gain.value = 0.5;
    n.connect(lp); lp.connect(g); g.connect(master); n.start(t);
  }
  honk();
  say('crash', 45);
}
function updateItems(dx, dt, t) {
  if (gameOn && started) { spawnAcc += dx; if (spawnAcc > nextGap) { spawnAcc = 0; spawnPattern(); } }
  const rz = rig.position.z, headY = 1.0 + jumpY;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i], o = it.obj;
    o.position.x -= dx;
    if (it.type !== 'cone') {
      o.children[0].rotation.y = t * 2.5 + i;
      if (!it.hit) o.position.y = it.y + Math.sin(t * 3 + o.position.x) * 0.06;
      else { o.position.y += dt * 3; o.scale.multiplyScalar(0.86); }
      if (it.hit && o.scale.x < 0.05) { removeItem(i); continue; }
    } else if (it.hit) {
      it.vy -= 9.8 * dt; o.position.y += it.vy * dt; o.position.x += dt * 3; o.rotation.z += it.spin * dt; o.rotation.x += it.spin * 0.5 * dt;
      if (o.position.y < -3) { removeItem(i); continue; }
    }
    if (!it.hit && o.position.x > -0.45 && o.position.x < 0.65 && Math.abs(o.position.z - rz) < 0.42) {
      if (it.type === 'cone') {
        if (jumpY < 0.32) crash(it);
        else if (!it.jumped) { it.jumped = true; score += 2; pop('🦘 飞跃 +2', '#b4ffb0'); }
      } else if (Math.abs(it.y - headY) < 0.85) collect(it);
    }
    if (o.position.x < -25) removeItem(i);
  }
}

// ---------- floating score text ----------
const popV = new THREE.Vector3();
function pop(text, color) {
  popV.set(0.3, 2.5 + jumpY, rig.position.z).project(camera);
  const el = document.createElement('div');
  el.className = 'pop'; el.textContent = text; el.style.color = color;
  el.style.left = ((popV.x + 1) / 2 * innerWidth) + 'px';
  el.style.top = ((1 - popV.y) / 2 * innerHeight) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// ---------- sparks (collect bursts) ----------
const SPK = 400;
const spkPos = new Float32Array(SPK * 3).fill(-999), spkCol = new Float32Array(SPK * 3), spkVel = new Float32Array(SPK * 3), spkLife = new Float32Array(SPK);
const spkGeo = new THREE.BufferGeometry();
spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3));
spkGeo.setAttribute('color', new THREE.BufferAttribute(spkCol, 3));
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
scene.add(new THREE.Points(spkGeo, new THREE.PointsMaterial({ size: 0.12, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
let spkIdx = 0;
const tmpCol = new THREE.Color();
function burst(p, color, n) {
  tmpCol.set(color);
  for (let k = 0; k < n; k++) {
    const i = spkIdx; spkIdx = (spkIdx + 1) % SPK;
    spkPos[i * 3] = p.x; spkPos[i * 3 + 1] = p.y; spkPos[i * 3 + 2] = p.z;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(rand(-1, 1)), sp = rand(1, 3);
    spkVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; spkVel[i * 3 + 1] = Math.cos(ph) * sp + 1; spkVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    spkCol[i * 3] = tmpCol.r; spkCol[i * 3 + 1] = tmpCol.g; spkCol[i * 3 + 2] = tmpCol.b;
    spkLife[i] = rand(0.5, 0.9);
  }
}
function updateSparks(dt, dx) {
  for (let i = 0; i < SPK; i++) {
    if (spkLife[i] <= 0) continue;
    spkLife[i] -= dt;
    spkPos[i * 3] += spkVel[i * 3] * dt - dx; spkPos[i * 3 + 1] += spkVel[i * 3 + 1] * dt; spkPos[i * 3 + 2] += spkVel[i * 3 + 2] * dt;
    spkVel[i * 3 + 1] -= 4 * dt;
    const f = Math.max(0, 1 - dt * 2.5);
    spkCol[i * 3] *= f; spkCol[i * 3 + 1] *= f; spkCol[i * 3 + 2] *= f;
    if (spkLife[i] <= 0) spkPos[i * 3 + 1] = -999;
  }
  spkGeo.attributes.position.needsUpdate = true; spkGeo.attributes.color.needsUpdate = true;
}

// ---------- fireworks ----------
const FW = 2400;
const fwPos = new Float32Array(FW * 3).fill(-999), fwCol = new Float32Array(FW * 3), fwBase = new Float32Array(FW * 3), fwVel = new Float32Array(FW * 3), fwLife = new Float32Array(FW), fwMax = new Float32Array(FW);
const fwGeo = new THREE.BufferGeometry();
fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPos, 3));
fwGeo.setAttribute('color', new THREE.BufferAttribute(fwCol, 3));
const fwPoints = new THREE.Points(fwGeo, new THREE.PointsMaterial({ size: 0.9, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
fwPoints.frustumCulled = false;
scene.add(fwPoints);
let fwIdx = 0;
const fwColors = [0xff4d6d, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xf72585, 0xffffff, 0xff9f1c, 0xb388ff];
const rockets = [];
function launchFirework() {
  const x = rand(5, 45), z = rand(-35, -60), top = rand(22, 34);
  rockets.push({ x, y: 0, z, top, vy: 26 });
  if (actx) { // whistle
    const t = actx.currentTime, o = actx.createOscillator(), a = actx.createGain();
    o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
    a.gain.setValueAtTime(0.03, t); a.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    o.connect(a); a.connect(master); o.start(t); o.stop(t + 1.05);
  }
}
function explode(x, y, z) {
  const c1 = new THREE.Color(fwColors[Math.random() * fwColors.length | 0]);
  const c2 = new THREE.Color(fwColors[Math.random() * fwColors.length | 0]);
  const n = 260, ring = Math.random() < 0.3;
  for (let k = 0; k < n; k++) {
    const i = fwIdx; fwIdx = (fwIdx + 1) % FW;
    fwPos[i * 3] = x; fwPos[i * 3 + 1] = y; fwPos[i * 3 + 2] = z;
    let th = Math.random() * Math.PI * 2, ph = ring ? Math.PI / 2 + rand(-0.05, 0.05) : Math.acos(rand(-1, 1));
    const sp = ring ? 11 : rand(7, 12);
    fwVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; fwVel[i * 3 + 1] = Math.cos(ph) * sp + (ring ? Math.sin(th) * sp * 0.9 : 0); fwVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp * (ring ? 0.3 : 1);
    const c = k % 2 ? c1 : c2;
    fwBase[i * 3] = c.r * 2; fwBase[i * 3 + 1] = c.g * 2; fwBase[i * 3 + 2] = c.b * 2;
    fwLife[i] = fwMax[i] = rand(1.4, 2.2);
  }
  if (actx) {
    const t = actx.currentTime + 0.25, len = actx.sampleRate * 1.5, b = actx.createBuffer(1, len, actx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const s = actx.createBufferSource(); s.buffer = b; const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; const g = actx.createGain(); g.gain.value = 0.7;
    s.connect(lp); lp.connect(g); g.connect(master); s.start(t);
  }
}
function updateFireworks(dt, dx) {
  for (let r = rockets.length - 1; r >= 0; r--) {
    const k = rockets[r]; k.x -= dx; k.y += k.vy * dt; k.vy = Math.max(6, k.vy - 9 * dt);
    const i = fwIdx; fwIdx = (fwIdx + 1) % FW; // trail
    fwPos[i * 3] = k.x + rand(-.1, .1); fwPos[i * 3 + 1] = k.y; fwPos[i * 3 + 2] = k.z;
    fwVel[i * 3] = 0; fwVel[i * 3 + 1] = -1; fwVel[i * 3 + 2] = 0;
    fwBase[i * 3] = 1.6; fwBase[i * 3 + 1] = 1.2; fwBase[i * 3 + 2] = 0.6; fwLife[i] = fwMax[i] = 0.5;
    if (k.y >= k.top) { explode(k.x, k.y, k.z); rockets.splice(r, 1); }
  }
  for (let i = 0; i < FW; i++) {
    if (fwLife[i] <= 0) continue;
    fwLife[i] -= dt;
    fwVel[i * 3] *= 0.975; fwVel[i * 3 + 1] = fwVel[i * 3 + 1] * 0.975 - 4 * dt; fwVel[i * 3 + 2] *= 0.975;
    fwPos[i * 3] += fwVel[i * 3] * dt - dx; fwPos[i * 3 + 1] += fwVel[i * 3 + 1] * dt; fwPos[i * 3 + 2] += fwVel[i * 3 + 2] * dt;
    const f = Math.max(0, fwLife[i] / fwMax[i]), tw = 0.7 + Math.random() * 0.3;
    fwCol[i * 3] = fwBase[i * 3] * f * tw; fwCol[i * 3 + 1] = fwBase[i * 3 + 1] * f * tw; fwCol[i * 3 + 2] = fwBase[i * 3 + 2] * f * tw;
    if (fwLife[i] <= 0) fwPos[i * 3 + 1] = -999;
  }
  fwGeo.attributes.position.needsUpdate = true; fwGeo.attributes.color.needsUpdate = true;
}

// ---------- weather ----------
let weather = 'clear', prevWeather = 'clear';
const wk = { rain: 0, snow: 0, sakura: 0 };
let rainbowT = 0, rainbowK = 0, lightningT = 8, flash = 0;
const RAIN = 3500;
const rainPos = new Float32Array(RAIN * 6);
const rainSeed = new Float32Array(RAIN * 3);
for (let i = 0; i < RAIN; i++) { rainSeed[i * 3] = rand(-30, 30); rainSeed[i * 3 + 1] = rand(0, 22); rainSeed[i * 3 + 2] = rand(-18, 14); }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xbcd4ff, transparent: true, opacity: 0, depthWrite: false });
const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; scene.add(rainLines);
const FLK = 3000;
const flkPos = new Float32Array(FLK * 3), flkPh = new Float32Array(FLK);
for (let i = 0; i < FLK; i++) { flkPos[i * 3] = rand(-35, 35); flkPos[i * 3 + 1] = rand(0, 22); flkPos[i * 3 + 2] = rand(-20, 15); flkPh[i] = rand(0, 6.28); }
const flkGeo = new THREE.BufferGeometry(); flkGeo.setAttribute('position', new THREE.BufferAttribute(flkPos, 3));
const flkMat = new THREE.PointsMaterial({ size: 0.13, map: dotTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
const flakes = new THREE.Points(flkGeo, flkMat); flakes.frustumCulled = false; scene.add(flakes);
const snowCover = new THREE.Mesh(new THREE.PlaneGeometry(600, 125), M(0xffffff, { roughness: 1, transparent: true, opacity: 0 }));
snowCover.rotation.x = -Math.PI / 2; snowCover.position.set(0, 0.175, 64); snowCover.receiveShadow = true; scene.add(snowCover);
const rainbow = new THREE.Mesh(new THREE.RingGeometry(150, 172, 96, 1, 0, Math.PI), new THREE.ShaderMaterial({
  uniforms: { k: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float k; varying vec2 vP;
    vec3 hsv(float h){ vec3 p = abs(fract(h + vec3(0.,2./3.,1./3.))*6.-3.); return clamp(p-1.,0.,1.); }
    void main(){ float t = (length(vP)-150.)/22.; float edge = smoothstep(0.,.15,t)*smoothstep(1.,.85,t);
      float fade = smoothstep(-10., 40., vP.y);
      gl_FragColor = vec4(hsv(t*0.8)*edge*fade*k, 1.); }`
}));
rainbow.position.set(30, -12, -330); scene.add(rainbow);
let rainGain;
function initWeatherAudio() {
  if (!actx || rainGain) return;
  const len = actx.sampleRate * 3, b = actx.createBuffer(1, len, actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = actx.createBufferSource(); s.buffer = b; s.loop = true;
  const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
  rainGain = actx.createGain(); rainGain.gain.value = 0;
  s.connect(hp); hp.connect(lp); lp.connect(rainGain); rainGain.connect(master); s.start();
}
function thunder() {
  if (!actx) return;
  const t = actx.currentTime + rand(0.4, 1.4), len = actx.sampleRate * 3, b = actx.createBuffer(1, len, actx.sampleRate), d = b.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; d[i] = last * 8 * Math.pow(1 - i / len, 2) * (i < 2000 ? i / 2000 : 1); }
  const s = actx.createBufferSource(); s.buffer = b; const g = actx.createGain(); g.gain.value = 0.9; s.connect(g); g.connect(master); s.start(t);
}
const WEATHER_NAMES = { clear: '☀️ 晴天', rain: '🌧️ 下雨', snow: '❄️ 下雪', sakura: '🌸 樱花雨' };
function setWeather(w) {
  if (w === weather) return;
  prevWeather = weather; weather = w;
  document.querySelectorAll('#wxGrp button').forEach(b => b.classList.toggle('on', b.dataset.v === w));
  toast('天气：' + WEATHER_NAMES[w]);
  initWeatherAudio();
  if (w === 'rain') say('rain', 30);
  if (w === 'snow') say('snow', 30);
  if (prevWeather === 'rain' && w === 'clear' && tod !== 'night') { rainbowT = 30; setTimeout(() => say('rainbow', 30), 2500); }
}
function updateWeather(dt, dx, t) {
  const k = 1 - Math.exp(-dt * 1.2);
  for (const n of ['rain', 'snow', 'sakura']) wk[n] += ((weather === n ? 1 : 0) - wk[n]) * k;
  rainbowT = Math.max(0, rainbowT - dt);
  rainbowK += ((rainbowT > 0 && weather === 'clear' && tod !== 'night' ? 1 : 0) - rainbowK) * k * 0.6;
  rainbow.material.uniforms.k.value = rainbowK * 0.55; rainbow.visible = rainbowK > 0.01;
  const rz = rig.position.z;
  // rain
  rainMat.opacity = wk.rain * 0.55; rainLines.visible = wk.rain > 0.01;
  if (rainLines.visible) {
    for (let i = 0; i < RAIN; i++) {
      let x = rainSeed[i * 3] - dx - 4 * dt, y = rainSeed[i * 3 + 1] - 20 * dt;
      if (y < 0) y += 22; if (x < -30) x += 60;
      rainSeed[i * 3] = x; rainSeed[i * 3 + 1] = y;
      const z = rainSeed[i * 3 + 2] + rz;
      rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
      rainPos[i * 6 + 3] = x + 0.12 + speedCur * 0.03; rainPos[i * 6 + 4] = y + 0.55; rainPos[i * 6 + 5] = z;
    }
    rainGeo.attributes.position.needsUpdate = true;
    lightningT -= dt;
    if (lightningT < 0 && wk.rain > 0.7) { flash = 1; lightningT = rand(7, 16); thunder(); }
  }
  flash = Math.max(0, flash - dt * (flash > 0.5 ? 3 : 1.5));
  if (rainGain) rainGain.gain.value = wk.rain * 0.18;
  // snow & sakura share one particle system
  const fk = Math.max(wk.snow, wk.sakura);
  flkMat.opacity = fk * 0.95; flakes.visible = fk > 0.01;
  if (flakes.visible) {
    flkMat.color.set(wk.snow >= wk.sakura ? 0xffffff : 0xffb7d5);
    flkMat.size = wk.snow >= wk.sakura ? 0.13 : 0.11;
    const fall = wk.snow >= wk.sakura ? 1.3 : 0.9;
    for (let i = 0; i < FLK; i++) {
      let x = flkPos[i * 3] - dx + Math.sin(t * 1.3 + flkPh[i]) * dt * 0.8 - dt * 0.6;
      let y = flkPos[i * 3 + 1] - fall * dt * (0.6 + (i % 5) * 0.12);
      if (y < 0) y += 22; if (x < -35) x += 70;
      flkPos[i * 3] = x; flkPos[i * 3 + 1] = y;
      flkPos[i * 3 + 2] += Math.cos(t + flkPh[i]) * dt * 0.3;
    }
    flkGeo.attributes.position.needsUpdate = true;
    flakes.position.z = rz + 0.8;
  }
  snowCover.material.opacity = wk.snow * 0.85; snowCover.visible = wk.snow > 0.01;
}
const greyTop = new THREE.Color(0x5b6472), greyBot = new THREE.Color(0x9aa3ad), greyFog = new THREE.Color(0x8e98a3), snowFog = new THREE.Color(0xdde6ee);
function applyWeather(dt) {
  const r = wk.rain, s = wk.snow, n = cur.night;
  const dim = 1 - n * 0.75;
  skyU.top.value.lerp(tmpC.copy(greyTop).multiplyScalar(dim), r * 0.7 + s * 0.5);
  skyU.bottom.value.lerp(tmpC.copy(greyBot).multiplyScalar(dim), r * 0.7 + s * 0.4);
  scene.fog.color.lerp(tmpC.copy(r > s ? greyFog : snowFog).multiplyScalar(dim), r * 0.7 + s * 0.6);
  scene.fog.near = 45 - r * 30 - s * 25;
  scene.fog.far = 320 - r * 220 - s * 180;
  sun.intensity *= 1 - r * 0.65 - s * 0.4;
  orbMat.opacity = 1; orb.visible = r + s < 0.9; orbGlow.material.opacity = 1 - Math.min(1, r + s);
  oceanMat.color.lerp(tmpC.set(0x3d5566).multiplyScalar(dim), r * 0.5);
  if (flash > 0) {
    hemi.intensity += flash * 3;
    skyU.top.value.lerp(tmpC.set(0xdde4ff), flash * 0.6);
    skyU.bottom.value.lerp(tmpC.set(0xeef0ff), flash * 0.6);
  }
  // bloom stronger at night
  bloom.strength = 0.3 + n * 0.7;
  bloom.threshold = 0.85 - n * 0.2;
}

// ---------- v2 UI hooks ----------
function setGame(on) {
  gameOn = on; $('bGame').classList.toggle('on', on);
  document.body.classList.toggle('game', on);
  toast(on ? '🎯 捉鱼模式：开启' : '🎯 捉鱼模式：关闭（悠闲骑行）');
  if (on) say('game', 60);
}
document.body.classList.add('game');
$('bGame').onclick = () => setGame(!gameOn);
$('bFire').onclick = () => { for (let k = 0; k < 5; k++) setTimeout(launchFirework, k * 350); };
$('bBloom').onclick = () => { bloomOn = !bloomOn; $('bBloom').classList.toggle('on', bloomOn); toast(bloomOn ? '✨ 辉光：开' : '✨ 辉光：关（更流畅）'); };
document.querySelectorAll('#wxGrp button').forEach(b => b.onclick = () => setWeather(b.dataset.v));
$('mLeft').onclick = () => changeLane(1);
$('mRight').onclick = () => changeLane(-1);
$('mJump').onclick = () => jump();
addEventListener('keydown', (e) => {
  if (!started) return;
  const k = e.key.toLowerCase();
  // bike faces +x; camera usually on +z side, so "left" on screen = toward -x... use rider's own left/right:
  if (k === 'arrowleft' || k === 'a') { e.preventDefault(); changeLane(1); }
  else if (k === 'arrowright' || k === 'd') { e.preventDefault(); changeLane(-1); }
  else if (k === 'w') { const ws = ['clear', 'rain', 'snow', 'sakura']; setWeather(ws[(ws.indexOf(weather) + 1) % ws.length]); }
  else if (k === 'f') $('bFire').click();
  else if (k === 'g') setGame(!gameOn);
});
// swipe on touch devices
let touchX = null, touchY = null;
renderer.domElement.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; } }, { passive: true });
renderer.domElement.addEventListener('touchend', (e) => {
  if (touchX === null || camMode === 'orbit') return;
  const dxs = e.changedTouches[0].clientX - touchX, dys = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dxs) > 40 && Math.abs(dxs) > Math.abs(dys)) changeLane(dxs < 0 ? 1 : -1);
  else if (dys < -40) jump();
  touchX = null;
}, { passive: true });
function updateGameHud() {
  $('sScore').textContent = score;
  $('sCombo').textContent = combo + (combo >= 20 ? ' (×3)' : combo >= 10 ? ' (×2)' : '');
  $('sBest').textContent = best;
}

// ---------- IK ----------
const L1 = 0.42, L2 = 0.44;
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), kneeP = new THREE.Vector3();
function updateLeg(leg, target) {
  const { hip } = leg;
  const dx = target.x - hip.x, dy = target.y - hip.y;
  let d = Math.hypot(dx, dy); d = Math.min(d, L1 + L2 - 0.002);
  const a = Math.atan2(dy, dx);
  const b = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  kneeP.set(hip.x + Math.cos(a + b) * L1, hip.y + Math.sin(a + b) * L1, (hip.z + target.z) / 2 + 0.03 * leg.s);
  setTube(leg.thigh, hip, kneeP, 0.06);
  setTube(leg.shin, kneeP, target, 0.028);
  leg.knee.position.copy(kneeP);
  leg.foot.position.copy(target);
}

// ---------- main loop ----------
function fmtTime(s) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); }
let hudAcc = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  const targetSpeed = started ? speed : 2.5;
  speedCur += (targetSpeed - speedCur) * (1 - Math.exp(-dt * 1.5));
  const dx = speedCur * dt;
  distance += started ? dx : 0;
  if (started) rideTime += dt;

  // scroll world
  for (const s of scrollers) {
    s.obj.position.x -= dx * s.factor;
    const half = s.wrap / 2;
    if (s.obj.position.x < -half) s.obj.position.x += s.wrap;
  }
  for (const [tex, tile] of scrollTextures) tex.offset.x += dx / tile;
  updateOcean(t, distance + t * 0);
  for (const c of clouds) c.position.x -= dt * 0.8;
  for (const b of boats) {
    b.position.x += b.userData.drift * dt;
    b.position.y = -1.05 + waveH(b.position.x + distance, b.position.z, t) + 0.05;
    b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.06;
    b.rotation.x = Math.sin(t * 1.2 + b.userData.phase) * 0.05;
  }
  beamPivot.rotation.y = t * 0.8;

  // gulls
  for (const g of gulls) {
    const u = g.userData, a = t * u.sp + u.ph;
    const p = v3(u.cx + Math.cos(a) * u.r, u.cy + Math.sin(a * 2) * 0.8, u.cz + Math.sin(a) * u.r);
    const a2 = a + 0.05 * Math.sign(u.sp);
    g.lookAt(u.cx + Math.cos(a2) * u.r, u.cy + Math.sin(a2 * 2) * 0.8, u.cz + Math.sin(a2) * u.r);
    g.position.copy(p);
    const flap = Math.sin(t * 7 + u.ph) * 0.5;
    u.wings[0].rotation.z = flap; u.wings[1].rotation.z = -flap;
  }

  // bike mechanics
  const wheelW = speedCur / R;
  rearW.rotation.z -= wheelW * dt;
  frontW.rotation.z -= wheelW * dt;
  crankA -= (wheelW / 2.6) * dt;
  crank.rotation.z = crankA;
  cog.rotation.z = rearW.rotation.z;
  for (const p of pedals) p.rotation.z = -crankA;

  // legs follow pedals
  for (const leg of legs) {
    const s = leg.s, c = Math.cos(crankA), sn = Math.sin(crankA);
    tmpA.set(P.bb.x + 0.15 * c * s, P.bb.y + 0.15 * sn * s + 0.025, 0.16 * s);
    updateLeg(leg, tmpA);
  }

  // jump physics
  if (jumpY > 0 || jumpV > 0) {
    jumpV -= 9.8 * dt; jumpY += jumpV * dt;
    if (jumpY <= 0) { jumpY = 0; jumpV = 0; landThump(); for (let i = 0; i < 20; i++) emitDust(true); }
  }
  rig.position.y = jumpY;
  bike.rotation.z = THREE.MathUtils.lerp(bike.rotation.z, jumpY > 0 ? jumpV * 0.06 : 0, 0.2);
  crashT = Math.max(0, crashT - dt);
  bike.rotation.x = Math.sin(t * 0.7) * 0.025 + Math.sin(crankA * 2) * 0.012 * Math.min(speedCur / 6, 1.5) + Math.sin(crashT * 35) * crashT * 0.35;

  // pelican life
  const effort = Math.min(speedCur / 6, 1.6);
  torso.position.y = Math.abs(Math.sin(crankA)) * 0.018 * effort;
  torso.rotation.x = Math.sin(crankA) * 0.035 * effort;
  torso.rotation.z = -0.05 * effort;
  neckG.rotation.z = Math.sin(crankA * 2) * 0.05 * effort - 0.08 * effort;
  headG.rotation.y = Math.sin(t * 0.45) * 0.35 + (honkT > 0 ? 0 : 0);
  headG.rotation.z = Math.sin(t * 0.8) * 0.06 + (honkT > 0 ? 0.35 * Math.sin(honkT * Math.PI) : 0) + (jumpY > 0 ? 0.25 : 0);
  // blink
  blinkT -= dt;
  const blink = blinkT < 0.12 && blinkT > 0 ? 0.1 : 1;
  if (blinkT < 0) blinkT = rand(2, 5);
  for (const e of eyes) e.scale.y = blink;
  // beak / pouch
  honkT = Math.max(0, honkT - dt);
  const open = honkT > 0 ? Math.abs(Math.sin(honkT * Math.PI * 3.2)) * 0.55 : (jumpY > 0 ? 0.35 : 0.04 + Math.sin(t * 1.3) * 0.02);
  pouchG.rotation.z += (-open - pouchG.rotation.z) * 0.3;
  pouchFull = Math.max(0, pouchFull - dt * 0.12);
  pouchG.children[1].scale.set(0.27 * (1 + 0.2 * pouchFull), (0.1 + Math.sin(t * 6) * 0.004 * effort) * (1 + 1.1 * pouchFull), 0.065 * (1 + 0.9 * pouchFull));
  // bell
  bellT = Math.max(0, bellT - dt);
  bellMesh.rotation.x = Math.sin(bellT * 60) * bellT * 0.6;
  // scarf flutter
  for (const st of scarfTails) {
    const w = 0.2 + effort * 0.4;
    st.piv.rotation.z = -0.9 + effort * 0.55 + Math.sin(t * 9 + st.ph) * 0.12 * w;
    st.piv.rotation.y = Math.sin(t * 5 + st.ph) * 0.3 * w;
    st.seg1.rotation.z = Math.sin(t * 11 + st.ph) * 0.3 * w;
    st.seg2.rotation.z = Math.sin(t * 13 + st.ph + 1) * 0.5 * w;
    st.seg2.rotation.x = Math.sin(t * 8 + st.ph) * 0.6 * w;
  }
  basket.userData.fish.rotation.x = Math.sin(t * 3) * 0.15;

  // dust
  if (speedCur > 1.5 && jumpY === 0) { dustAcc += dt * speedCur * 2.5; while (dustAcc > 1) { dustAcc--; emitDust(false); } }
  for (let i = 0; i < DUST; i++) {
    if (dustLife[i] <= 0) continue;
    dustLife[i] -= dt;
    dustPos[i * 3] += (dustVel[i * 3] - speedCur) * dt;
    dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt;
    dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
    dustVel[i * 3 + 1] -= 0.5 * dt;
    if (dustLife[i] <= 0 || dustPos[i * 3 + 1] < 0) { dustPos[i * 3 + 1] = -999; dustLife[i] = 0; }
  }
  dustGeo.attributes.position.needsUpdate = true;

  updateLanes(dt);
  updateItems(dx, dt, t);
  updateWeather(dt, dx, t);
  updateFireworks(dt, dx);
  updateSparks(dt, dx);
  updateTod(dt);
  applyWeather(dt);

  // cameras
  const riderY = 1.1 + jumpY * 0.6;
  if (camMode === 'orbit') {
    controls.target.lerp(tmpB.set(0, riderY, rig.position.z), 0.1);
    controls.update();
  } else {
    let lerpK = 1 - Math.exp(-dt * 3);
    if (camMode === 'chase') { camGoal.set(-4.6, 3.0 + jumpY * 0.4, rig.position.z * 0.6 + 0.6); lookGoal.set(4, 0.9 + jumpY * 0.4, rig.position.z * 0.8); }
    else if (camMode === 'side') { camGoal.set(0.1, 1.2, 6.0); lookGoal.set(0.1, riderY - 0.1, rig.position.z); }
    else if (camMode === 'cinema') {
      const a = t * 0.18;
      const r = 5.5 + Math.sin(t * 0.23) * 2.2;
      camGoal.set(Math.cos(a) * r, 0.5 + (Math.sin(t * 0.31) + 1) * 1.3, rig.position.z + Math.sin(a) * r);
      lookGoal.set(0.1, riderY + 0.1, rig.position.z);
      lerpK = 1 - Math.exp(-dt * 1.2);
    } else if (camMode === 'pov') {
      tmpA.set(0.3, 2.15, 0); headG.parent.localToWorld(tmpA.copy(headG.position)); // head world
      camGoal.copy(tmpA).add(tmpB.set(0.05, 0.12, 0));
      lookGoal.set(12, 1.2, rig.position.z);
      lerpK = 1 - Math.exp(-dt * 12);
    }
    camera.position.lerp(camGoal, lerpK);
    lookCur.lerp(lookGoal, lerpK);
    camera.lookAt(lookCur);
    controls.target.copy(lookCur);
  }
  // hide head in first-person
  headG.visible = camMode !== 'pov';

  // HUD
  hudAcc += dt;
  if (hudAcc > 0.1 && started) {
    hudAcc = 0;
    const kmh = speedCur * 3.6;
    $('sSpeed').textContent = kmh.toFixed(1) + ' km/h';
    $('sDist').textContent = distance < 1000 ? distance.toFixed(0) + ' m' : (distance / 1000).toFixed(2) + ' km';
    $('sRpm').textContent = Math.round((wheelW / 2.6) * 60 / (Math.PI * 2)) + ' rpm';
    $('sTime').textContent = fmtTime(rideTime);
    updateGameHud();
    $('speedBar').style.width = Math.min(100, kmh / 43.2 * 100) + '%';
  }

  renderFrame();
}
function emitDust(burst) {
  const i = dustIdx; dustIdx = (dustIdx + 1) % DUST;
  dustPos[i * 3] = rig.position.x - 0.6 + rand(-0.05, 0.05);
  dustPos[i * 3 + 1] = 0.04;
  dustPos[i * 3 + 2] = rig.position.z + rand(-0.08, 0.08);
  dustVel[i * 3] = burst ? rand(-1.5, 1.5) : rand(-0.5, 0.2);
  dustVel[i * 3 + 1] = burst ? rand(0.4, 1.2) : rand(0.1, 0.5);
  dustVel[i * 3 + 2] = burst ? rand(-1.2, 1.2) : rand(-0.3, 0.3);
  dustLife[i] = rand(0.5, 1.1);
}
animate();
window.__pelican = { scene, camera, renderer, get score() { return score; }, get items() { return items.length; }, spawn: (...a) => spawnItem(...a) };
