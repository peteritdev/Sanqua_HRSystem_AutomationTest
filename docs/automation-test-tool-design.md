# HR Automation Test Tool — Design Doc (Modul Overtime, Phase 1)

Status: desain awal, belum diimplementasi. Dokumen ini dibuat di repo `SanquaAttendance-WebService` sebagai referensi, tapi tool-nya sendiri akan jadi **repo/service terpisah**.

## 1. Tujuan

Internal QA tool buat tim HRSystem: input skenario test (test condition) per modul, run kondisi (satu-satu atau semua), lihat hasil passed/not passed, dan simpan histori run (log run) buat audit/debug regresi. Modul pertama: **Overtime**. Modul lain (attendance, leave, dll) menyusul dengan pola yang sama tapi kolom test condition beda-beda.

## 2. Arsitektur

**Monolith Node.js + Express, server-rendered (EJS) + vanilla JS/`fetch`.** Bukan SPA + REST API terpisah — sengaja biar ringkas (satu proses, satu deploy, satu port, nggak ada CORS).

```
Browser (EJS pages + vanilla JS)
        │  fetch() ke route di app yang sama (same-origin)
        ▼
Express app (routes → runner → db)
        │  pg/Sequelize, raw SQL / stored function call
        ▼
Postgres — DB YANG SAMA dengan SanquaAttendance-WebService
  (tabel baru: ts_ms_overtimeconditions, ts_logs
   + baca ms_shifts, ms_companies untuk dropdown
   + panggil func_calculate_overtime_v2 utk actual result)
```

Kenapa konek DB langsung, bukan manggil HTTP endpoint WebService:
- Tool nggak bergantung WebService lagi jalan/nggak.
- Testing di level yang tepat: `OvertimeService.calculateOvertimeV2` di WebService cuma validasi tipis di atas `func_calculate_overtime_v2` — jadi manggil function-nya langsung sudah representatif untuk tes kebenaran kalkulasi.
- **Tradeoff yang disadari**: ini TIDAK menguji layer HTTP/auth/validasi request punya WebService. Kalau nanti mau tes kontrak API juga, tambahin runner varian yang hit endpoint HTTP-nya — tapi itu di luar scope phase 1.

## 3. Tech stack

- `express` + `ejs` (view engine, no build step)
- `pg` atau `sequelize` (ikut yang biasa dipakai di ekosistem MitraApp — `sequelize` + `pg`/`pg-hstore` biar konsisten sama WebService)
- `dotenv` untuk config DB (env var langsung — repo baru, jadi TIDAK perlu pola `generate-config.js`/`config.json` legacy; pakai env var dari awal)
- `express-validator` (validasi form)
- `moment` (format tanggal)
- Frontend: vanilla JS `fetch`, CSS minimal (boleh Bootstrap via CDN kalau mau cepat, no bundler)

## 4. Struktur folder (usulan)

```
/config
  db.js                 # koneksi pg/sequelize dari .env
/runners
  overtimeRunner.js     # kontrak run(condition) -> { actual_result, passed }
/routes
  overtime.js            # CRUD test condition + run
  logs.js                 # log run viewer
  lookup.js                # GET /lookup/shifts?company_id= (JSON, same-origin)
/views
  layout.ejs
  overtime/list.ejs        # grid test condition + tombol RUN ALL / RUN per row
  overtime/form.ejs        # create/edit test condition
  logs/list.ejs             # log run, filter by module/status/date/run_id
/public
  css/, js/ (fetch handlers utk RUN, RUN ALL, dropdown shift)
app.js
.env.example
.gitignore                 # .env wajib masuk sini
package.json
```

## 5. Skema database

Tabel baru di database yang sama dengan `SanquaAttendance-WebService` (jangan bikin DB terpisah — biar gampang query `ms_shifts`/`tr_employeerequestovertimes` sebagai referensi saat isi expected result).

### 5.1 `ts_ms_overtimeconditions` (master test data, modul overtime)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | SERIAL PK | |
| `company_id` | INTEGER NOT NULL | |
| `test_case_name` | VARCHAR(255) NOT NULL | |
| `shift_id` | INTEGER NULL | lookup dari `ms_shifts` chain by `company_id` |
| `clock_in` | TIMESTAMP NOT NULL | |
| `clock_out` | TIMESTAMP NOT NULL | |
| `is_break` | BOOLEAN DEFAULT false | |
| `overtime_start` | TIMESTAMP NOT NULL | format `YYYY-MM-DD HH:mm:ss` |
| `overtime_end` | TIMESTAMP NOT NULL | format `YYYY-MM-DD HH:mm:ss` |
| `test_objective` | TEXT | |
| `expected_result_before_rounding` | NUMERIC(10,2) | |
| `expected_result_after_rounding` | NUMERIC(10,2) | saat bikin test data, biasanya diambil dari record nyata di `tr_employeerequestovertimes.total_hour_rounding` sebagai acuan — bukan auto-lookup runtime |
| `actual_result_before_rounding` | NUMERIC(10,2) NULL | diisi otomatis tiap kali di-run |
| `actual_result_after_rounding` | NUMERIC(10,2) NULL | diisi otomatis tiap kali di-run |
| `last_run_status` | VARCHAR(20) NULL | `passed` \| `not_passed` \| `error` \| NULL (belum pernah run) |
| `last_run_at` | TIMESTAMP NULL | |
| `is_active` | BOOLEAN DEFAULT true | soft-delete flag, biar log lama tetap valid walau test case direvisi/dinonaktifkan |
| `created_at`, `created_by`, `updated_at`, `updated_by` | | |

