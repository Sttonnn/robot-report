// ตรวจการเชื่อม Tuya Cloud API (IOT Dashboard) — ใช้ secrets TUYA_ACCESS_ID / TUYA_ACCESS_SECRET / TUYA_REGION
// ไม่พิมพ์ค่า secret · พิมพ์แค่ผลการเชื่อม + รายชื่ออุปกรณ์ (ชื่อ ประเภท ออนไลน์ รหัสค่าที่อ่านได้)
import crypto from "node:crypto";

const ID = process.env.TUYA_ACCESS_ID || "", SECRET = process.env.TUYA_ACCESS_SECRET || "";
const REGION = (process.env.TUYA_REGION || "sg").trim().toLowerCase();
const HOSTS = { sg: "https://openapi-sg.iotbing.com", us: "https://openapi.tuyaus.com", ueaz: "https://openapi-ueaz.tuyaus.com",
  eu: "https://openapi.tuyaeu.com", weaz: "https://openapi-weaz.tuyaeu.com", in: "https://openapi.tuyain.com", cn: "https://openapi.tuyacn.com" };
const HOST = HOSTS[REGION];

const out = [];
const log = (s) => { console.log(s); out.push(s); };
const fail = (s) => { log("❌ " + s); finish(1); };
function finish(code) {
  import("node:fs").then(fs => { if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join("\n") + "\n"); process.exit(code); });
}

log("## ตรวจการเชื่อม Tuya");
log(`- TUYA_ACCESS_ID: ${ID ? "มี (" + ID.length + " ตัวอักษร)" : "ไม่มี"}`);
log(`- TUYA_ACCESS_SECRET: ${SECRET ? "มี (" + SECRET.length + " ตัวอักษร)" : "ไม่มี"}`);
log(`- TUYA_REGION: ${process.env.TUYA_REGION ? REGION : "ไม่มี (ใช้ sg)"} → ${HOST || "ไม่รู้จัก"}`);

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
async function call(method, path, token = "", body = "") {
  const t = Date.now().toString(), nonce = crypto.randomUUID();
  const [p, q] = path.split("?");
  const url = q ? p + "?" + q.split("&").sort().join("&") : p;
  const sts = [method, sha256(body), "", url].join("\n");
  const sign = crypto.createHmac("sha256", SECRET).update(ID + token + t + nonce + sts).digest("hex").toUpperCase();
  const h = { client_id: ID, sign, t, nonce, sign_method: "HMAC-SHA256" };
  if (token) h.access_token = token;
  if (body) h["Content-Type"] = "application/json";
  const r = await fetch(HOST + path, { method, headers: h, body: body || undefined });
  return r.json();
}

async function main() {
  const tk = await call("GET", "/v1.0/token?grant_type=1");
  if (!tk.success) return fail(`ขอ token ไม่ผ่าน: code ${tk.code} · ${tk.msg}`);
  log("✅ ขอ token สำเร็จ (Access ID / Secret ถูกต้อง)");
  const token = tk.result.access_token;

  // อุปกรณ์จากบัญชีแอปที่ Link ไว้
  let devs = [], last = "", ok = false;
  for (let i = 0; i < 20; i++) {
    const r = await call("GET", `/v1.0/iot-01/associated-users/devices?size=50${last ? "&last_row_key=" + last : ""}`, token);
    if (!r.success) { log(`⚠️ associated-users/devices: code ${r.code} · ${r.msg}`); break; }
    ok = true; devs = devs.concat(r.result.devices || []);
    if (!r.result.has_more) break; last = r.result.last_row_key;
  }
  if (!ok) {
    const r = await call("GET", "/v2.0/cloud/thing/device?page_size=20", token);
    if (!r.success) return fail(`ดึงรายชื่ออุปกรณ์ไม่ได้: code ${r.code} · ${r.msg}`);
    devs = r.result || [];
  }
  log(`✅ พบอุปกรณ์ ${devs.length} เครื่อง · ออนไลน์ ${devs.filter(d => d.online || d.isOnline).length}`);
  log("");
  log("| # | ชื่อ | ประเภท | สินค้า | ออนไลน์ | ค่าที่อ่านได้ |");
  log("|---|---|---|---|---|---|");
  devs.forEach((d, i) => {
    const st = (d.status || []).map(s => `${s.code}=${typeof s.value === "object" ? JSON.stringify(s.value) : s.value}`).join(", ");
    log(`| ${i + 1} | ${d.name || "-"} | ${d.category || "-"} | ${d.product_name || d.productName || "-"} | ${d.online || d.isOnline ? "✓" : "✕"} | ${st.slice(0, 300).replace(/\|/g, "/")} |`);
  });
  finish(0);
}

if (!ID || !SECRET) fail("secret ไม่ครบ");
else if (!HOST) fail("TUYA_REGION ไม่ถูกต้อง (ควรเป็น sg)");
else main().catch(e => fail("ผิดพลาด: " + e.message));
