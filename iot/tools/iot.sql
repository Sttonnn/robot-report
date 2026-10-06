-- IOT Dashboard (Tuya) · รันใน Supabase → SQL Editor ครั้งเดียว
-- เขียนข้อมูลโดย GitHub Actions ด้วย service_role (ข้าม RLS) · หน้าเว็บใช้ anon อ่านอย่างเดียว

-- อุปกรณ์ + ค่าล่าสุด (1 แถวต่อเครื่อง)
create table if not exists iot_devices (
  id          text primary key,          -- device id ของ Tuya
  name        text,
  category    text,                      -- qxj / wnykq / dlq / kg / znjdq / infrared_ac
  product     text,
  site        text,                      -- คลัง เช่น WH5 / WH8 / WH29 (เดาจากชื่อ แก้บนเว็บได้ภายหลัง)
  online      boolean,
  status      jsonb,                     -- ค่าดิบทั้งหมดจาก Tuya
  updated_at  timestamptz default now()
);

-- ประวัติค่าที่อ่านได้ (ทุกรอบที่ดึง)
create table if not exists iot_readings (
  device_id   text not null references iot_devices(id) on delete cascade,
  ts          timestamptz not null,
  online      boolean,
  temp_c      numeric,                   -- อุณหภูมิ °C
  humidity    numeric,                   -- ความชื้น %
  power_w     numeric,                   -- กำลังไฟ W
  voltage_v   numeric,
  current_a   numeric,
  energy_kwh  numeric,                   -- พลังงานสะสม kWh
  switch_on   boolean,                   -- เครื่องเปิด/ปิด
  primary key (device_id, ts)
);
create index if not exists iot_readings_ts on iot_readings (ts desc);

alter table iot_devices  enable row level security;
alter table iot_readings enable row level security;
create policy "iot_devices read"  on iot_devices  for select to anon, authenticated using (true);
create policy "iot_readings read" on iot_readings for select to anon, authenticated using (true);
-- ไม่มี policy เขียนสำหรับ anon → เขียนได้เฉพาะ service_role (GitHub Actions)
