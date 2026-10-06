// แผนที่คลัง 3D ของ IOT Dashboard (6 ต.ค. 2569 · ผู้ใช้ขอ: แผนที่คลัง 3D + Pin ตำแหน่งเซนเซอร์ · ด้านล่างเป็นรายละเอียด)
// ใช้ three.js · ผังจาก window.IOT_MAPS (maps.js) · หมุดเป็น HTML ลอยบนจอ (ตัวหนังสือคม) · ตำแหน่งหมุดเก็บใน iot_device_meta (map, px, py)
// เรียกใช้จากหน้าเว็บผ่าน window.IOT3D.render() หลังข้อมูลโหลด
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MAPS = window.IOT_MAPS || {};
const el = document.getElementById("map3d");
const pinLayer = document.getElementById("pins");
const COL = { navy: 0x1f4e79, beam: 0xf28c28, wood: 0xb98a55, box: [0xd8c19a, 0xcfae7c, 0xe3d2b0, 0xbfa070], shelf: 0x16a3c9, flow: 0xe8b80c, floor: 0xf6f9fc, slab: 0xffffff };

let renderer, scene, camera, controls, root, floor, cur = null, raf = 0, placing = null, needs = true;
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), tmp = new THREE.Vector3();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.prepend(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9f0f7);
  scene.fog = new THREE.Fog(0xe9f0f7, 4000, 9000);
  camera = new THREE.PerspectiveCamera(38, 1, 5, 20000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08;
  controls.maxPolarAngle = Math.PI * .47; controls.screenSpacePanning = false;
  controls.addEventListener("change", () => needs = true);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c6d4, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target); scene.userData.sun = sun;
  new ResizeObserver(resize).observe(el);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  loop();
}
function resize() {
  const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); needs = true;
}
function loop() {
  raf = requestAnimationFrame(loop);
  if (controls.update() || needs || controls.autoRotate) { renderer.render(scene, camera); placePins(); needs = false; }
}

