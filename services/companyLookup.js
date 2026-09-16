const { pgPoolEsanqua } = require('../config/db');

// Terkonfirmasi via data asli (tr_employeerequestovertimes.company_name &
// ms_overtimesettings.company_name yang disimpan literal oleh sistem):
// company_id di SEMUA tabel HR (ms_employees, ms_shifts, ms_overtimesettings,
// tr_employeerequestovertimes, dst) itu LANGSUNG ms_plants.id (DB esanqua) -
// BUKAN ms_companies.id (ms_companies di DB HR ternyata tidak relevan buat ini;
// ms_companies.id=1/2 malah tertukar dibanding ms_plants.id=1/2 utk company yang
// sama, jadi resolve lewat ms_companies.plant_id justru salah).
async function getActiveCompanies() {
  const { rows: plants } = await pgPoolEsanqua.query(
    `SELECT id, name FROM ms_plants WHERE COALESCE(is_delete,0) = 0 ORDER BY name`
  );
  return plants;
}

module.exports = { getActiveCompanies };
