// Harus paling atas, sebelum module lain (moment, dsb) sempat baca Date -
// semua input jam di tool ini dianggap wall-clock WIB (Asia/Jakarta), bukan UTC,
// konsisten sama kolom "timestamp without time zone" di HRSystem. Biar tidak
// tergantung timezone default OS/container saat nanti di-deploy ke Portainer.
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const { sequelize } = require('./config/db');

const overtimeRoutes = require('./routes/overtime');
const overtimeImportRoutes = require('./routes/overtimeImport');
const logsRoutes = require('./routes/logs');
const lookupRoutes = require('./routes/lookup');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Tool ini belum ada auth (phase 1) - dipakai nama tester dari cookie sekadar
// buat kolom `triggered_by` di log run, bukan mekanisme keamanan.
app.use((req, res, next) => {
  req.testerName = req.cookies.tester_name || 'anonymous';
  res.locals.testerName = req.testerName;
  next();
});

app.post('/tester-name', (req, res) => {
  const name = (req.body.tester_name || '').trim().slice(0, 100);
  if (name) {
    res.cookie('tester_name', name, { maxAge: 1000 * 60 * 60 * 24 * 30 });
  }
  res.redirect(req.get('Referer') || '/overtime');
});

app.get('/', (req, res) => res.redirect('/overtime'));

app.use('/overtime/logs', logsRoutes);
app.use('/overtime/import', overtimeImportRoutes);
app.use('/overtime', overtimeRoutes);
app.use('/lookup', lookupRoutes);

app.use((req, res) => {
  res.status(404).send('Halaman tidak ditemukan');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(`Terjadi error: ${err.message}`);
});

const PORT = process.env.PORT || 4100;

async function start() {
  await sequelize.authenticate();
  console.log(`Koneksi database OK (${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT})`);
  app.listen(PORT, () => {
    console.log(`HR Automation Test Tool jalan di http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Gagal start aplikasi:', err.message);
  process.exit(1);
});
