-- Section "Employee Shift Schedule" di form test case - override sementara
-- ms_employeeshiftschedules (roster) saat RUN, supaya hasil kalkulasi overtime
-- deterministik (tidak tergantung ada/tidaknya roster asli utk employee/tanggal
-- itu). Dua baris tetap (row 1 & row 2) - biasanya row 1 = tanggal shift mulai,
-- row 2 = tanggal "next date" utk shift yang lewat tengah malam.

ALTER TABLE ts_ms_overtimeconditions
  ADD COLUMN IF NOT EXISTS schedule_1_date DATE NULL,
  ADD COLUMN IF NOT EXISTS schedule_1_is_off BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_1_shift_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS schedule_2_date DATE NULL,
  ADD COLUMN IF NOT EXISTS schedule_2_is_off BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_2_shift_id INTEGER NULL;
