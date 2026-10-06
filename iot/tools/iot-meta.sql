-- IOT Dashboard · ตั้งชื่อ/คลัง/ตำแหน่ง/เกณฑ์อุณหภูมิ ของแต่ละอุปกรณ์ (แก้บนหน้าเว็บ)
create table if not exists iot_device_meta (
  id          text primary key,      -- device id ของ Tuya (= iot_devices.id)
  label       text,                  -- ชื่อที่แสดง
  site        text,                  -- คลัง (ทับค่าที่เดาจากชื่อ)
  loc         text,                  -- ตำแหน่ง
  t_max       numeric,               -- เตือนเมื่ออุณหภูมิสูงกว่า (°C)
  t_min       numeric,               -- เตือนเมื่ออุณหภูมิต่ำกว่า (°C)
  h_max       numeric,               -- เตือนเมื่อความชื้นเกิน (%)
  hidden      boolean default false, -- ซ่อนจากหน้า
  map         text,                  -- แผนที่ 3D (wha / wh29)
  px          numeric,               -- ตำแหน่งหมุดบนผัง (พิกเซลผัง 150 dpi)
  py          numeric,
  updated_at  timestamptz default now()
);
alter table iot_device_meta enable row level security;
-- หน้าเว็บไม่มี login (เหมือนหน้าอื่นของ PCG) → anon อ่าน/เพิ่ม/แก้ได้ · ลบไม่ได้
drop policy if exists "iot_meta read" on iot_device_meta;
drop policy if exists "iot_meta insert" on iot_device_meta;
drop policy if exists "iot_meta update" on iot_device_meta;
create policy "iot_meta read"   on iot_device_meta for select to anon, authenticated using (true);
create policy "iot_meta insert" on iot_device_meta for insert to anon, authenticated with check (true);
create policy "iot_meta update" on iot_device_meta for update to anon, authenticated using (true) with check (true);

-- ถ้าเคยรันไฟล์นี้ก่อนมีแผนที่ 3D: เพิ่มคอลัมน์ตำแหน่งหมุด (รันซ้ำได้)
alter table iot_device_meta add column if not exists map text;
alter table iot_device_meta add column if not exists px numeric;
alter table iot_device_meta add column if not exists py numeric;