/* ---------- สร้างคลัง ---------- */
const box = (w, h, d, c, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: .05, ...o })); m.castShadow = m.receiveShadow = !o.transparent; return m; };
function rand(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }
function textSprite(t, size, color = "#0b2a4a", bg = null) {
  const c = document.createElement("canvas"), x = c.getContext("2d"), f = `800 ${size}px Archivo, 'IBM Plex Sans Thai', sans-serif`;
  x.font = f; const w = Math.ceil(x.measureText(t).width) + size; c.width = w; c.height = size * 1.6;
  x.font = f; if (bg) { x.fillStyle = bg; x.beginPath(); x.roundRect(0, 0, c.width, c.height, size * .4); x.fill(); }
  x.fillStyle = color; x.textBaseline = "middle"; x.fillText(t, size / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; return m;
}

function build(key) {
  const M = MAPS[key]; if (!M) return;
  if (root) { scene.remove(root); root.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose?.(); o.material?.dispose?.(); }); }
  root = new THREE.Group(); scene.add(root); cur = key;
  const [x0, y0, x1, y1] = M.bounds, W = x1 - x0, D = y1 - y0, cx = (x0 + x1) / 2, cz = (y0 + y1) / 2, H = M.rackH;
  // พื้นรอบอาคาร + พื้นอาคาร
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, D * 3), new THREE.MeshStandardMaterial({ color: 0xdfe7ef, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -1, cz); ground.receiveShadow = true; root.add(ground);
  floor = new THREE.Mesh(new THREE.BoxGeometry(W, 4, D), new THREE.MeshStandardMaterial({ color: COL.floor, roughness: .9 }));
  floor.position.set(cx, -2, cz); floor.receiveShadow = true; root.add(floor);
  // โซนพื้น
  for (const z of M.zones || []) {
    const [zx, zy, zw, zh] = z.r, p = new THREE.Mesh(new THREE.PlaneGeometry(zw, zh), new THREE.MeshStandardMaterial({ color: z.c, roughness: 1 }));
    p.rotation.x = -Math.PI / 2; p.position.set(zx + zw / 2, .6, zy + zh / 2); p.receiveShadow = true; root.add(p);
    if (z.t) { const s = textSprite(z.t, Math.min(28, zh * .35), "#b58500"); s.position.set(zx + zw / 2, 1.2, zy + zh / 2); root.add(s); }
  }
  // ผนังโปร่ง + ขอบบน
  const wallH = H * 1.35, wallMat = { color: 0x7fb3d5, transparent: true, opacity: .14, depthWrite: false };
  const walls = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x0, y1, x1, y1], [x0, y0, x0, y1], ...(M.walls || [])];
  for (const [a, b, c, d] of walls) {
    const len = Math.hypot(c - a, d - b), th = 4, wm = box(a === c ? th : len, wallH, a === c ? len : th, 0x7fb3d5, wallMat);
    wm.position.set((a + c) / 2, wallH / 2, (b + d) / 2); root.add(wm);
    const cap = box(a === c ? 6 : len, 4, a === c ? len : 6, 0x0f5c8c); cap.position.set((a + c) / 2, wallH, (b + d) / 2); root.add(cap);
  }
  for (const [ox, oy, ow, oh, t] of M.offices || []) {
    const o = box(ow, H * .45, oh, 0xdbe6f1); o.position.set(ox + ow / 2, H * .225, oy + oh / 2); root.add(o);
    const s = textSprite(t, 22); s.position.set(ox + ow / 2, H * .45 + 1, oy + oh / 2); root.add(s);
  }
  // ชั้นวาง: เสา (กรมท่า) · คาน (ส้ม) · พาเลท + กล่องสินค้า
  const ups = [], beams = [], pals = [], goods = [], solid = [];
  const R = rand(key.length * 7919 + M.boxes.length);
  const bay = M.pxm * 2.8, lv = 4;
  for (const [bx, by, bw, bh, t] of M.boxes) {
    if (t === "pallet") { // พื้นที่วางพาเลทบนพื้น
      const n = Math.max(1, Math.floor(bw / (M.pxm * 1.3))), m = Math.max(1, Math.floor(bh / (M.pxm * 1.3)));
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { if (R() < .25) continue;
        const px = bx + (i + .5) * bw / n, pz = by + (j + .5) * bh / m, hh = H * (.12 + R() * .14);
        goods.push([px, hh / 2, pz, bw / n * .82, hh, bh / m * .82]); }
      continue;
    }
    if (t === "shelf" || t === "flow") { solid.push([bx, by, bw, bh, t]); continue; }
    const along = bh >= bw, L = along ? bh : bw, WdAll = along ? bw : bh, nb = Math.max(1, Math.round(L / bay)), step = L / nb;
    // บล็อกกว้าง (หลายแถว) → แบ่งเป็นแถวชั้นวางย่อยกว้าง ~2.6 ม. เว้นช่องเดิน
    const nr = Math.max(1, Math.round(WdAll / (M.pxm * 2.6))), pitch = WdAll / nr, Wd = nr > 1 ? pitch * .82 : WdAll;
    for (let r = 0; r < nr; r++) {
    const off = r * pitch;
    const P = (u, v) => along ? [bx + off + v, by + u] : [bx + u, by + off + v];
    for (let i = 0; i <= nb; i++) for (const v of [1, Wd - 1]) { const [px, pz] = P(i * step, v); ups.push([px, H / 2, pz, 2.2, H, 2.2]); }
    for (let k = 1; k <= lv; k++) { const y = H * k / lv - 2;
      for (const v of [1, Wd - 1]) { const [px, pz] = P(L / 2, v); beams.push(along ? [px, y, pz, 1.8, 2.4, L] : [px, y, pz, L, 2.4, 1.8]); } }
    for (let i = 0; i < nb; i++) for (let k = 0; k < lv; k++) { if (R() < .22) continue;
      const [px, pz] = P((i + .5) * step, Wd / 2), y = H * k / lv, gh = H / lv * (.55 + R() * .3);
      const pw = along ? Wd * .84 : step * .84, pd = along ? step * .84 : Wd * .84;
      pals.push([px, y + 1.2, pz, pw, 2.4, pd]); goods.push([px, y + 2.4 + gh / 2, pz, pw * .92, gh, pd * .92]); }
    }
  }
  const inst = (list, color, opts = {}) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color, roughness: .75, metalness: opts.metal || 0 }), list.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((b, i) => { m4.makeScale(b[3], b[4], b[5]); m4.setPosition(b[0], b[1], b[2]); mesh.setMatrixAt(i, m4); if (opts.vary) mesh.setColorAt(i, c.setHex(opts.vary[i % opts.vary.length])); });
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  };
  inst(ups, COL.navy, { metal: .3 }); inst(beams, COL.beam, { metal: .2 }); inst(pals, COL.wood); inst(goods, 0xffffff, { vary: COL.box });
  for (const [bx, by, bw, bh, t] of solid) { // ชั้นวางสีฟ้า (shelf) / Flow rack สีเหลือง
    const s = box(bw * .9, H * .8, bh, t === "flow" ? COL.flow : COL.shelf, { roughness: .6 }); s.position.set(bx + bw / 2, H * .4, by + bh / 2); root.add(s);
  }
  for (const l of M.labels || []) { const s = textSprite(l.t, 50, "#0f5c8c", "rgba(255,255,255,.85)"); s.position.set(l.x, 1.5, l.y); root.add(s); }
  // แสง + กล้อง
  const sun = scene.userData.sun, span = Math.max(W, D);
  sun.position.set(cx - span * .35, span * .9, cz + span * .55); sun.target.position.set(cx, 0, cz);
  Object.assign(sun.shadow.camera, { left: -span * .7, right: span * .7, top: span * .7, bottom: -span * .7, near: 10, far: span * 3 }); sun.shadow.camera.updateProjectionMatrix();
  scene.fog.near = span * 1.6; scene.fog.far = span * 4;
  view("3d");
  needs = true;
}
function view(mode) {
  const M = MAPS[cur]; if (!M) return;
  const [x0, y0, x1, y1] = M.bounds, W = x1 - x0, D = y1 - y0, cx = (x0 + x1) / 2, cz = (y0 + y1) / 2;
  // ระยะกล้องให้เห็นทั้งคลังพอดีจอ (คิดทั้งกว้างและลึก ตามสัดส่วนจอ)
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  const top = mode === "top", dist = Math.max((W / 2) / Math.tan(hf), (D / 2) / Math.tan(vf) * (top ? 1 : 1.35)) * (top ? 1.08 : .98);
  const dir = top ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(-.04, .62, .78).normalize();
  controls.target.set(cx, 0, cz + (top ? 0 : D * .04));
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.maxDistance = dist * 2.2; controls.minDistance = Math.max(W, D) * .06;
  camera.lookAt(controls.target); controls.update(); needs = true;
}

