const moment = require('moment');
const { pgPool } = require('../config/db');
const { generateRequestNo, MARKER } = require('./dummyAttendanceGenerator');

// Longshift baru dianggap valid kalau clock_out aktual lewat min_end_time shift-nya
// lebih dari ini - nyaring noise dari variance normal (clock_out biasa cuma +0-60
// menit di atas min_end_time).
const LONGSHIFT_EXTRA_THRESHOLD_MINUTES = 90;

// Cek apakah jam `timeOfDay` ('HH:mm:ss') masuk window [start_time, end_time] shift
// tsb - termasuk shift yang lewat tengah malam (start_time > end_time).
function isTimeInShiftWindow(timeOfDay, shift) {
  const { start_time, end_time } = shift;
  if (end_time >= start_time) {
    return timeOfDay >= start_time && timeOfDay <= end_time;
  }
  return timeOfDay >= start_time || timeOfDay <= end_time;
}

function toDateStr(value) {
  return moment(value).format('YYYY-MM-DD');
}

function toMoment(dateValue, timeValue) {
  return moment(`${toDateStr(dateValue)} ${timeValue}`, 'YYYY-MM-DD HH:mm:ss');
}

async function findExistingOvertimeDateKeys(client, employeeIds, startDate, endDate) {
  const { rows } = await client.query(
    `SELECT DISTINCT employee_id, date FROM tr_employeerequestovertimes
     WHERE employee_id = ANY($1::int[]) AND date BETWEEN $2 AND $3`,
    [employeeIds, startDate, endDate]
  );
  return new Set(rows.map((r) => `${r.employee_id}|${toDateStr(r.date)}`));
}

async function insertOvertimeFromAttendance(client, employee, { date, shiftId, start, end, hours }) {
  const requestNo = generateRequestNo('OVT');
  await client.query(
    `INSERT INTO tr_employeerequestovertimes
       (employee_id, company_id, company_name, date, request_no, request_start_time, request_end_time, is_break, shift_id,
        status_request, status, request_total_hour, created_at, created_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,2,1,$9,NOW(),$10)`,
    [employee.id, employee.company_id, employee.company_name, date, requestNo, start.toDate(), end.toDate(), shiftId, hours, MARKER]
  );
}

// Long shift: SATU row rpt_attendances per (date, employee) tapi clock_out-nya
// nyambung ke window shift LAIN (konsisten 2-shift-berturut-turut) - overtime-nya
// cuma porsi tambahan (dari min_end_time shift asli sampai clock_out aktual),
// shift_id tetap ikut shift_id row itu (bukan shift lanjutannya).
function detectLongshift(row, dateStr, shiftsById) {
  const shift = shiftsById.get(row.shift_id);
  if (!shift) return null;

  const expectedEnd = toMoment(dateStr, shift.min_end_time);
  const actualEnd = toMoment(row.clock_out_date, row.clock_out);
  if (!actualEnd.isAfter(expectedEnd.clone().add(LONGSHIFT_EXTRA_THRESHOLD_MINUTES, 'minutes'))) return null;

  const timeOfDay = actualEnd.format('HH:mm:ss');
  const spillsIntoAnotherShift = Array.from(shiftsById.values()).some(
    (s) => s.id !== shift.id && isTimeInShiftWindow(timeOfDay, s)
  );
  if (!spillsIntoAnotherShift) return null;

  const hours = Math.round((actualEnd.diff(expectedEnd, 'minutes') / 60) * 100) / 100;
  return { date: dateStr, shiftId: row.shift_id, start: expectedEnd, end: actualEnd, hours };
}

