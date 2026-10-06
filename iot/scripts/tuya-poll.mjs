// IOT Dashboard · ดึงค่าจาก Tuya Cloud แล้วบันทึก Supabase (iot_devices + iot_readings)
// secrets: TUYA_ACCESS_ID / TUYA_ACCESS_SECRET / TUYA_REGION / SUPABASE_SERVICE_ROLE
import crypto from "node:crypto";
import fs from "node:fs";

const ID = process.env.TUYA_ACCESS_ID || "", SECRET = process.env.TUYA_ACCESS_SECRET || "";
const REGION = (process.env.TUYA_REGION || "sg").trim().toLowerCase();
const HOSTS = { sg: "https://openapi-sg.iotbing.com", us: "https://openapi.tuyaus.com", ueaz: "https://openapi-ueaz.tuyaus.com",
  eu: "https://openapi.tuyaeu.com", weaz: "https://openapi-weaz.tuyaeu.com", in: "https://openapi.tuyain.com", cn: "https://openapi.tuyacn.com" };
const HOST = HOSTS[REGION];
const SB = process.env.SUPABASE_URL || "https://mgnshovnibcmiptoxdfe.supabase.co";
const SR = process.env.SUPABASE_SERVICE_ROLE || "";
const DRY = process.argv.includes("--dry");

