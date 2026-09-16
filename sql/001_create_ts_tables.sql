-- Tabel baru khusus tool automation test (phase 1: modul overtime).
-- Dijalankan di DB yang SAMA dengan SanquaAttendance-WebService (staging).
-- Idempotent: aman dijalankan berkali-kali (CREATE ... IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS ts_ms_overtimeconditions (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    test_case_name VARCHAR(255) NOT NULL,
    shift_id INTEGER NULL,
    clock_in TIMESTAMP NOT NULL,
    clock_out TIMESTAMP NOT NULL,
    is_break BOOLEAN NOT NULL DEFAULT false,
    period_date DATE NOT NULL,
    overtime_start TIMESTAMP NOT NULL,
    overtime_end TIMESTAMP NOT NULL,
    test_objective TEXT NULL,
    expected_result_before_rounding NUMERIC(10,2) NOT NULL,
    expected_result_after_rounding NUMERIC(10,2) NOT NULL,
    actual_result_before_rounding NUMERIC(10,2) NULL,
    actual_result_after_rounding NUMERIC(10,2) NULL,
    last_run_status VARCHAR(20) NULL,
    last_run_at TIMESTAMP NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(100) NULL
);

CREATE INDEX IF NOT EXISTS idx_ts_ms_overtimeconditions_active
    ON ts_ms_overtimeconditions (is_active);

CREATE TABLE IF NOT EXISTS ts_logs (
    id SERIAL PRIMARY KEY,
    run_id UUID NOT NULL,
    module_name VARCHAR(50) NOT NULL,
    condition_id INTEGER NULL,
    test_data_condition JSONB NOT NULL,
    expected_result JSONB NOT NULL,
    actual_result JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    error_message TEXT NULL,
    duration_ms INTEGER NULL,
    triggered_by VARCHAR(100) NULL,
    log_time TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ts_logs_run_id ON ts_logs (run_id);
CREATE INDEX IF NOT EXISTS idx_ts_logs_module_name ON ts_logs (module_name);
CREATE INDEX IF NOT EXISTS idx_ts_logs_log_time ON ts_logs (log_time);