### 5.2 `ts_logs` (log run, generic — dipakai semua modul)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | SERIAL/UUID PK | |
| `run_id` | UUID NOT NULL | mengelompokkan satu batch "RUN ALL" jadi satu run; run satuan tetap dapat `run_id` sendiri (1 row) |
| `module_name` | VARCHAR(50) NOT NULL | `overtime`, nanti `attendance`, `leave`, dst |
| `condition_id` | INTEGER NULL | FK ke tabel master modul terkait (mis. `ts_ms_overtimeconditions.id`) |
| `test_data_condition` | JSONB NOT NULL | **snapshot** kondisi test saat run (bukan live reference — supaya histori tetap akurat walau master row diedit belakangan) |
| `expected_result` | JSONB NOT NULL | |
| `actual_result` | JSONB NOT NULL | |
| `status` | VARCHAR(20) NOT NULL | `passed` \| `not_passed` \| `error` |
| `error_message` | TEXT NULL | diisi kalau `status = error` (exception, bukan mismatch value) |
| `duration_ms` | INTEGER | |
| `triggered_by` | VARCHAR(100) | email/username yang klik RUN |
| `log_time` | TIMESTAMP DEFAULT NOW() | |

## 6. Kontrak "test runner" (buat extensibility ke modul lain)

Supaya route RUN/RUN ALL/log nggak diduplikasi tiap modul baru, tiap modul implement kontrak yang sama:

```js
// runners/overtimeRunner.js
module.exports = {
  moduleName: 'overtime',
  async run(conditionRow) {
    // 1. panggil func_calculate_overtime_v2 langsung ke DB dengan input dari conditionRow
    // 2. bandingkan actual vs expected_result_before/after_rounding
    // 3. return { actual_result: {...}, passed: boolean }
  }
};
```

Handler generic di `routes/overtime.js` (dan nanti `routes/attendance.js`, dst) tinggal: ambil condition row → panggil `runner.run(row)` → tulis `ts_logs` → update `last_run_status`/`last_run_at` di master row.

## 7. Halaman & Route (SSR)

| Route | Method | Fungsi |
|---|---|---|
| `/overtime` | GET | Grid test condition (badge passed/not passed dari `last_run_status`) + tombol **RUN ALL CONDITIONS** |
| `/overtime/new` | GET/POST | Form tambah test condition |
| `/overtime/:id/edit` | GET/POST | Edit test condition |
| `/overtime/:id/delete` | POST | Soft delete (`is_active = false`) |
| `/overtime/:id/run` | POST (fetch/AJAX) | Run 1 kondisi → return JSON `{status, actual_result}`, halaman update baris itu tanpa reload |
| `/overtime/run-all` | POST (fetch/AJAX) | Run semua kondisi aktif → satu `run_id`, return ringkasan (x passed / y not passed) |
| `/overtime/logs` | GET | Log run — filter by tanggal/status/`run_id` |
| `/overtime/logs/:run_id` | GET | Detail satu batch run |
| `/lookup/shifts?company_id=` | GET (JSON) | Populate dropdown shift — endpoint internal same-origin, bukan API eksternal |

## 8. Keamanan

Tool ini standalone (deploy sebagai container/port sendiri via Portainer), TIDAK duduk di belakang auth middleware WebService. Rekomendasi minimal: session login sederhana (username/password internal tim QA) atau Basic Auth di level reverse proxy — jangan dibiarkan terbuka, karena bisa nulis ke DB produksi/staging.

## 9. Deployment note (ikut konvensi MitraApp)

Saat siap containerize: pakai skill `mitraapp-node-docker-portainer`. Ringkasnya:
- Build image di laptop lokal → push ke GHCR (`ghcr.io/peteritdev/<nama-service>:latest`, package Private) — server Portainer pakai Docker Engine 19.03.11, tidak bisa `build:` dari situ.
- Stack Portainer terpisah: `MitraApp-AutomationTest` (nama final ikut kesepakatan), deploy dengan `image:` (Web editor method).
- DB target (`10.10.20.9:5432`) di-set lewat env var container — pastikan pointing ke **staging**, bukan production, biar run test nggak nyampur data nyata (tabel `ts_*` sendiri aman, tapi function `func_calculate_overtime_v2` baca `ms_shifts`/dsb dari environment yang sama).
- Kalau nggak perlu manggil container lain, tidak wajib join `mitraapp-network` (Postgres di server terpisah, bukan container).

## 10. Yang perlu dikonfirmasi sebelum mulai coding

1. Nama final repo/service (untuk konvensi `MitraApp-<NamaService>` & image GHCR).
2. DB target test runner ini: staging aja, atau perlu bisa switch ke production juga (read-only utk ambil acuan `tr_employeerequestovertimes`, tapi run tetap di staging)?
3. Toleransi perbandingan actual vs expected (exact match, atau ada tolerance kecil buat floating point jam/menit)?
4. Mekanisme login/auth tool ini — session sederhana atau Basic Auth di proxy?
5. Perlu halaman detail per-`run_id` (batch log) dari awal, atau list flat dulu cukup untuk phase 1?
