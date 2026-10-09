// แผนที่คลัง 3D ของ IOT Dashboard (6 ต.ค. 2569 · ผู้ใช้ขอ: แผนที่คลัง 3D + Pin ตำแหน่งเซนเซอร์ · ด้านล่างเป็นรายละเอียด)
// ใช้ three.js · ผังจาก window.IOT_MAPS (maps.js) · หมุดเป็น HTML ลอยบนจอ (ตัวหนังสือคม) · ตำแหน่งหมุดเก็บใน iot_device_meta (map, px, py)
// เรียกใช้จากหน้าเว็บผ่าน window.IOT3D.render() หลังข้อมูลโหลด
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MAPS = window.IOT_MAPS || {};
const el = document.getElementById("map3d");
const pinLayer = document.getElementById("pins");
/* 9 ต.ค. ผู้ใช้ขอสีสดขึ้น: เสาฟ้าสด · คานส้มสด · สินค้าหลายสี (ลังน้ำตาลอ่อน + ฟิล์มสี) */
const COL = { navy: 0x1670e0, beam: 0xff6a00, wood: 0xd9a066, box: [0xd9ac72, 0xe8c48e, 0xeef2f6, 0xd9ac72, 0xf3c623, 0xe8c48e, 0xdfe6ee, 0xc99a5b, 0xf3c623, 0x4a86d9, 0xd9ac72, 0xe0533d], /* 9 ต.ค. ปรับตามรูปจริง: ลังน้ำตาล · ฟิล์มใส · กระสอบเหลือง · บางส่วนสีอื่น */ shelf: 0x16a3c9, flow: 0xe8b80c, floor: 0xf6f9fc, slab: 0xffffff };

let renderer, scene, camera, controls, root, floor, ground, cur = null, raf = 0, placing = null, needs = true, THEME = "light";
const TH = { light: { bg: 0xe9f0f7, ground: 0xdfe7ef, floor: 0xf6f9fc, wall: 0x7fb3d5, cap: 0x0f5c8c, wo: .14 }, dark: { bg: 0x0a1320, ground: 0x0e1b2b, floor: 0x16283d, wall: 0x38bdf8, cap: 0x38bdf8, wo: .1 } };
const wallMats = [], capMats = [];
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), tmp = new THREE.Vector3();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; // แสงแบบ Digital Twin
  el.prepend(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(TH[THEME].bg);
  scene.fog = new THREE.Fog(TH[THEME].bg, 4000, 9000);
  camera = new THREE.PerspectiveCamera(38, 1, 5, 20000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08;
  /* 9 ต.ค. ผู้ใช้ว่าหมุนแล้วงง → ควบคุมแบบแผนที่: ลากซ้าย/นิ้วเดียว = เลื่อน · ลากขวา/สองนิ้ว = หมุน (จำกัดมุม) · ล้อ/บีบ = ซูม
     มุมก้ม 20–70° · หมุนรอบได้ ±40° จากมุมเริ่มต้น · จุดกลางไม่หลุดออกนอกคลัง */
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.minPolarAngle = Math.PI * .02; controls.maxPolarAngle = Math.PI * .39; controls.screenSpacePanning = false;
  controls.rotateSpeed = .5; controls.panSpeed = .9; controls.zoomSpeed = .9;
  controls.addEventListener("change", () => { needs = true; const B = (MAPS[cur] || {}).view || (MAPS[cur] || {}).bounds; if (!B) return;
    const t = controls.target, cx = Math.min(Math.max(t.x, B[0]), B[2]), cz = Math.min(Math.max(t.z, B[1]), B[3]);
    if (cx !== t.x || cz !== t.z) { const dx = cx - t.x, dz = cz - t.z; t.x = cx; t.z = cz; camera.position.x += dx; camera.position.z += dz; } });
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c6d4, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target); scene.userData.sun = sun;
  new ResizeObserver(resize).observe(el);
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }).observe(el);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  loop();
}
function resize() {
  const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); needs = true;
}
let fly = null, MOVERS = [], lastMove = 0;
let onScreen = true; /* แผนที่เลื่อนพ้นจอ = หยุดรถวิ่ง (ประหยัดเครื่อง) */
function loop() {
  raf = requestAnimationFrame(loop);
  if (fly) { // เลื่อนกล้องไปยังเซนเซอร์แบบนุ่มๆ
    const k = Math.min(1, (performance.now() - fly.t0) / 650), e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(fly.a0, fly.a1, e); camera.position.lerpVectors(fly.c0, fly.c1, e); needs = true;
    if (k >= 1) fly = null;
  }
  /* รถโฟล์คลิฟท์วิ่งไป-กลับตามเส้นทาง (Digital Twin) · ~30 fps · หยุดเมื่อแท็บไม่แสดง */
  const now = performance.now();
  if (MOVERS.length && onScreen && !document.hidden && now - lastMove > 50) { lastMove = now;
    for (const m of MOVERS) { const L = Math.hypot(m.bx - m.ax, m.bz - m.az) || 1, u = ((now / 1000 * m.v / L) + m.o) % 2, k = u < 1 ? u : 2 - u, e = k * k * (3 - 2 * k);
      m.g.position.set(m.ax + (m.bx - m.ax) * e, 0, m.az + (m.bz - m.az) * e); m.g.rotation.y = Math.atan2(m.bx - m.ax, m.bz - m.az) + (u < 1 ? Math.PI : 0); }
    needs = true; }
  if (controls.update() || needs || controls.autoRotate) { renderer.render(scene, camera); placePins(); needs = false; }
}

