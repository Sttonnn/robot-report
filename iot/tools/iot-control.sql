-- IOT · บันทึกการสั่งเปิด/ปิดจาก Dashboard (Edge Function iot-control เขียนด้วย service_role)
create table if not exists iot_commands (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  device_id   text,
  device_name text,
  action      text,            -- on / off / check
  ok          boolean,
  msg         text
);
create index if not exists iot_commands_ts on iot_commands (ts desc);
alter table iot_commands enable row level security;
create policy "iot_commands read" on iot_commands for select to anon, authenticated using (true);
-- ไม่มี policy เขียนสำหรับ anon → เขียนได้เฉพาะ Edge Function (service_role)
