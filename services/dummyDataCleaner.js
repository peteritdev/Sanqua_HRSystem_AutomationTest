const { pgPool } = require('../config/db');

// Definisi per tabel: kolom employee/tanggal yang dipakai buat filter.
// company_id sengaja cuma dipakai kalau kolomnya memang ada di tabel itu -
// log_attendances & ms_employeeshiftschedules tidak punya kolom company_id sendiri
// (scope company sudah terjamin lewat pemilihan employee_id).
const TARGETS = {
  attendance: {
    label: 'Presensi (log_attendances)',
    table: 'log_attendances',
    dateColumn: 'period_date',
    hasCompanyColumn: false,
  },
  shift: {
    label: 'Jadwal Shift (ms_employeeshiftschedules)',
    table: 'ms_employeeshiftschedules',
    dateColumn: 'date',
    hasCompanyColumn: false,
  },
  overtime: {
    label: 'Overtime Request (tr_employeerequestovertimes)',
    table: 'tr_employeerequestovertimes',
    dateColumn: 'date',
    hasCompanyColumn: true,
  },
  permission: {
    label: 'Permission/Izin (tr_employeerequestpermissions)',
    table: 'tr_employeerequestpermissions',
    dateColumn: 'start_date',
    hasCompanyColumn: true,
  },
};

function buildQuery(target, { companyId, employeeIds, startDate, endDate }) {
  const params = [employeeIds, startDate, endDate];
  let where = `employee_id = ANY($1::int[]) AND ${target.dateColumn} BETWEEN $2 AND $3`;
  if (target.hasCompanyColumn) {
    params.push(companyId);
    where += ` AND company_id = $${params.length}`;
  }
  return { where, params };
}

async function previewClearData({ tables, companyId, employeeIds, startDate, endDate }) {
  const results = [];
  for (const key of tables) {
    const target = TARGETS[key];
    if (!target) continue;
    const { where, params } = buildQuery(target, { companyId, employeeIds, startDate, endDate });
    const { rows } = await pgPool.query(`SELECT COUNT(*) AS total FROM ${target.table} WHERE ${where}`, params);
    results.push({ key, label: target.label, count: Number(rows[0].total) });
  }
  return results;
}

async function clearData({ tables, companyId, employeeIds, startDate, endDate }) {
  const results = [];
  for (const key of tables) {
    const target = TARGETS[key];
    if (!target) continue;
    const { where, params } = buildQuery(target, { companyId, employeeIds, startDate, endDate });
    const { rowCount } = await pgPool.query(`DELETE FROM ${target.table} WHERE ${where}`, params);
    results.push({ key, label: target.label, count: rowCount });
  }
  return results;
}

module.exports = { previewClearData, clearData, TARGETS };
