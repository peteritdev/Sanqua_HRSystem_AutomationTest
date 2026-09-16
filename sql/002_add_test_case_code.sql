-- Tambah kolom test_case_code auto-generate (format QA umum: TC-<MODUL>-0001).
-- Generate pakai Postgres SEQUENCE + DEFAULT expression - atomic, aman dari race
-- condition walau 2 insert jalan bersamaan, dan tidak perlu logic tambahan di Node.js.

CREATE SEQUENCE IF NOT EXISTS seq_overtimeconditions_code START 1;

ALTER TABLE ts_ms_overtimeconditions
  ADD COLUMN IF NOT EXISTS test_case_code VARCHAR(30);

-- Isi kode utk baris lama (kalau ada) yang dibuat sebelum kolom ini ada.
UPDATE ts_ms_overtimeconditions
  SET test_case_code = 'TC-OT-' || LPAD(nextval('seq_overtimeconditions_code')::text, 4, '0')
  WHERE test_case_code IS NULL;

ALTER TABLE ts_ms_overtimeconditions
  ALTER COLUMN test_case_code SET NOT NULL;

ALTER TABLE ts_ms_overtimeconditions
  ALTER COLUMN test_case_code SET DEFAULT ('TC-OT-' || LPAD(nextval('seq_overtimeconditions_code')::text, 4, '0'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_ts_ms_overtimeconditions_code'
  ) THEN
    ALTER TABLE ts_ms_overtimeconditions
      ADD CONSTRAINT uq_ts_ms_overtimeconditions_code UNIQUE (test_case_code);
  END IF;
END$$;
