# Cara Menjalankan - HR Automation Test Tool (Overtime, Phase 1)

## 1. Prasyarat

- Node.js >= 16 (sudah tersedia di laptop ini: v16.20.2)
- Akses network ke DB staging Sanqua HRSystem (`10.10.20.5:5432`)

## 2. Setup awal (sekali saja)

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` menjadi `.env`, lalu isi credential DB staging:
   ```
   PORT=4100
   DB_HOST=10.10.20.5
   DB_PORT=5432
   DB_NAME=staging_sanqua_hrsystemdb
   DB_USER=postgres
   DB_PASSWORD=<isi password>
   DB_SSL=false
   DB_NAME_ESANQUA=sanqua_esanquadb
   ```
   > `DB_NAME_ESANQUA` itu database KEDUA di server & credential yang SAMA - tempat master data company disimpan (tabel `ms_plants`). Tool ini konek ke 2 database sekaligus: `DB_NAME` untuk semua tabel HR (`ms_employees`, `ms_shifts`, `ms_overtimesettings`, dst - kolom `company_id` di tabel-tabel ini adalah `ms_plants.id` LANGSUNG, sudah dikonfirmasi lewat data asli), `DB_NAME_ESANQUA` khusus buat dropdown/nama company (`ms_companies` di DB HR tidak dipakai sama sekali untuk ini).
   > File `.env` sudah masuk `.gitignore` - jangan pernah commit file ini.
3. Buat tabel baru (`ts_ms_overtimeconditions`, `ts_logs`) di database staging - **cukup dijalankan sekali** (aman diulang, pakai `CREATE TABLE IF NOT EXISTS`):
   ```
   npm run db:init
   ```

## 3. Menjalankan aplikasi

```
npm start
```

atau untuk development (auto-restart saat file berubah):
```
npm run dev
```

Kalau berhasil akan muncul log:
```
Koneksi database OK (staging_sanqua_hrsystemdb @ 10.10.20.5:5432)
HR Automation Test Tool jalan di http://localhost:4100
```

## 4. Akses lewat browser

Buka: **http://localhost:4100**

Halaman akan otomatis redirect ke `/overtime` (grid test case). Menu tersedia:

| Menu | URL | Fungsi |
|---|---|---|
| Overtime | `/overtime` | Grid test case + tombol RUN / RUN ALL CONDITIONS |
| + New Test Case | `/overtime/new` | Tambah test case baru |
| Logs | `/overtime/logs` | History run (filter status/tanggal/run_id) |

Isi "Tester" di pojok kanan atas (sekali saja, disimpan di cookie browser) supaya kolom `triggered_by` di log run tercatat nama kamu, bukan "anonymous".

> Belum ada login/auth di phase 1 (sesuai kesepakatan) - jadi siapa pun yang bisa akses `http://localhost:4100` (atau URL container-nya nanti) bisa insert/run/delete test case. Jangan expose port ini ke jaringan luar tanpa Basic Auth di reverse proxy.

## 5. Kode test case

Setiap test case otomatis dapat kode unik format `TC-OT-0001` (`TC` = Test Case, `OT` = modul Overtime, nomor urut 4 digit) - digenerate otomatis oleh database saat disimpan, tidak bisa diedit. Kode ini yang muncul di grid, form (mode edit), dan log run - dipakai buat identify test case, misalnya saat reference di bug report.

## 6. Cara kerja tombol RUN (penting buat dipahami)

Saat klik **RUN**, tool:
1. INSERT baris sementara ke `tr_employeerequestovertimes` (status approved) dari data test case.
2. Panggil `func_calculate_overtime_v2` (function asli yang sama dipakai WebService).
3. **ROLLBACK** transaksi - baris tadi tidak pernah benar-benar tersimpan di database, walau proses tiba-tiba mati di tengah jalan.
4. Bandingkan hasil ke expected result → simpan **history**-nya ke `ts_logs` (permanen) dan update `last_run_status` di test case.

Jadi tabel `tr_employeerequestovertimes` di staging tidak akan pernah bertambah data dari tool ini - yang bertambah cuma `ts_logs` (history run) dan `ts_ms_overtimeconditions` (master test case, kalau kamu tambah/edit).

## 7. Import test case dari Excel

Menu **Import** (`/overtime/import`):
1. Download template (.xlsx) - berisi sheet `Petunjuk` (cara isi), `Test Case` (yang diisi), dan referensi `Master Company`/`Master Employee`/`Master Shift` (isi ID dari sheet-sheet ini ke kolom `company_id`/`employee_id`/`shift_id`).
2. Isi sheet `Test Case`, upload lagi lewat form di halaman yang sama.
3. Baris yang valid langsung masuk ke database (kode `TC-OT-xxxx` auto-generate). Baris yang error (company/employee/shift tidak ketemu, format tanggal salah, dst) di-skip dengan alasan ditampilkan per baris - tidak all-or-nothing, baris valid tetap masuk walau ada baris lain yang gagal.
4. Baris yang `test_case_name`-nya kosong dilewati diam-diam (tidak dianggap error) - cocok buat baris pemisah/kosong di Excel.

## 8. Clear Log

Tombol **Clear Log** di halaman `/overtime/logs` menghapus SEMUA history run (`ts_logs`) - ada konfirmasi sebelum eksekusi, dan tidak bisa di-undo. Ini **tidak** mengubah `last_run_status`/`last_run_at` di grid test case (itu status "hasil run terakhir" yang independen dari histori log detail).

## 9. Timezone (WIB / Asia-Jakarta)

Semua kolom jam (`clock_in`, `clock_out`, `overtime_start`, `overtime_end`) disimpan sebagai wall-clock **WIB apa adanya** (kolom `timestamp without time zone`, sama seperti konvensi HRSystem asli) - BUKAN dikonversi ke UTC. Tool ini set `process.env.TZ = 'Asia/Jakarta'` (di `app.js`) dan Sequelize `timezone: '+07:00'` (di `config/db.js`) supaya ini konsisten di semua environment (laptop maupun nanti container Portainer) - jangan dihapus/diubah kecuali servernya memang bukan WIB.

## 10. Troubleshooting

| Gejala | Kemungkinan Penyebab |
|---|---|
| `Missing required env var(s)` saat start | `.env` belum dibuat / ada key yang kosong |
| `EADDRINUSE: address already in use :::4100` | Ada instance lain yang masih jalan di port itu, atau ganti `PORT` di `.env` |
| Error `relation "ts_ms_overtimeconditions" does not exist` | Belum jalankan `npm run db:init` |
| RUN hasil `status: error`, pesan `Employee not found` | `employee_id` yang dipilih tidak match `ms_employees` (cek status aktif) |
| RUN hasil `overtime_before_rounding: 0` terus, `windows_found: 0` | Cek `ms_overtimesettings.enable_overtime_planning` untuk company itu - kalau `false`, function selalu return 0 |
| Dropdown Employee/Shift kosong di form | Pastikan company yang dipilih benar-benar punya data di `ms_employees`/`ms_shifts` untuk company tsb |

## 11. Deployment ke Portainer (nanti)

Kalau tool ini sudah stabil dan siap containerize, ikuti skill `mitraapp-node-docker-portainer` (build image di laptop → push GHCR → deploy Portainer pakai `image:`). Lihat juga bagian 9 di `docs/automation-test-tool-design.md`.