/* ---------- หมุดเซนเซอร์ (HTML) ---------- */
let PINS = [];
function placePins() {
  if (!PINS.length) return;
  const w = el.clientWidth, h = el.clientHeight, H = (MAPS[cur] || {}).rackH || 60;
  for (const p of PINS) {
    tmp.set(p.x, H * 1.25, p.z).project(camera);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15;
    p.el.style.display = vis ? "" : "none";
    if (vis) p.el.style.transform = `translate(${(tmp.x + 1) / 2 * w}px, ${(1 - tmp.y) / 2 * h}px)`;
    p.el.style.zIndex = String(1000 - Math.round(tmp.z * 900));
  }
}
function setPins(list) {
  // list: [{id, px, py, html, cls, title}]
  if (!root) return;
  root.children.filter(o => o.userData.pin).forEach(o => { root.remove(o); o.geometry.dispose(); o.material.dispose(); });
  pinLayer.innerHTML = ""; PINS = [];
  const H = (MAPS[cur] || {}).rackH || 60;
  for (const p of list) {
    const d = document.createElement("button"); d.type = "button"; d.className = "pin " + (p.cls || ""); d.dataset.id = p.id; d.title = p.title || "";
    d.innerHTML = `<span class="pb">${p.html}</span><i></i>`; pinLayer.appendChild(d);
    // เสาหมุด + จุดบนพื้น (3D)
    const col = p.cls?.includes("hot") ? 0xc7362b : p.cls?.includes("off") ? 0x8a96a3 : p.color || 0x0f7fb0;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, H * 1.25, 8), new THREE.MeshBasicMaterial({ color: col }));
    stem.position.set(p.px, H * .625, p.py); stem.userData.pin = 1; root.add(stem);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(H * .16, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .35 }));
    dot.rotation.x = -Math.PI / 2; dot.position.set(p.px, 1.5, p.py); dot.userData.pin = 1; root.add(dot);
    PINS.push({ el: d, x: p.px, z: p.py });
  }
  needs = true;
}

/* ---------- วางหมุด: คลิกบนพื้น ---------- */
let downAt = null;
function onDown(e) { downAt = [e.clientX, e.clientY]; }
function onUp(e) {
  if (!placing || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  v2.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(v2, camera);
  const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  if (!hit) return;
  const [x0, y0, x1, y1] = MAPS[cur].bounds;
  if (hit.x < x0 || hit.x > x1 || hit.z < y0 || hit.z > y1) return;
  const id = placing; placing = null; el.classList.remove("placing");
  window.IOT3D.onPlace?.(id, cur, Math.round(hit.x), Math.round(hit.z));
}

window.IOT3D = {
  maps: MAPS,
  ok: true,
  show(key) { if (!renderer) init(); resize(); if (key !== cur) build(key); },
  current: () => cur,
  view,
  setPins,
  spin(on) { controls.autoRotate = !!on; controls.autoRotateSpeed = .8; needs = true; return controls.autoRotate; },
  place(id) { placing = id; el.classList.toggle("placing", !!id); },
  onPlace: null
};
window.dispatchEvent(new Event("iot3d-ready"));