/* ---------- สร้างคลัง ---------- */
const box = (w, h, d, c, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: .05, ...o })); m.castShadow = m.receiveShadow = !o.transparent; return m; };
function rand(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }
/* Mezzanine เหล็กฟ้า 2 ชั้น (ตามรูปจริง): เสา · พื้นชั้นบน · ราวกันตก + ตะแกรง · ลังบนชั้นบน · บันไดลิงกรงส้ม · โต๊ะแพ็กด้านล่าง */
function mezzanine(z, P) {
  const [x, y, w, h] = z.r, H = P * (z.h || 3.6), blue = 0x1f63d6, R = rand(911);
  for (let xx = x; xx <= x + w + .1; xx += w / Math.max(1, Math.round(w / (P * 4)))) for (let yy = y; yy <= y + h + .1; yy += h / Math.max(1, Math.round(h / (P * 6)))) { const c = box(P * .3, H, P * .3, blue); c.position.set(xx, H / 2, yy); root.add(c); }
  const deck = box(w, P * .25, h, 0x9aa6b4); deck.position.set(x + w / 2, H, y + h / 2); root.add(deck);
  for (const [a, b, c, d] of [[x, y, x + w, y], [x, y + h, x + w, y + h], [x, y, x, y + h], [x + w, y, x + w, y + h]]) {
    const L = Math.hypot(c - a, d - b), along = a === c, bm = box(along ? P * .3 : L, P * .35, along ? L : P * .3, blue); bm.position.set((a + c) / 2, H - P * .1, (b + d) / 2); root.add(bm);
    const rl = box(along ? P * .12 : L, P * .1, along ? L : P * .12, blue); rl.position.set((a + c) / 2, H + P * 1.1, (b + d) / 2); root.add(rl);
    const mesh = box(along ? P * .05 : L, P * 1, along ? L : P * .05, 0x6f9fe8, { transparent: true, opacity: .35 }); mesh.position.set((a + c) / 2, H + P * .6, (b + d) / 2); root.add(mesh); }
  const n = Math.floor(w / (P * 1.3)), m = Math.floor(h / (P * 1.3));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { if (R() < .3) continue; const hh = P * (.6 + R() * 1.4), b = box(P * 1.15, hh, P * 1.15, R() < .8 ? 0xd9ac72 : 0xe8c48e); b.position.set(x + (i + .5) * w / n, H + P * .13 + hh / 2, y + (j + .5) * h / m); root.add(b); }
  const lx = x - P * .5, ly = y + P * .8;                                                     // บันไดลิงกรงส้ม
  for (const dx of [-P * .3, P * .3]) { const r = box(P * .08, H + P * 1.2, P * .08, 0xf08a1c); r.position.set(lx + dx, (H + P * 1.2) / 2, ly); root.add(r); }
  for (let yy = P * 2; yy < H + P * 1.2; yy += P * .6) { const ring = box(P * .8, P * .06, P * .8, 0xf08a1c, { transparent: true, opacity: .6 }); ring.position.set(lx, yy, ly + P * .3); root.add(ring); }
  for (let k = 0; k < Math.floor(h / (P * 5)); k++) { const t = box(P * 1.8, P * .9, P * .9, 0xf2f4f7); t.position.set(x + w * .3, P * .45, y + P * 3 + k * P * 5); root.add(t);
    const bx = box(P * 1, P * .8, P * 1, 0xd9ac72); bx.position.set(x + w * .72, P * .4, y + P * 3.5 + k * P * 5); root.add(bx); }
  if (z.t) { const s = textSprite(z.t, P * 1.6, "#1f63d6", "rgba(255,255,255,.9)"); s.position.set(x + w / 2, H + P * 2.4, y + h / 2); root.add(s); }
}
/* ห้องประชุม/สำนักงาน 2 ชั้น (ตามรูปจริง): ผนังเขียวเทา · หน้าต่างกรอบดำ · ประตูกระจก · บันไดเหล็กดำด้านข้าง · ราวบนหลังคา */
function meetingRoom(b, P) {
  const [x, y, w, h] = b.r, H = P * (b.h || 7), col = b.c || 0x9fb5a6, face = b.face || "w";
  const body = box(w, H, h, col, { roughness: .9 }); body.position.set(x + w / 2, H / 2, y + h / 2); root.add(body);
  const fx = face === "w" ? x - P * .05 : x + w + P * .05, nW = Math.max(2, Math.floor(h / (P * 5)));
  for (let i = 0; i < nW; i++) { const zc = y + (i + .6) * h / (nW + .4);
    for (const [y0, hh] of [[P * 1.2, P * 1.4], [P * 4.2, P * 1.7]]) { const fr = box(P * .12, hh + P * .15, P * 2.2, 0x15181c); fr.position.set(fx, y0 + hh / 2, zc); root.add(fr);
      const gl = box(P * .14, hh, P * 2, 0x2b3f55, { metalness: .5, roughness: .2 }); gl.position.set(fx, y0 + hh / 2, zc); root.add(gl); } }
  const door = box(P * .14, P * 2.4, P * 1.8, 0x7fa8c4, { transparent: true, opacity: .75 }); door.position.set(fx, P * 1.2, y + h - P * 2.5); root.add(door);
  const df = box(P * .16, P * 2.6, P * 2, 0x15181c); df.position.set(fx + (face === "w" ? -P * .02 : P * .02), P * 1.3, y + h - P * 2.5); root.add(df);
  for (let k = 0; k < 14; k++) { const st = box(P * 1.1, P * .12, P * .35, 0x1b1d21); st.position.set(fx + (face === "w" ? -P * .7 : P * .7), (k + 1) * H / 14, y + h + P * .3 + k * P * .32); root.add(st); }
  const rail = box(P * .08, P * 1, h, 0x1b1d21); rail.position.set(fx, H + P * .5, y + h / 2); root.add(rail);
  if (b.t) { const s = textSprite(b.t, P * 1.6, "#2d3e33", "rgba(255,255,255,.9)"); s.position.set(x + w / 2, H + P * .3, y + h / 2); root.add(s); }
}
/* รถโฟล์คลิฟท์ (Counterbalance) · ตัวรถเหลือง · เสายก · งา · หลังคากันของตก · ล้อ */
function forklift(x, z, r, c = 0xffb300, P) {
  const g = new THREE.Group(), add = (w, h, d, col, px, py, pz) => { const m = box(w * P, h * P, d * P, col); m.position.set(px * P, py * P, pz * P); g.add(m); };
  add(1.15, .9, 2.1, c, 0, .75, 0); add(1.1, .7, .55, 0x2b2f36, 0, 1.0, .95);                      // ตัวรถ + น้ำหนักถ่วง
  add(.12, 2.3, .12, 0x2b2f36, -.4, 1.15, -1.1); add(.12, 2.3, .12, 0x2b2f36, .4, 1.15, -1.1);     // เสายก
  add(.12, .06, 1.1, 0x9aa3ad, -.3, .25, -1.7); add(.12, .06, 1.1, 0x9aa3ad, .3, .25, -1.7);        // งา
  add(1.05, .06, 1.2, 0x2b2f36, 0, 2.2, .05);                                                     // หลังคากันของตก
  for (const sx of [-.48, .48]) for (const sz of [-.1, .2]) add(.06, 1, .06, 0x2b2f36, sx, 1.7, sz * 3);
  add(.45, .35, .4, 0x1d2a3a, 0, 1.35, .2);                                                       // เบาะคนขับ
  for (const sx of [-.55, .55]) for (const sz of [-.65, .7]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.28 * P, .28 * P, .25 * P, 12), new THREE.MeshStandardMaterial({ color: 0x15171a })); w.rotation.z = Math.PI / 2; w.position.set(sx * P, .28 * P, sz * P); g.add(w); }
  g.position.set(x, 0, z); g.rotation.y = r; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); root.add(g); return g;
}
/* รถเทรลเลอร์ (หัวลาก + ตู้) · r = หมุนรอบแกนตั้ง · ตู้ยาวไปทาง +z */
function trailer(x, z, r, rr, P) {
      const L = P * 12, Wt = P * 2.5, Ht = P * 3.9, g = new THREE.Group(), col = [0xf3f5f8, 0x2f6fb5, 0xd9541e][Math.floor(rr * 3)];
      const tr = box(Wt, Ht, L, col); tr.position.set(0, Ht / 2 + P * 1.1, L / 2 + P * .7); g.add(tr);
      const ch = box(Wt * .9, P * .5, L * .9, 0x3a3f46); ch.position.set(0, P * .8, L / 2 + P * .7); g.add(ch);
      const cab = box(Wt, P * 3, P * 2.6, 0xe9edf2); cab.position.set(0, P * 1.9, L + P * 2.3); g.add(cab);
      const ws = box(Wt * .92, P * 1, P * .1, 0x1d2a3a); ws.position.set(0, P * 2.6, L + P * 3.62); g.add(ws);
      for (const z of [L * .2, L * .3, L + P * 1.6, L + P * 3.1]) for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(P * .5, P * .5, P * .35, 14), new THREE.MeshStandardMaterial({ color: 0x1b1d21 })); w.rotation.z = Math.PI / 2; w.position.set(sx * Wt * .45, P * .5, z); g.add(w); }
  g.position.set(x, 0, z); g.rotation.y = r; g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); root.add(g);
}
/* รถเก๋ง (ภายนอกคลัง) */
function car(x, z, r, c, P) { const g = new THREE.Group(), add = (w, h, d, col, px, py, pz, o) => { const m = box(w * P, h * P, d * P, col, o); m.position.set(px * P, py * P, pz * P); g.add(m); };
  add(1.8, .75, 4.4, c, 0, .6, 0, { metalness: .4, roughness: .4 }); add(1.6, .6, 2.3, 0x24303d, 0, 1.25, -.1, { metalness: .5, roughness: .2 }); add(1.55, .08, 2.2, c, 0, 1.58, -.1);
  for (const sx of [-.82, .82]) for (const sz of [-1.4, 1.4]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.34 * P, .34 * P, .22 * P, 12), new THREE.MeshStandardMaterial({ color: 0x15171a })); w.rotation.z = Math.PI / 2; w.position.set(sx * P, .34 * P, sz * P); g.add(w); }
  g.position.set(x, 0, z); g.rotation.y = r; g.traverse(o => { if (o.isMesh) o.castShadow = true; }); root.add(g); }
