const ExcelJS = require('exceljs');
const moment = require('moment');
const { pgPool } = require('../config/db');
const { getActiveCompanies } = require('./companyLookup');
const { hmToDecimalHours } = require('../utils/timeFormat');

const SHEET_NAME = 'Test Case';

function cellValue(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v && typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((rt) => rt.text).join('');
    if (v.result !== undefined) return v.result; // formula cell
    if (v instanceof Date) return v;
    if (v.text !== undefined) return v.text; // hyperlink-like object
  }
  return v;
}

function parseDateTime(value, fieldLabel) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldLabel} wajib diisi`);
  }
  if (value instanceof Date) return value;
  const parsed = moment(String(value).trim(), 'YYYY-MM-DD HH:mm', true);
  if (!parsed.isValid()) {
    throw new Error(`${fieldLabel} format salah (harus YYYY-MM-DD HH:mm), dapat: "${value}"`);
  }
  return parsed.toDate();
}

function parseDateOnly(value, fieldLabel) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldLabel} wajib diisi`);
  }
  if (value instanceof Date) return moment(value).format('YYYY-MM-DD');
  const parsed = moment(String(value).trim(), 'YYYY-MM-DD', true);
  if (!parsed.isValid()) {
    throw new Error(`${fieldLabel} format salah (harus YYYY-MM-DD), dapat: "${value}"`);
  }
  return parsed.format('YYYY-MM-DD');
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'ya' || s === 'yes';
}

function parseRequiredInt(value, fieldLabel, { min, max } = {}) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldLabel} wajib diisi`);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new Error(`${fieldLabel} harus bilangan bulat, dapat: "${value}"`);
  }
  if (min !== undefined && n < min) throw new Error(`${fieldLabel} minimal ${min}`);
  if (max !== undefined && n > max) throw new Error(`${fieldLabel} maksimal ${max}`);
  return n;
}

// Baca sheet "Test Case" dari file upload, validasi tiap baris terhadap master
// data aktual (company/employee/shift) - baris valid dikembalikan siap di-insert,
// baris tidak valid di-skip dengan alasan (bukan all-or-nothing).
async function parseImportFile(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" tidak ditemukan di file - pakai template resmi dari tombol "Download Template".`);
  }

  const companies = await getActiveCompanies();
  const companyIds = new Set(companies.map((c) => c.id));

  const { rows: employees } = await pgPool.query(
    `SELECT id, company_id FROM ms_employees WHERE status = 1 AND COALESCE(is_delete,0) = 0`
  );
  // ms_employees.id bertipe bigint - driver pg mengembalikannya sebagai string, bukan number.
  const employeeCompanyById = new Map(employees.map((e) => [Number(e.id), e.company_id]));

  const { rows: shifts } = await pgPool.query(
    `SELECT id, company_id FROM ms_shifts WHERE status = 1 AND COALESCE(is_delete,0) = 0`
  );
  const shiftCompanyById = new Map(shifts.map((s) => [s.id, s.company_id]));

  const validRows = [];
  const errors = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const testCaseName = String(cellValue(row.getCell(1)) ?? '').trim();
    if (!testCaseName) return; // baris kosong - dilewati, bukan error

    try {
      const companyId = parseRequiredInt(cellValue(row.getCell(2)), 'company_id');
      if (!companyIds.has(companyId)) {
        throw new Error(`company_id ${companyId} tidak ditemukan / tidak aktif (cek sheet Master Company)`);
      }

      const employeeId = parseRequiredInt(cellValue(row.getCell(3)), 'employee_id');
      if (!employeeCompanyById.has(employeeId)) {
        throw new Error(`employee_id ${employeeId} tidak ditemukan / tidak aktif (cek sheet Master Employee)`);
      }
      if (employeeCompanyById.get(employeeId) !== companyId) {
        throw new Error(`employee_id ${employeeId} bukan milik company_id ${companyId}`);
      }

      const shiftRaw = cellValue(row.getCell(4));
      let shiftId = null;
      if (shiftRaw !== null && shiftRaw !== undefined && String(shiftRaw).trim() !== '') {
        shiftId = parseRequiredInt(shiftRaw, 'shift_id');
        if (!shiftCompanyById.has(shiftId)) {
          throw new Error(`shift_id ${shiftId} tidak ditemukan / tidak aktif (cek sheet Master Shift)`);
        }
        if (shiftCompanyById.get(shiftId) !== companyId) {
          throw new Error(`shift_id ${shiftId} bukan milik company_id ${companyId}`);
        }
      }

      const clockIn = parseDateTime(cellValue(row.getCell(5)), 'clock_in');
      const clockOut = parseDateTime(cellValue(row.getCell(6)), 'clock_out');
      const periodDate = parseDateOnly(cellValue(row.getCell(7)), 'period_date');
      const overtimeStart = parseDateTime(cellValue(row.getCell(8)), 'overtime_start');
      const overtimeEnd = parseDateTime(cellValue(row.getCell(9)), 'overtime_end');
      const isBreak = parseBoolean(cellValue(row.getCell(10)));

      const expectedBeforeHours = parseRequiredInt(cellValue(row.getCell(11)), 'expected_before_hours');
      const expectedBeforeMinutes = parseRequiredInt(cellValue(row.getCell(12)), 'expected_before_minutes', {
        min: 0,
        max: 59,
      });
      const expectedAfterHours = parseRequiredInt(cellValue(row.getCell(13)), 'expected_after_hours');
      const expectedAfterMinutes = parseRequiredInt(cellValue(row.getCell(14)), 'expected_after_minutes', {
        min: 0,
        max: 59,
      });

      const testObjectiveRaw = cellValue(row.getCell(15));

      validRows.push({
        test_case_name: testCaseName,
        company_id: companyId,
        employee_id: employeeId,
        shift_id: shiftId,
        clock_in: clockIn,
        clock_out: clockOut,
        period_date: periodDate,
        overtime_start: overtimeStart,
        overtime_end: overtimeEnd,
        is_break: isBreak,
        expected_result_before_rounding: hmToDecimalHours(expectedBeforeHours, expectedBeforeMinutes),
        expected_result_after_rounding: hmToDecimalHours(expectedAfterHours, expectedAfterMinutes),
        test_objective: testObjectiveRaw ? String(testObjectiveRaw).trim() : null,
        _rowNumber: rowNumber,
      });
    } catch (err) {
      errors.push({ row: rowNumber, test_case_name: testCaseName, message: err.message });
    }
  });

  return { validRows, errors };
}

module.exports = { parseImportFile };
