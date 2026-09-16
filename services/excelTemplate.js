const ExcelJS = require('exceljs');
const { pgPool } = require('../config/db');
const { getActiveCompanies } = require('./companyLookup');

// Urutan kolom di sheet "Test Case" - HARUS sinkron dengan parser di routes/overtimeImport.js
const TEST_CASE_COLUMNS = [
  { header: 'test_case_name', width: 30 },
  { header: 'company_id', width: 12 },
  { header: 'employee_id', width: 12 },
  { header: 'shift_id (opsional)', width: 16 },
  { header: 'clock_in (YYYY-MM-DD HH:mm)', width: 24 },
  { header: 'clock_out (YYYY-MM-DD HH:mm)', width: 24 },
  { header: 'period_date (YYYY-MM-DD)', width: 18 },
  { header: 'overtime_start (YYYY-MM-DD HH:mm)', width: 26 },
  { header: 'overtime_end (YYYY-MM-DD HH:mm)', width: 26 },
  { header: 'is_break (TRUE/FALSE)', width: 16 },
  { header: 'expected_before_hours', width: 16 },
  { header: 'expected_before_minutes', width: 18 },
  { header: 'expected_after_hours', width: 16 },
  { header: 'expected_after_minutes', width: 18 },
  { header: 'test_objective (opsional)', width: 35 },
];

function styleHeaderRow(row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
}

async function buildImportTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HR Automation Test Tool';
  workbook.created = new Date();

  // --- Sheet 1: Petunjuk ---
  const petunjuk = workbook.addWorksheet('Petunjuk');
  petunjuk.columns = [{ width: 28 }, { width: 90 }];
  const petunjukRows = [
    ['CARA PENGISIAN', ''],
    ['', ''],
    ['1. Sheet "Test Case"', 'Isi baris demi baris test case yang mau di-import. Baris 1 (header) JANGAN dihapus/diubah urutan kolomnya.'],
    ['2. company_id', 'Wajib diisi. Lihat ID yang valid di sheet "Master Company".'],
    ['3. employee_id', 'Wajib diisi. Lihat ID di sheet "Master Employee" - HARUS employee dari company_id yang sama di baris itu.'],
    ['4. shift_id', 'Opsional, kosongkan kalau tidak ada shift. Lihat ID di sheet "Master Shift" - harus dari company_id yang sama.'],
    ['5. Format tanggal+jam', 'YYYY-MM-DD HH:mm, contoh: 2026-09-10 19:00 (boleh juga isi sebagai cell Date/Time asli di Excel).'],
    ['6. Format tanggal saja', 'YYYY-MM-DD, contoh: 2026-09-10.'],
    ['7. period_date', 'Tanggal kalender utk request overtime - biasanya sama dengan tanggal overtime_start, kecuali shift lewat tengah malam.'],
    ['8. is_break', 'Isi TRUE atau FALSE.'],
    ['9. expected_before/after_hours & minutes', 'Ekspektasi hasil kalkulasi dalam JAM (integer, boleh negatif utk kasus deduction) dan MENIT (0-59).'],
    ['10. test_objective', 'Opsional - catatan tujuan test case ini.'],
    ['11. Kode test case', 'JANGAN diisi - kode (format TC-OT-0001) di-generate otomatis oleh sistem saat import.'],
    ['12. Baris kosong', 'Baris yang test_case_name-nya kosong akan dilewati (tidak di-import, tidak dianggap error).'],
    ['13. Hasil import', 'Baris yang datanya tidak valid (company/employee/shift tidak ketemu, format tanggal salah, dst) akan di-skip dan errornya ditampilkan per baris setelah upload - baris yang valid tetap ke-import.'],
  ];
  petunjukRows.forEach((r, idx) => {
    const row = petunjuk.addRow(r);
    if (idx === 0) row.font = { bold: true, size: 13 };
  });

  // --- Sheet 2: Test Case (yang diisi user) ---
  const testCaseSheet = workbook.addWorksheet('Test Case');
  testCaseSheet.columns = TEST_CASE_COLUMNS;
  styleHeaderRow(testCaseSheet.getRow(1));
  testCaseSheet.views = [{ state: 'frozen', ySplit: 1 }];
  // Dropdown TRUE/FALSE utk kolom is_break (kolom J), berlaku sampai baris 500
  testCaseSheet.dataValidations.add('J2:J500', {
    type: 'list',
    allowBlank: true,
    formulae: ['"TRUE,FALSE"'],
  });

  // --- Sheet 3: Master Company ---
  const companies = await getActiveCompanies();
  const companySheet = workbook.addWorksheet('Master Company');
  companySheet.columns = [
    { header: 'id (isi ini ke company_id)', key: 'id', width: 26 },
    { header: 'name', key: 'name', width: 40 },
  ];
  styleHeaderRow(companySheet.getRow(1));
  companies.forEach((c) => companySheet.addRow(c));

  // --- Sheet 4: Master Employee ---
  const { rows: employees } = await pgPool.query(`
    SELECT id, nik, name, company_id
    FROM ms_employees
    WHERE status = 1 AND COALESCE(is_delete,0) = 0
    ORDER BY company_id, name
  `);
  const employeeSheet = workbook.addWorksheet('Master Employee');
  employeeSheet.columns = [
    { header: 'id (isi ini ke employee_id)', key: 'id', width: 26 },
    { header: 'nik', key: 'nik', width: 20 },
    { header: 'name', key: 'name', width: 35 },
    { header: 'company_id', key: 'company_id', width: 14 },
  ];
  styleHeaderRow(employeeSheet.getRow(1));
  employees.forEach((e) => employeeSheet.addRow(e));

  // --- Sheet 5: Master Shift ---
  const { rows: shifts } = await pgPool.query(`
    SELECT id, name, company_id, start_time, end_time
    FROM ms_shifts
    WHERE status = 1 AND COALESCE(is_delete,0) = 0
    ORDER BY company_id, name
  `);
  const shiftSheet = workbook.addWorksheet('Master Shift');
  shiftSheet.columns = [
    { header: 'id (isi ini ke shift_id)', key: 'id', width: 26 },
    { header: 'name', key: 'name', width: 30 },
    { header: 'company_id', key: 'company_id', width: 14 },
    { header: 'start_time', key: 'start_time', width: 14 },
    { header: 'end_time', key: 'end_time', width: 14 },
  ];
  styleHeaderRow(shiftSheet.getRow(1));
  shifts.forEach((s) => shiftSheet.addRow(s));

  return workbook;
}

module.exports = { buildImportTemplateWorkbook, TEST_CASE_COLUMNS };