function moto(x, z, c, P) { const g = new THREE.Group(), add = (w, h, d, col, py, pz) => { const m = box(w * P, h * P, d * P, col); m.position.set(0, py * P, pz * P); g.add(m); };
  add(.35, .45, 1.5, c, .55, 0); add(.3, .15, .7, 0x1b1d21, .85, .2); add(.08, .6, .08, 0x9aa3ad, .9, -.6); add(.15, .5, .5, 0x15171a, .25, -.65); add(.15, .5, .5, 0x15171a, .25, .65);
  g.position.set(x, 0, z); root.add(g); }
/* สำนักงานชั้นเดียว (ตามรูปจริง WH5): ผนังเทาอ่อน · บัวหลังคาน้ำเงินยื่น · เสาใหญ่น้ำเงิน · หน้าต่างกรอบดำ · ทางลาดราวเหลืองดำ · บันไดราวสแตนเลส · ขอบฟุตบาทแดงขาว */
function officeBldg(o, P) { const [x, y, w, h] = o.r, Hb = P * 4.2, fz = y + h;
  const pl = box(w, P * .9, h, 0x8e9aab); pl.position.set(x + w / 2, P * .45, y + h / 2); root.add(pl);
  const wl = box(w, Hb - P * .9, h, 0xe3e6e8, { roughness: .9 }); wl.position.set(x + w / 2, P * .9 + (Hb - P * .9) / 2, y + h / 2); root.add(wl);
  const rf = box(w + P * 1.6, P * .3, h + P * 2.4, 0xd9dde2); rf.position.set(x + w / 2, Hb + P * .15, y + h / 2 + P * .6); root.add(rf);
  for (const [fw, fd, px, pz] of [[w + P * 1.6, P * .25, x + w / 2, fz + P * 1.8], [P * .25, h + P * 2.4, x - P * .8, y + h / 2 + P * .6], [P * .25, h + P * 2.4, x + w + P * .8, y + h / 2 + P * .6]]) {
    const fa = box(fw, P * .9, fd, 0x1f4fa8); fa.position.set(px, Hb - P * .1, pz); root.add(fa); }
  const col = box(P * 2, Hb, P * 1.4, 0x1f4fa8); col.position.set(x + w * .45, Hb / 2, fz + P * 1.1); root.add(col);
  for (let i = 0; i < 7; i++) { if (i === 3) continue; const wx = x + P * 2 + i * (w - P * 4) / 6.2, win = box(P * 3.2, P * 1.6, P * .12, 0x1f2a36, { metalness: .5, roughness: .2 }); win.position.set(wx + P * 1.6, P * 2.4, fz + P * .02); root.add(win); }
  const dr = box(P * 1.8, P * 2.3, P * .12, 0x15181c); dr.position.set(x + w * .62, P * 2.05, fz + P * .02); root.add(dr);
  for (let k = 0; k < 6; k++) { const s = box(P * 2.2, P * .15 * (6 - k), P * .35, 0xeceff2); s.position.set(x + w * .62, P * .075 * (6 - k), fz + P * .3 + k * P * .35); root.add(s); }
  for (const sx of [-1.2, 1.2]) { const rl = box(P * .08, P * 1, P * 2.2, 0xc9d1d9, { metalness: .8, roughness: .2 }); rl.position.set(x + w * .62 + sx * P, P * 1.1, fz + P * 1.2); root.add(rl); }
  const rp = box(w * .38, P * .5, P * 2.2, 0xa9b3bf); rp.position.set(x + w * .2, P * .25, fz + P * 1.3); rp.rotation.z = .05; root.add(rp);
  for (let i = 0; i < 12; i++) { const rx = x + i * w * .38 / 11, po = box(P * .14, P * 1, P * .14, i % 2 ? 0x1b1d21 : 0xf2c200); po.position.set(rx, P * .9, fz + P * 2.35); root.add(po); }
  const hr = box(w * .38, P * .12, P * .14, 0xf2c200); hr.position.set(x + w * .19, P * 1.4, fz + P * 2.35); root.add(hr);
  for (let x2 = x + w * .4; x2 < x + w; x2 += P * 1) { const cb = box(P * 1, P * .3, P * .4, (Math.floor((x2 - x) / P) % 2) ? 0xd9341e : 0xf6f6f6); cb.position.set(x2 + P * .5, P * .15, fz + P * 3); root.add(cb); }
  if (o.t) { const t = textSprite(o.t, P * 1.6, "#1f4fa8", "rgba(255,255,255,.92)"); t.position.set(x + w / 2, Hb + P * .5, y + h / 2); root.add(t); } }