// Gap shift: DUA row rpt_attendances beda shift_id di tanggal yang sama (2 sesi
// presensi terpisah). User pilih sesi pertama atau kedua (urut jam clock_in) buat
// jadi overtime - overtime-nya SELURUH sesi itu (bukan porsi), krn sesi ini
// dianggap kerja ekstra di luar shift utama hari itu. shift_id ikut shift_id sesi
// yang dipilih.
function detectGapshift(rows, dateStr, session) {
  if (rows.length !== 2 || rows[0].shift_id === rows[1].shift_id) return null;

  const sorted = [...rows].sort((a, b) => toMoment(a.clock_in_date, a.clock_in) - toMoment(b.clock_in_date, b.clock_in));
  const chosen = session === 'second' ? sorted[1] : sorted[0];

  const start = toMoment(chosen.clock_in_date, chosen.clock_in);
  const end = toMoment(chosen.clock_out_date, chosen.clock_out);
  const hours = Math.round((end.diff(start, 'minutes') / 60) * 100) / 100;
  return { date: dateStr, shiftId: chosen.shift_id, start, end, hours };
}

// employees: [{ id, company_id, company_name, name, nik }]
// Scan rpt_attendances (laporan presensi yang sudah kebentuk dari log_attendances)
// buat cari hari long-shift / gap-shift, lalu insert tr_employeerequestovertimes
// PERMANEN utk hari yang cocok. Tanggal yang SUDAH ada overtime request (dari mana
// pun) di-skip - tidak numpuk overtime di hari yang sama.
async function generateOvertimeFromAttendance({
  employees,
  companyId,
  startDate,
  endDate,
  processLongshift,
  processGapshift,
  gapshiftSession = 'first',
}) {
  const client = await pgPool.connect();
  const summary = [];

  try {
    // ms_employees.id itu bigint (dikembalikan sbg string sama driver pg), sedangkan
    // rpt_attendances.employee_id integer (dikembalikan sbg number) - normalisasi ke
    // Number di sini supaya key Map di bawah nyambung (string '566' !== number 566).
    const employeeIds = employees.map((e) => Number(e.id));

    const { rows: shiftRows } = await client.query(
      `SELECT id, start_time, end_time, min_end_time FROM ms_shifts WHERE company_id = $1`,
      [companyId]
    );
    const shiftsById = new Map(shiftRows.map((s) => [s.id, s]));

    const { rows: attendanceRows } = await client.query(
      `SELECT date, employee_id, shift_id, clock_in, clock_in_date, clock_out, clock_out_date
       FROM rpt_attendances
       WHERE employee_id = ANY($1::int[]) AND date BETWEEN $2 AND $3
       ORDER BY employee_id, date`,
      [employeeIds, startDate, endDate]
    );

    const existingOvertimeKeys = await findExistingOvertimeDateKeys(client, employeeIds, startDate, endDate);

    // employee_id -> dateStr -> rows[]
    const groupsByEmployee = new Map();
    for (const row of attendanceRows) {
      const dateStr = toDateStr(row.date);
      if (!groupsByEmployee.has(row.employee_id)) groupsByEmployee.set(row.employee_id, new Map());
      const byDate = groupsByEmployee.get(row.employee_id);
      if (!byDate.has(dateStr)) byDate.set(dateStr, []);
      byDate.get(dateStr).push(row);
    }

    for (const employee of employees) {
      let longshiftCount = 0;
      let gapshiftCount = 0;
      let skippedExisting = 0;
      const byDate = groupsByEmployee.get(Number(employee.id)) || new Map();

      for (const [dateStr, rows] of byDate) {
        const key = `${employee.id}|${dateStr}`;
        if (existingOvertimeKeys.has(key)) {
          skippedExisting++;
          continue;
        }

        let candidate = null;
        if (rows.length === 1 && processLongshift) {
          candidate = detectLongshift(rows[0], dateStr, shiftsById);
          if (candidate) longshiftCount++;
        } else if (rows.length === 2 && processGapshift) {
          candidate = detectGapshift(rows, dateStr, gapshiftSession);
          if (candidate) gapshiftCount++;
        }

        if (candidate) {
          await insertOvertimeFromAttendance(client, employee, candidate);
          existingOvertimeKeys.add(key);
        }
      }

      summary.push({
        employee_id: employee.id,
        name: employee.name,
        longshift: longshiftCount,
        gapshift: gapshiftCount,
        skipped_existing: skippedExisting,
      });
    }

    return summary;
  } finally {
    client.release();
  }
}

module.exports = { generateOvertimeFromAttendance };
