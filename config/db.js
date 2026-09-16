require('dotenv').config();
const { Sequelize } = require('sequelize');
const { Pool } = require('pg');

const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_NAME_ESANQUA'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required env var(s): ${missing.join(', ')} - cek file .env (lihat .env.example)`);
}

const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  dialect: 'postgres',
  dialectOptions: { ssl },
  logging: false,
  pool: { max: 5, min: 0, idle: 10000 },
  // Kolom timestamp di HRSystem semuanya "without time zone" - nyimpan wall-clock
  // WIB apa adanya (bukan UTC). Tanpa ini, Sequelize default nganggep Date sebagai
  // UTC dan salah geser -7 jam saat insert/update. Lihat juga process.env.TZ di app.js.
  timezone: '+07:00',
});

// Dipakai untuk baca tabel legacy (ms_shifts, ms_companies, ms_employees) dan
// untuk transaksi runner (INSERT + panggil function + ROLLBACK) yang butuh
// kontrol BEGIN/ROLLBACK manual langsung.
const pgPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl,
  max: 5,
});

// Database terpisah (server sama, credential sama, nama DB beda) - tempat master
// data company sebenarnya disimpan (ms_plants). ms_companies di DB HR cuma nyimpan
// FK company_id yang dipakai tabel HR + plant_id sebagai referensi ke sini; nama
// company yang akurat harus diambil dari sini, bukan dari ms_companies.name.
const pgPoolEsanqua = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME_ESANQUA,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl,
  max: 5,
});

module.exports = { sequelize, pgPool, pgPoolEsanqua };
