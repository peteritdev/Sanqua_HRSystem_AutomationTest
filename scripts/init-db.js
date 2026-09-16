require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pgPool } = require('../config/db');

async function main() {
  const sqlDir = path.join(__dirname, '..', 'sql');
  const files = fs
    .readdirSync(sqlDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Menjalankan migration di ${sqlDir} ke database ${process.env.DB_NAME} @ ${process.env.DB_HOST}:${process.env.DB_PORT} ...`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
    console.log(`  - ${file}`);
    await pgPool.query(sql);
  }

  console.log('Selesai. Semua migration sudah diterapkan.');
  await pgPool.end();
}

main().catch((err) => {
  console.error('Gagal init DB:', err.message);
  process.exit(1);
});
