// แผนที่คลัง 3D ของ IOT Dashboard (6 ต.ค. 2569 · ผู้ใช้ขอ: แผนที่คลัง 3D + Pin ตำแหน่งเซนเซอร์ · ด้านล่างเป็นรายละเอียด)
// ใช้ three.js · ผังจาก window.IOT_MAPS (maps.js) · หมุดเป็น HTML ลอยบนจอ (ตัวหนังสือคม) · ตำแหน่งหมุดเก็บใน iot_device_meta (map, px, py)
// เรียกใช้จากหน้าเว็บผ่าน window.IOT3D.render() หลังข้อมูลโหลด
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MAPS = window.IOT_MAPS || {};
const el = document.getElementById("map3d");
const pinLayer = document.getElementById("pins");
const COL = { navy: 0x1f4e79, beam: 0xf28c28, wood: 0xb98a55, box: [0xd8c19a, 0xcfae7c, 0xe3d2b0, 0xbfa070], shelf: 0x16a3c9, flow: 0xe8b80c, floor: 0xf6f9fc, slab: 0xffffff };

let renderer, scene, camera, controls, root, floor, ground, cur = null, raf = 0, placing = null, needs = true, THEME = "light";
const TH = { light: { bg: 0xe9f0f7, ground: 0xdfe7ef, floor: 0xf6f9fc, wall: 0x7fb3d5, cap: 0x0f5c8c, wo: .14 }, dark: { bg: 0x0a1320, ground: 0x0e1b2b, floor: 0x16283d, wall: 0x38bdf8, cap: 0x38bdf8, wo: .1 } };
const wallMats = [], capMats = [];
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), tmp = new THREE.Vector3();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  controls.addEventListener("change", () => { needs = true; const B = (MAPS[cur] || {}).bounds; if (!B) return;
    const t = controls.target, cx = Math.min(Math.max(t.x, B[0]), B[2]), cz = Math.min(Math.max(t.z, B[1]), B[3]);
    if (cx !== t.x || cz !== t.z) { const dx = cx - t.x, dz = cz - t.z; t.x = cx; t.z = cz; camera.position.x += dx; camera.position.z += dz; } });
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
let fly = null;
function loop() {
  raf = requestAnimationFrame(loop);
  if (fly) { // เลื่อนกล้องไปยังเซนเซอร์แบบนุ่มๆ
    const k = Math.min(1, (performance.now() - fly.t0) / 650), e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(fly.a0, fly.a1, e); camera.position.lerpVectors(fly.c0, fly.c1, e); needs = true;
    if (k >= 1) fly = null;
  }
  if (controls.update() || needs || controls.autoRotate) { renderer.render(scene, camera); placePins(); needs = false; }
}

/* ---------- สร้างคลัง ---------- */
const box = (w, h, d, c, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: .05, ...o })); m.castShadow = m.receiveShadow = !o.transparent; return m; };
function rand(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }
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
    if (d.truck ?? R() < .45) {                                                                                                   // รถเทรลเลอร์
      const L = P * 12, Wt = P * 2.5, Ht = P * 3.9, g = new THREE.Group(), col = [0xf3f5f8, 0x2f6fb5, 0xd9541e][Math.floor(R() * 3)];
      const tr = box(Wt, Ht, L, col); tr.position.set(0, Ht / 2 + P * 1.1, L / 2 + P * .7); g.add(tr);
      const ch = box(Wt * .9, P * .5, L * .9, 0x3a3f46); ch.position.set(0, P * .8, L / 2 + P * .7); g.add(ch);
      const cab = box(Wt, P * 3, P * 2.6, 0xe9edf2); cab.position.set(0, P * 1.9, L + P * 2.3); g.add(cab);
      const ws = box(Wt * .92, P * 1, P * .1, 0x1d2a3a); ws.position.set(0, P * 2.6, L + P * 3.62); g.add(ws);
      for (const z of [L * .2, L * .3, L + P * 1.6, L + P * 3.1]) for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(P * .5, P * .5, P * .35, 14), new THREE.MeshStandardMaterial({ color: 0x1b1d21 })); w.rotation.z = Math.PI / 2; w.position.set(sx * Wt * .45, P * .5, z); g.add(w); }
      g.position.set(x, 0, y + P * .3); g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); root.add(g);
    }
  }
  for (const c of M.canopies || []) { const m = box(c[2], P * .4, c[3], 0xc8d2dc, { transparent: true, opacity: .55 }); m.position.set(c[0] + c[2] / 2, P * 6.5, c[1] + c[3] / 2); root.add(m);
    for (const [px, pz] of [[c[0] + 4, c[1] + c[3] - 4], [c[0] + c[2] - 4, c[1] + c[3] - 4]]) { const po = box(P * .4, P * 6.5, P * .4, 0x7d8896); po.position.set(px, P * 3.25, pz); root.add(po); }
    if (c[4]) { const t = textSprite(c[4], P * 1.8, "#3c4a68"); t.position.set(c[0] + c[2] / 2, P * 6.8, c[1] + c[3] / 2); root.add(t); } }
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
    if (z.t) { const s = textSprite(z.t, Math.min(28, zh * .35) * (M.ts || 1), M.zc || "#b58500"); s.position.set(zx + zw / 2, M.ts ? H * 1.02 : 1.2, zy + zh / 2); root.add(s); }
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
  view("3d");
  needs = true;
}
function view(mode) {
  const M = MAPS[cur]; if (!M) return;
  const [x0, y0, x1, y1] = M.view || M.bounds, W = x1 - x0, D = y1 - y0, cx = (x0 + x1) / 2, cz = (y0 + y1) / 2;
  // ระยะกล้องให้เห็นทั้งคลังพอดีจอ (คิดทั้งกว้างและลึก ตามสัดส่วนจอ)
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  const top = mode === "top", dist = Math.max((W / 2) / Math.tan(hf) * (top ? 1 : 1.5), (D / 2) / Math.tan(vf) * (top ? 1 : 1.35)) * (top ? 1.08 : .98);
  const dir = top ? new THREE.Vector3(0, 1, .001) : camera.aspect < 1 ? new THREE.Vector3(-.03, .86, .5).normalize() : new THREE.Vector3(-.04, .62, .78).normalize();
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