const out = [];
const log = (s) => { console.log(s); out.push(s); };
function finish(code) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n");
  process.exit(code);
}
const fail = (s) => { log("❌ " + s); finish(1); };

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
async function tuya(method, path, token = "") {
  const t = Date.now().toString(), nonce = crypto.randomUUID();
  const [p, q] = path.split("?");
  const url = q ? p + "?" + q.split("&").sort().join("&") : p;
  const sts = [method, sha256(""), "", url].join("\n");
  const sign = crypto.createHmac("sha256", SECRET).update(ID + token + t + nonce + sts).digest("hex").toUpperCase();
  const h = { client_id: ID, sign, t, nonce, sign_method: "HMAC-SHA256" };
  if (token) h.access_token = token;
  const r = await fetch(HOST + path, { method, headers: h });
  return r.json();
}
async function sb(path, rows, prefer) {
  const r = await fetch(SB + "/rest/v1/" + path, { method: "POST",
    headers: { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json", Prefer: prefer },
    body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`Supabase ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

// คลังจากชื่ออุปกรณ์ (WH5-xxx → WH5) · SKYLIGHT / ชื่ออื่น = ไม่ระบุ
const siteOf = (n) => { const m = String(n || "").match(/^\s*(WH\s*\d+)/i); return m ? m[1].toUpperCase().replace(/\s+/g, "") : null; };

// ถอดค่า phase_a (base64) ของตัวป้องกันไฟ: แรงดัน 2 ไบต์ (/10 V) · กระแส 3 ไบต์ (/1000 A) · กำลัง 3 ไบต์ (/1000 kW)
function phaseA(b64) {
  try { const b = Buffer.from(b64, "base64"); if (b.length < 8) return null;
    return { v: ((b[0] << 8) | b[1]) / 10, a: ((b[2] << 16) | (b[3] << 8) | b[4]) / 1000, w: ((b[5] << 16) | (b[6] << 8) | b[7]) }; }
  catch { return null; }
}

async function main() {
  log("## IOT · ดึงข้อมูล Tuya → Supabase");
  if (!ID || !SECRET) return fail("ไม่มี TUYA_ACCESS_ID / TUYA_ACCESS_SECRET");
  if (!HOST) return fail("TUYA_REGION ไม่ถูกต้อง");
  const tk = await tuya("GET", "/v1.0/token?grant_type=1");
  if (!tk.success) return fail(`ขอ token ไม่ผ่าน: ${tk.code} ${tk.msg}`);
  const token = tk.result.access_token;

  let devs = [], last = "";
  for (let i = 0; i < 20; i++) {
    const r = await tuya("GET", `/v1.0/iot-01/associated-users/devices?size=50${last ? "&last_row_key=" + last : ""}`, token);
    if (!r.success) return fail(`ดึงรายชื่ออุปกรณ์ไม่ได้: ${r.code} ${r.msg}`);
    devs = devs.concat(r.result.devices || []);
    if (!r.result.has_more) break; last = r.result.last_row_key;
  }

  // scale / unit ของแต่ละค่า (ดึงครั้งละ 1 ต่อรุ่นสินค้า)
  const specs = {};
  for (const d of devs) {
    const pid = d.product_id || d.id; if (specs[pid]) continue;
    const r = await tuya("GET", `/v1.0/iot-03/devices/${d.id}/specification`, token);
    const m = {};
    if (r.success) for (const s of (r.result.status || [])) { try { m[s.code] = JSON.parse(s.values || "{}"); } catch { m[s.code] = {}; } }
    specs[pid] = m;
  }

  const ts = new Date(); ts.setSeconds(0, 0);
  const devRows = [], readRows = [];
  for (const d of devs) {
    const sp = specs[d.product_id || d.id] || {};
    const raw = {}, val = {};
    for (const s of (d.status || [])) {
      raw[s.code] = s.value;
      const sc = sp[s.code] && Number.isFinite(sp[s.code].scale) ? sp[s.code].scale : null;
      val[s.code] = typeof s.value === "number" && sc != null ? s.value / Math.pow(10, sc) : s.value;
      if (typeof s.value === "number" && sp[s.code] && sp[s.code].unit === "mA") val[s.code] = val[s.code] / 1000;
    }
    const num = (...k) => { for (const c of k) if (typeof val[c] === "number") return val[c]; return null; };
    const bool = (...k) => { for (const c of k) if (typeof val[c] === "boolean") return val[c]; return null; };
    let temp = num("temp_current", "va_temperature"), hum = num("humidity_value", "va_humidity");
    // เผื่อไม่มี spec: ค่าอุณหภูมิ > 100 = หน่วย 0.1 °C
    if (temp != null && !(sp.temp_current || sp.va_temperature)?.scale && temp > 100) temp = temp / 10;
    let w = num("cur_power"), v = num("cur_voltage"), a = num("cur_current"), kwh = num("add_ele", "forward_energy_total");
    if (raw.phase_a && w == null) { const p = phaseA(raw.phase_a); if (p) { v = p.v; a = p.a; w = p.w; } }
    const on = bool("switch_1", "switch");
    devRows.push({ id: d.id, name: d.name, category: d.category, product: d.product_name || null,
      site: siteOf(d.name), online: !!d.online, status: raw, updated_at: ts.toISOString() });
    const hasVal = [temp, hum, w, v, a, kwh, on].some(x => x != null);
    if (hasVal || d.category === "infrared_ac")
      readRows.push({ device_id: d.id, ts: ts.toISOString(), online: !!d.online, temp_c: temp, humidity: hum,
        power_w: w, voltage_v: v, current_a: a, energy_kwh: kwh, switch_on: on });
  }

  log(`- อุปกรณ์ ${devs.length} เครื่อง · ออนไลน์ ${devRows.filter(r => r.online).length} · บันทึกค่า ${readRows.length} แถว · เวลา ${ts.toISOString()}`);
  log("");
  log("| ชื่อ | คลัง | ออนไลน์ | °C | % | W | V | A | kWh | เปิด |");
  log("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of readRows) { const d = devRows.find(x => x.id === r.device_id); const f = (x) => x == null ? "" : x;
    log(`| ${d.name} | ${d.site || "-"} | ${r.online ? "✓" : "✕"} | ${f(r.temp_c)} | ${f(r.humidity)} | ${f(r.power_w)} | ${f(r.voltage_v)} | ${f(r.current_a)} | ${f(r.energy_kwh)} | ${r.switch_on == null ? "" : r.switch_on ? "เปิด" : "ปิด"} |`); }
  if (DRY) return finish(0);
  if (!SR) return fail("ไม่มี secret SUPABASE_SERVICE_ROLE (ใส่ใน Settings → Secrets → Actions ของ robot-report) · ดึงจาก Tuya ได้แล้ว แต่ยังบันทึกไม่ได้");
  await sb("iot_devices?on_conflict=id", devRows, "resolution=merge-duplicates,return=minimal");
  await sb("iot_readings?on_conflict=device_id,ts", readRows, "resolution=ignore-duplicates,return=minimal");
  log("✅ บันทึก Supabase สำเร็จ");
  finish(0);
}
main().catch(e => {
  const m = String(e.message);
  if (/iot_devices|iot_readings/.test(m) && /404|PGRST205|does not exist/.test(m)) fail("ยังไม่มีตาราง → รัน iot/tools/iot.sql ใน Supabase ก่อน · " + m);
  else if (/401|403|JWT|Invalid API key/i.test(m)) fail("SUPABASE_SERVICE_ROLE ไม่ถูกต้อง · " + m);
  else fail("ผิดพลาด: " + m);
});
