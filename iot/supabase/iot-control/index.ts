// Supabase Edge Function: iot-control · สั่งเปิด/ปิดอุปกรณ์ Tuya จากหน้า IOT Dashboard
// วางโค้ดนี้ใน Supabase → Edge Functions → Deploy a new function → Via Editor · ชื่อ iot-control
// Secrets (Edge Functions → Secrets): TUYA_ACCESS_ID, TUYA_ACCESS_SECRET, TUYA_REGION (sg), IOT_CONTROL_PIN
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY มีให้อัตโนมัติใน Edge Function
//
// POST { device_id, on: true|false, pin }  →  { ok, msg }
// POST { check: true, pin }                →  { ok }  (ตรวจรหัสอย่างเดียว)

const ID = Deno.env.get("TUYA_ACCESS_ID") ?? "";
const SECRET = Deno.env.get("TUYA_ACCESS_SECRET") ?? "";
const REGION = (Deno.env.get("TUYA_REGION") ?? "sg").trim().toLowerCase();
const PIN = (Deno.env.get("IOT_CONTROL_PIN") ?? "").trim();
const SB = Deno.env.get("SUPABASE_URL") ?? "";
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HOSTS: Record<string, string> = { sg: "https://openapi-sg.iotbing.com", us: "https://openapi.tuyaus.com",
  eu: "https://openapi.tuyaeu.com", in: "https://openapi.tuyain.com", cn: "https://openapi.tuyacn.com" };
const HOST = HOSTS[REGION];

// สั่งได้เฉพาะสวิตช์ / ตั้งเวลา / แอร์อินฟราเรด (ไม่รวมมิเตอร์ไฟเครื่องจักร dlq — ผู้ใช้เลือก 6 ต.ค.)
const ALLOW = new Set(["kg", "znjdq", "infrared_ac"]);

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(s: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(s))).toUpperCase();
}
async function tuya(method: string, path: string, token = "", body = "") {
  const t = Date.now().toString(), nonce = crypto.randomUUID();
  const [p, q] = path.split("?");
  const url = q ? p + "?" + q.split("&").sort().join("&") : p;
  const sts = [method, await sha256(body), "", url].join("\n");
  const h: Record<string, string> = { client_id: ID, t, nonce, sign_method: "HMAC-SHA256", sign: await hmac(ID + token + t + nonce + sts) };
  if (token) h.access_token = token;
  if (body) h["Content-Type"] = "application/json";
  const r = await fetch(HOST + path, { method, headers: h, body: body || undefined });
  return await r.json();
}
async function sb(path: string, init: RequestInit = {}) {
  return await fetch(SB + "/rest/v1/" + path, { ...init, headers: { apikey: SR, Authorization: "Bearer " + SR, "Content-Type": "application/json", ...(init.headers ?? {}) } });
}
async function log(row: Record<string, unknown>) { try { await sb("iot_commands", { method: "POST", body: JSON.stringify(row), headers: { Prefer: "return=minimal" } }); } catch { /* ไม่มีตารางก็ไม่เป็นไร */ } }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, msg: "POST เท่านั้น" }, 405);
  if (!ID || !SECRET || !HOST || !PIN) return json({ ok: false, msg: "ยังตั้งค่า Secrets ของฟังก์ชันไม่ครบ" }, 500);
  let b: { device_id?: string; on?: boolean; pin?: string; check?: boolean };
  try { b = await req.json(); } catch { return json({ ok: false, msg: "ข้อมูลไม่ถูกต้อง" }, 400); }

  // กันเดารหัส: ผิดเกิน 5 ครั้งใน 10 นาที = ล็อก
  const since = new Date(Date.now() - 10 * 60000).toISOString();
  const fr = await sb(`iot_commands?select=id&ok=eq.false&msg=eq.bad_pin&ts=gte.${since}`);
  if (fr.ok && (await fr.json()).length >= 5) return json({ ok: false, msg: "ใส่รหัสผิดหลายครั้ง รอ 10 นาทีแล้วลองใหม่" }, 429);
  if (String(b.pin ?? "").trim() !== PIN) { await log({ device_id: b.device_id ?? null, action: b.check ? "check" : (b.on ? "on" : "off"), ok: false, msg: "bad_pin" }); return json({ ok: false, msg: "รหัสสั่งงานไม่ถูกต้อง" }, 401); }
  if (b.check) return json({ ok: true });

  const id = String(b.device_id ?? ""), on = !!b.on;
  const dr = await sb(`iot_devices?select=id,name,category&id=eq.${encodeURIComponent(id)}`);
  const dev = dr.ok ? (await dr.json())[0] : null;
  if (!dev) return json({ ok: false, msg: "ไม่พบอุปกรณ์" }, 404);
  if (!ALLOW.has(dev.category)) return json({ ok: false, msg: "อุปกรณ์นี้ไม่อนุญาตให้สั่งจาก Dashboard" }, 403);

  const tk = await tuya("GET", "/v1.0/token?grant_type=1");
  if (!tk.success) return json({ ok: false, msg: "เชื่อม Tuya ไม่ได้: " + tk.msg }, 502);
  const token = tk.result.access_token;
  let res: { success?: boolean; msg?: string; code?: number } = {};

  if (dev.category === "infrared_ac") {
    // แอร์อินฟราเรด: สั่งผ่านตัวส่งอินฟราเรด (gateway) ของรีโมตนั้น
    const info = await tuya("GET", `/v1.0/devices/${id}`, token);
    const gw = info?.result?.gateway_id || info?.result?.parent_id;
    res = gw ? await tuya("POST", `/v2.0/infrareds/${gw}/air-conditioners/${id}/command`, token, JSON.stringify({ code: "power", value: on ? 1 : 0 })) : { success: false, msg: "หา gateway อินฟราเรดไม่เจอ" };
    if (!res.success) res = await tuya("POST", `/v1.0/iot-03/devices/${id}/commands`, token, JSON.stringify({ commands: [{ code: "switch", value: on }] }));
  } else {
    const fn = await tuya("GET", `/v1.0/iot-03/devices/${id}/functions`, token);
    const codes: string[] = (fn?.result?.functions ?? []).map((f: { code: string }) => f.code);
    const code = ["switch_1", "switch", "switch_led"].find(c => codes.includes(c)) ?? "switch_1";
    res = await tuya("POST", `/v1.0/iot-03/devices/${id}/commands`, token, JSON.stringify({ commands: [{ code, value: on }] }));
  }

  const ok = !!res.success;
  const msg = ok ? "ok" : `${res.code ?? ""} ${res.msg ?? "สั่งไม่สำเร็จ"}`.trim();
  await log({ device_id: id, device_name: dev.name, action: on ? "on" : "off", ok, msg });
  return json({ ok, msg: ok ? (on ? "สั่งเปิดแล้ว" : "สั่งปิดแล้ว") : "Tuya ปฏิเสธคำสั่ง: " + msg }, ok ? 200 : 502);
});