/* รอบอาคาร: ลานจอด/ถนน · ประตู Dock + เบอร์ + Dock leveler · รถเทรลเลอร์จอดบาง Dock · หลังคา Canopy · ป้ายประตูทางเข้า */
function siteDetail(M, H) {
  const P = M.pxm, [x0, y0, x1, y1] = M.bounds, flat = (x, y, w, h, c, yy = .4, o = {}) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: c, roughness: 1, ...o })); m.rotation.x = -Math.PI / 2; m.position.set(x + w / 2, yy, y + h / 2); m.receiveShadow = true; root.add(m); return m; };
  // ขอบพื้นอาคาร (คอนกรีตยกเล็กน้อย ไม่ใช่กรอบ)
  const edge = box(x1 - x0 + 3, 3, y1 - y0 + 3, 0xcfd6de); edge.position.set((x0 + x1) / 2, -1.2, (y0 + y1) / 2); root.add(edge);
  for (const a of M.aprons || []) flat(a[0], a[1], a[2], a[3], a[4] || 0xd9dee4, .2);
  for (const r of M.roads || []) { flat(r[0], r[1], r[2], r[3], 0x4a5361, .3);
    for (let x = r[0] + 10; x < r[0] + r[2] - 20; x += 40) flat(x, r[1] + r[3] / 2 - 1, 20, 2, 0xf4f4f4, .5); }
  const DW = P * 3.2, DH = P * 4.4, R = rand(77 + (M.docks || []).length);
  for (const d of M.docks || []) {
    const x = d.x, y = d.y ?? y1;
    const sh = box(DW + P * .6, DH + P * .4, P * .5, 0x2b313a); sh.position.set(x, (DH + P * .4) / 2, y + P * .25); root.add(sh);   // ซีลกันฝน
    const dr = box(DW, DH, P * .3, 0x9aa7b6, { metalness: .3 }); dr.position.set(x, DH / 2, y + P * .45); root.add(dr);            // ประตูม้วน
    const lv = box(DW * .9, P * .15, P * 2.4, 0x6f7883); lv.position.set(x, P * .1, y - P * 1.2); root.add(lv);                   // Dock leveler
    flat(x - DW / 2, y + P * 1, DW, P * .25, 0xf2c200, .45);                                                                       // เส้นเหลือง
    const n = textSprite(String(d.n), P * 1.6, "#0b2a4a", "rgba(255,255,255,.9)"); n.position.set(x, .8, y + P * 3); root.add(n);
    if (d.truck ?? R() < (M.trucks ?? .45)) trailer(x, y + P * .3, 0, R(), P);                                         // รถเทรลเลอร์
  }
  /* 9 ต.ค. ตามรูปจริง: Canopy โครงเหล็กดำ-ส้ม (ท่อนล่างเหลือง) ฐานคอนกรีต · หลังคาเมทัลชีทขาว · ยางกั้นเหลืองดำแนวเสา */
  for (const c of M.canopies || []) { const [cx, cy, cw, ch, ct] = c, Hc = P * 7, oy = cy + ch - 3;
    const rf = box(cw, P * .35, ch, 0xe9edf2, { metalness: .3 }); rf.position.set(cx + cw / 2, Hc, cy + ch / 2); root.add(rf);
    const ed = box(cw, P * .6, P * .3, 0x1b1d21); ed.position.set(cx + cw / 2, Hc - P * .3, oy + 3); root.add(ed);
    const n = Math.max(2, Math.round(cw / (P * 6)));
    for (let i = 0; i <= n; i++) { const x = cx + 3 + i * (cw - 6) / n;
      const bs = box(P * 1.1, P * .9, P * 1.1, 0xc9ced4); bs.position.set(x, P * .45, oy); root.add(bs);
      for (let k = 0; k < 6; k++) { const hh = (Hc - P * .9) / 6, col = k === 0 ? 0xf2b705 : (k % 2 ? 0x1b1d21 : 0xf04e23); const sg = box(P * .45, hh, P * .45, col); sg.position.set(x, P * .9 + hh * (k + .5), oy); root.add(sg); }
      const br = box(P * .3, P * .3, ch * .55, 0xf04e23); br.position.set(x, Hc - P * 1.2, oy - ch * .3); br.rotation.x = .35; root.add(br); }
    for (let x = cx; x < cx + cw; x += P * 1.2) { const st = box(P * 1.1, P * .25, P * .5, (Math.round((x - cx) / (P * 1.2)) % 2) ? 0x1b1d21 : 0xf2c200); st.position.set(x + P * .6, P * .12, oy + P * 1); root.add(st); }
    if (ct) { const t = textSprite(ct, P * 1.8, "#3c4a68"); t.position.set(cx + cw / 2, Hc + P * .4, cy + ch / 2); root.add(t); } }
  /* ด้านหน้า (ผู้ใช้สั่ง 9 ต.ค.): รั้ว Chainlink สีฟ้า + Footpath ขอบแดงขาว · ที่จอดรถเรียงริมรั้ว · เสาไฟฟ้า + หม้อแปลง · ช่องประตู Gate */
  const F = M.front; if (F) { const fy = F.fy, gaps = F.gaps || [], gw = F.gw || 40, inGap = x => gaps.some(g => Math.abs(x - g) < gw / 2), Hf = P * 2.1;
    flat(x0, F.foot[0], x1 - x0, F.foot[1], 0xd5d9de, .5);
    for (let x = x0; x < x1; x += P * 1) { const cb = box(P * 1, P * .3, P * .4, (Math.floor((x - x0) / P) % 2) ? 0xd9341e : 0xf6f6f6); cb.position.set(x + P * .5, P * .15, F.foot[0] + F.foot[1]); root.add(cb); }
    const segs = []; let st = x0; for (const g of [...gaps].sort((a, b) => a - b)) { segs.push([st, g - gw / 2]); st = g + gw / 2; } segs.push([st, x1]);
    const mesh = new THREE.MeshStandardMaterial({ color: 0x3b82d6, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false });
    for (const [a, b] of segs) { if (b - a < 2) continue; const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a, Hf), mesh); m.position.set((a + b) / 2, Hf / 2, fy); root.add(m);
      const rl = box(b - a, P * .08, P * .08, 0x1f5fb8); rl.position.set((a + b) / 2, Hf, fy); root.add(rl);
      for (let x = a; x <= b; x += P * 3) { const po = box(P * .12, Hf, P * .12, 0x1f5fb8); po.position.set(x, Hf / 2, fy); root.add(po); } }
    // รถเก๋งจอดริมรั้ว (สุ่ม) · เว้นช่องประตูและสิ่งก่อสร้าง
    const RR = rand(901 + Math.round(x0)), cols = [0xf4f5f7, 0x1d2026, 0xb7bec7, 0xf4f5f7, 0x3a4250, 0x9a1f1f], [p0, p1] = F.park || [0, 0], blocked = (x) => inGap(x) || (M.offices || []).some(o => x > o[0] - 10 && x < o[0] + o[2] + 10 && o[1] + o[3] > p0) || (M.carport || []).concat(M.canteen || []).some(o => x > o.r[0] - 10 && x < o.r[0] + o.r[2] + 10 && o.r[1] + o.r[3] > p0);
    if (F.park) for (let x = x0 + P * 2; x < x1 - P * 2; x += P * 2.7) { if (blocked(x) || RR() < .4) continue; car(x, (p0 + p1) / 2, Math.PI / 2 * (RR() < .5 ? 1 : -1) * 0 + Math.PI, cols[Math.floor(RR() * cols.length)], P); }
    if (F.park) for (let x = x0; x < x1; x += P * 2.7) flat(x, p0, P * .15, p1 - p0, 0xf4f4f4, .55);
    for (const t of F.trailers || []) trailer(t.x, t.y, t.r ?? Math.PI / 2, t.c ?? RR(), P);
    // เสาไฟฟ้า + สายไฟ + หม้อแปลง
    const tops = []; for (const px of F.poles || []) { const po = box(P * .35, P * 11, P * .35, 0xb9bec4); po.position.set(px, P * 5.5, fy - P * 1.2); root.add(po);
      const arm = box(P * 2.4, P * .2, P * .2, 0x6f7883); arm.position.set(px, P * 10.3, fy - P * 1.2); root.add(arm); tops.push([px, fy - P * 1.2]);
      if (Math.abs(px - F.tx) < 160 && !F._t) { F._t = 1; const tr = box(P * 1.2, P * 1.4, P * .9, 0x7d8896, { metalness: .4 }); tr.position.set(px, P * 7.2, fy - P * 1.9); root.add(tr); const pl = box(P * 2, P * .2, P * 1, 0x6f7883); pl.position.set(px, P * 6.4, fy - P * 1.9); root.add(pl); } }
    const wm = new THREE.LineBasicMaterial({ color: 0x2b2f36 }); for (let i = 1; i < tops.length; i++) for (const dx of [-P, 0, P]) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(tops[i - 1][0] + dx, P * 10.4, tops[i - 1][1]), new THREE.Vector3(tops[i][0] + dx, P * 10.4, tops[i][1])]); root.add(new THREE.Line(g, wm)); } }
  for (const o of M.ofb || []) officeBldg(o, P);
  for (const o of M.canteen || []) { const [x, y, w, h] = o.r, Hc = P * 3.6;
    const rf = box(w, P * .3, h, o.rc ?? 0xb3bcc6, { metalness: o.rc ? .1 : .4 }); rf.position.set(x + w / 2, Hc, y + h / 2); root.add(rf);
    const bk = box(w, Hc, P * .3, 0x9aa3ad); bk.position.set(x + w / 2, Hc / 2, y + P * .2); root.add(bk);
    if (o.shop !== false) { // ร้าน 7-Eleven (WH5)
      const sh = box(w * .3, P * 2.8, h * .45, 0xf4f6f8); sh.position.set(x + w * .82, P * 1.4, y + h * .25); root.add(sh);
      const sg = box(w * .3, P * .5, P * .1, 0x1a8f3c); sg.position.set(x + w * .82, P * 2.6, y + h * .48); root.add(sg); }
    for (let i = 0; i < 3; i++) { const tb = box(P * 2.2, P * .75, P * .8, 0xf4f6f8); tb.position.set(x + w * .2 + i * P * 3, P * .4, y + h * .55); root.add(tb); }
    for (let x2 = x; x2 < x + w; x2 += P * 1) { const cb = box(P * 1, P * .3, P * .4, (Math.floor((x2 - x) / P) % 2) ? 0xd9341e : 0xf6f6f6); cb.position.set(x2 + P * .5, P * .15, y + h); root.add(cb); }
    if (o.t) { const t = textSprite(o.t, P * 1.4, "#3c4a68", "rgba(255,255,255,.9)"); t.position.set(x + w / 2, Hc + P * .3, y + h / 2); root.add(t); } }
  for (const o of M.carport || []) { const [x, y, w, h] = o.r, Hc = P * 3.4;
    const rf = box(w, P * .25, h, 0x6f7883, { metalness: .4 }); rf.position.set(x + w / 2, Hc, y + h / 2); rf.rotation.z = .04; root.add(rf);
    for (const px of [x + 3, x + w / 2, x + w - 3]) { const po = box(P * .3, Hc, P * .3, 0x3a3f46); po.position.set(px, Hc / 2, y + h - 4); root.add(po); }
    const RR = rand(55); for (let i = 0; i < 6; i++) moto(x + 6 + i * P * 1, y + 8, [0xd9341e, 0x1d2026, 0xf4f5f7][i % 3], P);
    car(x + w * .6, y + h * .6, Math.PI / 2, 0x1d2026, P);
    if (o.t) { const t = textSprite(o.t, P * 1.4, "#3c4a68", "rgba(255,255,255,.9)"); t.position.set(x + w / 2, Hc + P * .3, y + h / 2); root.add(t); } }
  MOVERS = [];
  for (const f of M.forklifts || []) { const g = forklift(f.x, f.y, f.r || 0, f.c, P); if (f.to) MOVERS.push({ g, ax: f.x, az: f.y, bx: f.to[0], bz: f.to[1], v: P * (f.v || 2.2), o: Math.random() * 2 }); }
  /* เส้นพื้น: เส้นเหลืองแบ่งโซน / ทางเดินเขียว (`lines` = [x1,y1,x2,y2,สี,หนา]) */
  for (const l of M.lines || []) { const [a, b, c, d, col = 0xf2c200, w = 1.6] = l, len = Math.hypot(c - a, d - b), m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshBasicMaterial({ color: col }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(d - b, c - a); m.position.set((a + c) / 2, .7, (b + d) / 2); root.add(m); }
  /* 9 ต.ค. ตามรูปจริง: Mezzanine เหล็กฟ้า · ห้องประชุม 2 ชั้นสีเขียวเทา · การ์ดเสาชั้นวางเหลืองดำ · ยางกั้นล้อ */
  for (const z of M.mezz || []) mezzanine(z, P);
  for (const b of M.bldg || []) meetingRoom(b, P);
  if (M.rackGuards) { const gs = [];
    for (const [bx, by, bw, bh, t] of M.boxes) if (t === "rack") for (const yy of [by, by + bh]) for (const xx of [bx, bx + bw]) gs.push([xx, yy]);
    const ym = new THREE.InstancedMesh(new THREE.BoxGeometry(P * .45, P * .9, P * .45), new THREE.MeshStandardMaterial({ color: 0xf5c400 }), gs.length), m4 = new THREE.Matrix4();
    gs.forEach(([x, z], i) => { m4.makeTranslation(x, P * .45, z); ym.setMatrixAt(i, m4); }); root.add(ym);
    const bk = new THREE.InstancedMesh(new THREE.BoxGeometry(P * .47, P * .18, P * .47), new THREE.MeshStandardMaterial({ color: 0x1b1d21 }), gs.length);
    gs.forEach(([x, z], i) => { m4.makeTranslation(x, P * .55, z); bk.setMatrixAt(i, m4); }); root.add(bk); }
  for (const w of M.stops || []) { const [x, y0, y1, step] = w; for (let y = y0; y < y1; y += step * P) { const m = box(P * .25, P * .12, P * 1.6, 0x1b1d21); m.position.set(x, P * .06, y); root.add(m); const s = box(P * .26, P * .13, P * .35, 0xf5c400); s.position.set(x, P * .065, y); root.add(s); } }
  /* 9 ต.ค. ตามรูปจริง: พัดลมยักษ์ (HVLS) Ø ~7.3 ม. แขวนใต้หลังคา ~12.5 ม. (เหนือชั้นวาง) · 6 ใบพัดเงิน · ก้านแขวน */
  for (const f of M.fans || []) { const g = new THREE.Group(), r = P * (f.d || 7.3) / 2, y = P * (f.h || 12.5), cm = { metalness: .6, roughness: .35 };
    const rod = box(P * .15, P * 1.6, P * .15, 0x9aa3ad, cm); rod.position.y = P * .8; g.add(rod);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(P * .45, P * .45, P * .5, 16), new THREE.MeshStandardMaterial({ color: 0x3a3f46, ...cm })); g.add(hub);
    for (let k = 0; k < 6; k++) { const bl = box(r, P * .06, P * .32, 0xc4cbd3, cm); bl.position.set(r / 2 + P * .3, 0, 0); const a = new THREE.Group(); a.rotation.y = k * Math.PI / 3 + (f.a || 0); a.add(bl); g.add(a); }
    g.position.set(f.x, y, f.y); root.add(g); }
  /* อุปกรณ์หน้า Flow Rack ด้านใน: ทางม้าลาย · รถลากพาเลทเหลือง · เครื่อง Pallet Magazine */
  for (const o of M.props || []) {
    if (o.k === "cross") { for (let i = 0; i < 4; i++) flat(o.x, o.y + i * o.h / 4, o.w, o.h / 8, 0xf4f4f4, .75); continue; }
    const g = new THREE.Group(), add = (w, h, d, col, px, py, pz) => { const m = box(w * P, h * P, d * P, col); m.position.set(px * P, py * P, pz * P); g.add(m); };
    if (o.k === "jack") { add(.18, .08, 1.15, 0xf2d000, -.28, .06, .55); add(.18, .08, 1.15, 0xf2d000, .28, .06, .55); add(.7, .35, .3, 0xf2d000, 0, .2, -.1); add(.06, 1.1, .06, 0x1b1d21, 0, .8, -.25); add(.5, .06, .06, 0x1b1d21, 0, 1.35, -.25); }
    if (o.k === "magazine") { add(2.2, 2.6, 1.8, 0x1f6fd0, 0, 1.3, 0); add(1.6, .12, 1.4, 0xf2c200, 0, 2.66, 0); add(1.2, 1.4, .3, 0xd9341e, -1.6, .7, .6);
      for (let k = 0; k < 8; k++) add(1.2, .13, 1.0, 0x1f4fa8, 0, .1 + k * .16, 1.6);
      const t = textSprite("Pallet Magazine", P * 1.1, "#1b1d21", "rgba(242,194,0,.95)"); t.position.set(0, P * 2.8, 0); g.add(t); }
    g.position.set(o.x, 0, o.y); g.rotation.y = o.r || 0; g.traverse(m => { if (m.isMesh) m.castShadow = true; }); root.add(g); }
  for (const g of M.gates || []) { const t = textSprite(g.t, P * 2.4, "#ffffff", "rgba(15,92,140,.92)"); t.position.set(g.x, 1, g.y); root.add(t); }
}
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
  root = new THREE.Group(); scene.add(root); cur = key; heat = null;
  const [x0, y0, x1, y1] = M.bounds, W = x1 - x0, D = y1 - y0, cx = (x0 + x1) / 2, cz = (y0 + y1) / 2, H = M.rackH;
  // พื้นรอบอาคาร + พื้นอาคาร
  ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, D * 3), new THREE.MeshStandardMaterial({ color: TH[THEME].ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -1, cz); ground.receiveShadow = true; root.add(ground);
  floor = new THREE.Mesh(new THREE.BoxGeometry(W, 4, D), new THREE.MeshStandardMaterial({ color: TH[THEME].floor, roughness: .9 }));
  floor.position.set(cx, -2, cz); floor.receiveShadow = true; root.add(floor);
  // โซนพื้น
  for (const z of M.zones || []) {
    const [zx, zy, zw, zh] = z.r, p = new THREE.Mesh(new THREE.PlaneGeometry(zw, zh), new THREE.MeshStandardMaterial({ color: z.c, roughness: 1 }));
    p.rotation.x = -Math.PI / 2; p.position.set(zx + zw / 2, .6, zy + zh / 2); p.receiveShadow = true; root.add(p);
    if (z.t) { const s = textSprite(z.t, Math.min(28, zh * .35) * (M.ts || 1) * (z.s || 1), M.zc || "#b58500"); s.position.set(zx + zw / 2, M.ts ? H * 1.02 : 1.2, zy + zh / 2); root.add(s); }
  }
  // ผนังโปร่ง + ขอบบน
  const wallH = H * 1.35, wallMat = { color: TH[THEME].wall, transparent: true, opacity: TH[THEME].wo, depthWrite: false };
  wallMats.length = 0; capMats.length = 0;
  /* 9 ต.ค. ผู้ใช้สั่ง: WH5/WH32 เอากรอบผนังฟ้าออก (`noWalls`) แล้วเพิ่มรายละเอียดรอบอาคารแทน (`site()`) */
  const walls = M.noWalls ? (M.walls || []) : [[x0, y0, x1, y0], [x1, y0, x1, y1], [x0, y1, x1, y1], [x0, y0, x0, y1], ...(M.walls || [])];
  if (M.noWalls) siteDetail(M, H);
  for (const [a, b, c, d] of walls) {
    const len = Math.hypot(c - a, d - b), th = 4 * (M.ts ? .4 : 1), wm = box(a === c ? th : len, wallH, a === c ? len : th, TH[THEME].wall, wallMat);
    wm.position.set((a + c) / 2, wallH / 2, (b + d) / 2); root.add(wm); wallMats.push(wm.material);
    const ct = M.ts ? 2 : 6, cap = box(a === c ? ct : len, M.ts ? 1.2 : 4, a === c ? len : ct, TH[THEME].cap); cap.position.set((a + c) / 2, wallH, (b + d) / 2); root.add(cap); capMats.push(cap.material);
  }
  for (const [ox, oy, ow, oh, t] of M.offices || []) {
    const o = box(ow, H * .45, oh, 0xdbe6f1); o.position.set(ox + ow / 2, H * .225, oy + oh / 2); root.add(o);
    const s = textSprite(t, 22); s.position.set(ox + ow / 2, H * .45 + 1, oy + oh / 2); root.add(s);
  }
  // ชั้นวาง: เสา (กรมท่า) · คาน (ส้ม) · พาเลท + กล่องสินค้า
  const ups = [], beams = [], pals = [], goods = [], solid = [], yel = [], blk = [], blu = [], roll = [];
  const R = rand(key.length * 7919 + M.boxes.length);
  const bay = M.pxm * 2.8, lv = 4;
  for (const [bx, by, bw, bh, t] of M.boxes) {
    if (t === "flowrack") { /* 9 ต.ค. ตามรูปจริง: Flow Rack ทะลุผนัง Dock (เติมพาเลทจากฝั่ง Dock → ไหลมาออกด้านใน) · 1 ชุด = 2 ช่องทาง
         ชั้นล่าง = รางลูกกลิ้งเอียงมีพาเลทสินค้า · ชั้นบน (คานส้ม ~3.3 ม.) = กองพาเลทเปล่าสีน้ำเงิน · เสาฟ้าสูง ~6 ม. · การ์ดเหลืองปลายเสา · แผ่นเหล็กดำหน้าทางออก */
      const P = M.pxm, along = bh >= bw, L = along ? bh : bw, Wd = along ? bw : bh, top = P * 6, deck = P * 3.3;
      const Pt = (u, v) => along ? [bx + v, by + u] : [bx + u, by + v], bx3 = (u, v, y, du, h, dv) => { const [px, pz] = Pt(u, v); return along ? [px, y, pz, dv, h, du] : [px, y, pz, du, h, dv]; };
      const nf = Math.max(2, Math.round(L / (P * 3))) ;
      for (let i = 0; i <= nf; i++) for (const v of [.5, Wd / 2, Wd - .5]) { const u = i * L / nf; ups.push(bx3(u, v, top / 2, 1.1, top, 1.1)); if (i === 0) yel.push(bx3(u - .3, v, P * .5, 1.5, P * 1, 1.5)); }
      for (const v of [.5, Wd / 2, Wd - .5]) for (const y of [deck, top - 1]) beams.push(bx3(L / 2, v, y, L, 1.3, 1.1));
      for (let i = 0; i <= nf; i++) { const u = i * L / nf; beams.push(bx3(u, Wd / 2, deck, 1.1, 1.3, Wd)); }
      for (let i = 0; i < nf; i++) for (const k of [.3, .7]) ups.push(bx3((i + .5) * L / nf, Wd / 2, top * k, L / nf * 1.15, .5, .5));   // ค้ำทแยง (ประมาณ)
      const lane = Wd / 2, n = Math.max(2, Math.floor(L / (P * 1.35)));
      for (const lv of [0, 1]) { const vc = lane * (lv + .5);
        roll.push(bx3(L / 2, vc, P * .35, L, .6, lane * .85));                                                       // รางลูกกลิ้ง
        blk.push(bx3(-P * 1.2, vc, .25, P * 2.4, .5, lane * .9));                                                    // แผ่นเหล็กดำหน้าทางออก
        for (let i = 0; i < n; i++) { if (R() < .3) continue; const u = (i + .5) * L / n, y = P * .45 + P * .15 * u / L;
          pals.push(bx3(u, vc, y + P * .07, P * 1.15, P * .14, lane * .8)); const gh = P * (1 + R() * .35); goods.push(bx3(u, vc, y + P * .14 + gh / 2, P * 1.1, gh, lane * .76)); }
        for (let i = 0; i < n; i++) { if (R() < .35) continue; const u = (i + .5) * L / n, k = 3 + Math.floor(R() * 6);   // กองพาเลทเปล่าบนชั้นบน
          blu.push(bx3(u, vc, deck + .7 + k * P * .075, P * 1.15, k * P * .15, lane * .8)); } }
      continue;
    }
    if (t === "pyramid") { // 9 ต.ค. ผู้ใช้ขอ: กองพาเลทบนพื้นแบบพีระมิด (กลางกองสูงสุด ขอบเตี้ย) · แบ่งกองละ 6×6 ช่อง มีทางเดินคั่น
      const P = M.pxm, cw = P * 1.15, ch = P * 1.35, gap = P * 2.2, blk = 6;
      const nx = Math.floor((bw + gap) / (cw * blk + gap)) || 1, nz = Math.floor((bh + gap) / (ch * blk + gap)) || 1;
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) for (let i = 0; i < blk; i++) for (let j = 0; j < blk; j++) {
        const lv = Math.min(4, 1 + Math.min(i, blk - 1 - i, j, blk - 1 - j)), px = bx + a * (cw * blk + gap) + (i + .5) * cw, pz = by + b * (ch * blk + gap) + (j + .5) * ch;
        for (let k = 0; k < lv; k++) { const y = k * P * 1.35; pals.push([px, y + P * .07, pz, cw * .9, P * .14, ch * .9]); goods.push([px, y + P * .14 + P * .6, pz, cw * .86, P * 1.2, ch * .86]); }
      }
      continue;
    }
    if (t === "pallet") { // พื้นที่วางพาเลทบนพื้น
      const n = Math.max(1, Math.floor(bw / (M.pxm * 1.3))), m = Math.max(1, Math.floor(bh / (M.pxm * 1.3)));
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { if (R() < .25) continue;
        const px = bx + (i + .5) * bw / n, pz = by + (j + .5) * bh / m, hh = H * (.12 + R() * .14);
        goods.push([px, hh / 2, pz, bw / n * .82, hh, bh / m * .82]); }
      continue;
    }
    if (t === "shelf" || t === "flow" || t === "desk" || t === "fix") { solid.push([bx, by, bw, bh, t]); continue; }
    if (M.rack) { rackSpec(bx, by, bw, bh); continue; }
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
  /* 9 ต.ค. ชั้นวางตามแบบ Typical Rack (ผู้ใช้ส่ง): สูง 11.3 ม. · คาน 7 ชั้น (1.545 … 10.095 ม.) + วางพื้น = 8 ชั้น
     ช่องละ 2.7 ม. วาง 2 พาเลท (1.0×1.2×1.2 ม.) · ชั้นวางหลังชนหลัง ลึก 0.9+0.3+0.9 ม. → แต่ละฝั่งวางพาเลทลึก 1 ตัว */
  function rackSpec(bx, by, bw, bh) {
    const S = M.rack, P = M.pxm, along = bh >= bw, L = along ? bh : bw, WdAll = along ? bw : bh;
    const nb = Math.max(1, Math.round(L / (P * S.bay))), step = L / nb, top = P * S.h;
    const unit = P * (S.depth || 2.1), nr = Math.max(1, Math.round(WdAll / (unit * 1.25))), pitch = WdAll / nr, Wd = Math.min(unit, pitch * .9);
    const side = P * (S.side || .9), lv = [0, ...S.beams].map(v => v * P);
    for (let r = 0; r < nr; r++) {
      const off = r * pitch + (pitch - Wd) / 2, Pt = (u, v) => along ? [bx + off + v, by + u] : [bx + u, by + off + v];
      for (let i = 0; i <= nb; i++) for (const v of [.6, side, Wd - side, Wd - .6]) { const [px, pz] = Pt(i * step, v); ups.push([px, top / 2, pz, 1.6, top, 1.6]); }
      for (const y of lv.slice(1)) for (const v of [.6, side, Wd - side, Wd - .6]) { const [px, pz] = Pt(L / 2, v); beams.push(along ? [px, y - 1, pz, 1.4, 2, L] : [px, y - 1, pz, L, 2, 1.4]); }
      for (let i = 0; i < nb; i++) for (let k = 0; k < lv.length; k++) for (const v of [side / 2, Wd - side / 2]) for (let q = 0; q < S.per; q++) {
        if (R() < .2) continue;
        const u = i * step + step * (q + .5) / S.per, [px, pz] = Pt(u, v), y = lv[k] + (k ? 0 : .2), gh = P * 1.2 * (.55 + R() * .4);
        const pw = Math.min(P * 1.0, step / S.per * .86), pd = Math.min(P * 1.2, side * .95);
        const [w1, d1] = along ? [pd, pw] : [pw, pd];
        pals.push([px, y + .8, pz, w1, 1.6, d1]); goods.push([px, y + 1.6 + gh / 2, pz, w1 * .94, gh, d1 * .94]);
      }
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
  inst(yel, 0xf5c400); inst(blk, 0x1b1d21); inst(blu, 0x1f4fa8); inst(roll, 0x8d98a5, { metal: .5 });
  for (const [bx, by, bw, bh, t] of solid) { // ชั้นวางสีฟ้า (shelf) / Flow rack สีเหลือง
    if (t === "desk" || t === "fix") { // สำนักงาน: โต๊ะ (ไม้) · สุขภัณฑ์/อุปกรณ์ (ขาว)
      const h = M.pxm * (t === "desk" ? .75 : .85), o = box(bw, h, bh, t === "desk" ? 0xd9b98c : 0xf4f7fb, { roughness: .7 }); o.position.set(bx + bw / 2, h / 2, by + bh / 2); root.add(o); continue; }
    const s = box(bw * .9, H * .8, bh, t === "flow" ? COL.flow : COL.shelf, { roughness: .6 }); s.position.set(bx + bw / 2, H * .4, by + bh / 2); root.add(s);
  }
  for (const l of M.labels || []) { const s = textSprite(l.t, 50 * (M.ls || 1), "#0f5c8c", "rgba(255,255,255,.85)"); s.position.set(l.x, 1.5, l.y); root.add(s); }
  // แสง + กล้อง
  const sun = scene.userData.sun, span = Math.max(W, D);
  sun.position.set(cx - span * .35, span * .9, cz + span * .55); sun.target.position.set(cx, 0, cz);
  Object.assign(sun.shadow.camera, { left: -span * .7, right: span * .7, top: span * .7, bottom: -span * .7, near: 10, far: span * 3 }); sun.shadow.camera.updateProjectionMatrix();
  scene.fog.near = span * 1.6; scene.fog.far = span * 4;
  view(VMODE); /* 9 ต.ค. ผู้ใช้สั่ง: ค่าเริ่ม = มุมบน (เปลี่ยนแผนที่แล้วใช้มุมเดิมที่เลือก) */
  needs = true;
}
let VMODE = "front"; // 9 ต.ค. ผู้ใช้สั่ง: ค่าเริ่ม = มุมหน้า
function view(mode) {
  VMODE = mode || VMODE;
  const M = MAPS[cur]; if (!M) return;
  const [x0, y0, x1, y1] = M.view || M.bounds, W = x1 - x0, D = y1 - y0, cx = (x0 + x1) / 2, cz = (y0 + y1) / 2;
  // ระยะกล้องให้เห็นทั้งคลังพอดีจอ (คิดทั้งกว้างและลึก ตามสัดส่วนจอ)
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  /* มุมหน้า (front) = มองจากฝั่ง Dock ระดับต่ำ */
  const top = VMODE === "top", front = VMODE === "front", dist = Math.max((W / 2) / Math.tan(hf) * (top ? 1 : 1.5), (D / 2) / Math.tan(vf) * (top ? 1 : 1.35)) * (top ? 1.22 : front ? .82 : .98);
  const dir = top ? new THREE.Vector3(0, 1, .001) : front ? new THREE.Vector3(0, .4, .92).normalize() : camera.aspect < 1 ? new THREE.Vector3(-.03, .86, .5).normalize() : new THREE.Vector3(-.04, .62, .78).normalize();
  controls.target.set(cx, 0, cz + (top ? 0 : D * .04));
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.maxDistance = dist * 2.2; controls.minDistance = Math.max(W, D) * .06;
  /* จำกัดหมุนรอบ ±40° จากมุมเริ่ม (มุมบน = ไม่จำกัด เพราะมองตรงลง) */
  const az = Math.atan2(dir.x, dir.z); controls.minAzimuthAngle = top ? -Infinity : az - .7; controls.maxAzimuthAngle = top ? Infinity : az + .7;
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
  placePins(); needs = true;
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


/* ---------- Heatmap อุณหภูมิบนพื้น (IDW · จางลงเมื่อไกลเซนเซอร์ · ไม่เดาข้ามจุดที่ไม่มีเซนเซอร์) ---------- */
let heat = null;
const RAMP = [[0, [43, 108, 176]], [.35, [20, 184, 166]], [.65, [250, 204, 21]], [1, [220, 38, 38]]];
function rampAt(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) {
    const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], u = (t - a) / (b - a);
    return ca.map((c, j) => Math.round(c + (cb[j] - c) * u));
  }
  return RAMP[RAMP.length - 1][1];
}
function setHeat(points, lo, hi) {
  if (heat) { root?.remove(heat); heat.geometry.dispose(); heat.material.map.dispose(); heat.material.dispose(); heat = null; }
  const M = MAPS[cur]; if (!M || !root || !points || points.length < 1) { needs = true; return; }
  const [x0, y0, x1, y1] = M.bounds, W = x1 - x0, D = y1 - y0, sc = Math.max(W, D) / 420;
  const cw = Math.round(W / sc), ch = Math.round(D / sc), c = document.createElement("canvas"); c.width = cw; c.height = ch;
  const x = c.getContext("2d"), img = x.createImageData(cw, ch), reach = M.pxm * 45;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const px = x0 + (i + .5) * sc, py = y0 + (j + .5) * sc; let ws = 0, vs = 0, dmin = 1e9;
    for (const p of points) { const d2 = (p.x - px) ** 2 + (p.z - py) ** 2 + 1; const w = 1 / d2; ws += w; vs += w * p.v; dmin = Math.min(dmin, Math.sqrt(d2)); }
    const [r, g, b] = rampAt((vs / ws - lo) / ((hi - lo) || 1)), a = Math.max(0, 1 - dmin / reach) ** .8 * 150, o = (j * cw + i) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  heat = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  // ชั้นสีลอยเหนือชั้นวาง มองเห็นจากด้านบน
  heat.rotation.x = -Math.PI / 2; heat.position.set((x0 + x1) / 2, M.rackH + 3, (y0 + y1) / 2); heat.renderOrder = 1; root.add(heat); needs = true;
}
function flyTo(px, py) {
  const M = MAPS[cur]; if (!M) return;
  const dir = camera.position.clone().sub(controls.target).normalize(), dist = Math.max(M.bounds[2] - M.bounds[0], M.bounds[3] - M.bounds[1]) * .32;
  const a1 = new THREE.Vector3(px, 0, py);
  fly = { t0: performance.now(), a0: controls.target.clone(), a1, c0: camera.position.clone(), c1: a1.clone().addScaledVector(dir, dist) };
}

window.IOT3D = {
  maps: MAPS,
  ok: true,
  show(key) { if (!renderer) init(); resize(); if (key !== cur) build(key); },
  current: () => cur,
  view,
  setPins,
  setHeat, flyTo, ramp: rampAt,
  theme(t) {
    THEME = TH[t] ? t : "light"; const T = TH[THEME];
    if (!scene) return;
    scene.background.setHex(T.bg); scene.fog.color.setHex(T.bg);
    ground?.material.color.setHex(T.ground); floor?.material.color.setHex(T.floor);
    wallMats.forEach(m => { m.color.setHex(T.wall); m.opacity = T.wo; }); capMats.forEach(m => m.color.setHex(T.cap)); needs = true;
  },
  spin(on) { controls.autoRotate = !!on; controls.autoRotateSpeed = .8; needs = true; return controls.autoRotate; },
  place(id) { placing = id; el.classList.toggle("placing", !!id); },
  onPlace: null
};
window.dispatchEvent(new Event("iot3d-ready"));
