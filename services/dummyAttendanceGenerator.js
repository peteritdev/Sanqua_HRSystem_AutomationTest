const moment = require('moment');
const { pgPool } = require('../config/db');

const MARKER = 'automation-dummy-generator';
const SICK_PERMISSION_TYPE_ID = 2; // "SAKIT" di ms_permissiontypes
const OFF_SHIFT_ID = 4; // ms_shifts id=4 = "OFF" - placeholder khusus hari libur (konvensi data asli)

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dateRangeList(startDate, endDate) {
  const dates = [];
  let cursor = moment(startDate);
  const end = moment(endDate);
  while (cursor.isSameOrBefore(end)) {
    dates.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return dates;
}

// Ambil N tanggal random (tanpa duplikat) dari pool - kalau N > pool.length, ambil semua pool.
function takeRandomDates(pool, n) {
  const shuffled = shuffle(pool);
  return shuffled.slice(0, Math.min(n, pool.length));
}

// Cari Shift 1/2/3 (by name persis) utk 1 company - dipakai fitur longshift/gap-shift
// yang khusus pola 3-shift standar ini saja (bukan shift lain).
async function getNamedShifts(companyId) {
  const { rows } = await pgPool.query(
    `SELECT id, name, start_time, end_time, min_end_time FROM ms_shifts
     WHERE company_id = $1 AND name IN ('Shift 1','Shift 2','Shift 3') AND status = 1 AND COALESCE(is_delete,0) = 0`,
    [companyId]
  );
  const byName = new Map(rows.map((s) => [s.name, s]));
  return { shift1: byName.get('Shift 1'), shift2: byName.get('Shift 2'), shift3: byName.get('Shift 3') };
}

async function insertSickPermission(client, employee, date) {
  await client.query(
    `INSERT INTO tr_employeerequestpermissions
       (employee_id, employee_name, company_id, company_name, permission_type_id, permission_type_name,
        start_date, end_date, permission_reason, status_permission, status,
        hr_confirmed_at, hr_confirmed_by_name, total_permission_date,
        created_at, created_by_name)
     VALUES ($1,$2,$3,$4,$5,'SAKIT',$6,$6,'Sakit (dummy generated)',2,1,NOW(),$7,1,NOW(),$7)`,
    [employee.id, employee.name, employee.company_id, employee.company_name, SICK_PERMISSION_TYPE_ID, date, MARKER]
  );
}

// entries: [{ shiftId, isOff }, ...] - biasanya 1 entry, tapi gap-shift (2 shift terpisah
// non-longshift dalam 1 hari) butuh 2 row sekaligus utk tanggal yang sama.
async function replaceShiftScheduleForDate(client, employee, date, entries) {
  // Shift di-random tiap generate, jadi PK (date, employee_id, shift_id) TIDAK bisa
  // diandalkan sebagai kunci konflik - hapus dulu row lama utk (employee_id, date)
  // apapun shift_id-nya, baru insert yang baru - generate ulang jadi selalu bersih.
  await client.query(`DELETE FROM ms_employeeshiftschedules WHERE employee_id = $1 AND date = $2`, [employee.id, date]);
  for (const { shiftId, isOff } of entries) {
    await client.query(
      `INSERT INTO ms_employeeshiftschedules (employee_id, date, shift_id, is_off, status, created_at, created_by_name)
       VALUES ($1,$2,$3,$4,1,NOW(),$5)`,
      [employee.id, date, shiftId, isOff, MARKER]
    );
  }
}

function randomShift(shiftsById, shiftIds) {
  if (!shiftIds.length) return null;
  const id = shiftIds[randomInt(0, shiftIds.length - 1)];
  return shiftsById.get(id) || null;
}

// Tanggal "min_end_time" jatuh di hari berikutnya kalau shift-nya lewat tengah
// malam (misal Shift 1: start 23:00, min_end_time 07:00 -> itu 07:00 KEESOKAN
// harinya, bukan di hari yang sama sebelum jam start).
function resolveEndDate(date, startTime, endTimeRef) {
  return endTimeRef < startTime ? moment(date).add(1, 'day').format('YYYY-MM-DD') : date;
}

async function insertAttendanceRow(client, employee, attendanceTime, periodDate, shiftId, deviceId, deviceCode) {
  await client.query(
    `INSERT INTO log_attendances
       (device_code, employee_code, attendance_time, employee_name, device_type, employee_id,
        is_valid_attendance, device_id, period_date, shift_id, attend_description, created_at, updated_at)
     VALUES ($1,$2,$3,$4,1,$5,true,$6,$7,$8,$9,NOW(),NOW())`,
    [deviceCode, employee.nik, attendanceTime, employee.name, employee.id, deviceId, periodDate, shiftId, MARKER]
  );
}

// `date` di sini = ATTRIBUTION day (= period_date, sama kayak ms_employeeshiftschedules.date
// utk tanggal ini) - BUKAN tanggal shift mulai. Kalau shift lewat tengah malam (mis.
// Shift 1 23:00-07:00), clock_in otomatis mundur ke MALAM SEBELUM `date` (konfirmasi
// dari data asli: clock-in 23:00 tetap di-atribusikan ke period_date paginya).
// Konsisten sama insertLongshiftAttendance, supaya 2 kategori (hari biasa/longshift/
// gap-shift) yang sama-sama butuh clock-in Shift 1 tidak pernah rebutan malam yang sama.
async function insertAttendanceLog(client, employee, date, shift, deviceId, deviceCode) {
  const startTime = shift ? shift.start_time : '08:30:00';
  const minEndTime = shift ? shift.min_end_time : '17:00:00';
  const crossesMidnight = minEndTime < startTime;
  const clockInDate = crossesMidnight ? moment(date).subtract(1, 'day').format('YYYY-MM-DD') : date;

  // clock_in tidak boleh lewat dari start_time - selalu pas atau lebih awal (maks 15
  // menit lebih awal), supaya tidak pernah ada yang telat.
  const clockIn = moment(`${clockInDate} ${startTime}`, 'YYYY-MM-DD HH:mm:ss').add(randomInt(-15, 0), 'minutes');
  // clock_out tidak boleh di bawah min_end_time - kalau digenerate, pas atau lebih
  // (lebihnya maks 1 jam), sesuai instruksi.
  const clockOut = moment(`${date} ${minEndTime}`, 'YYYY-MM-DD HH:mm:ss').add(randomInt(0, 60), 'minutes');

  const shiftId = shift ? shift.id : null;

  await insertAttendanceRow(client, employee, clockIn.toDate(), date, shiftId, deviceId, deviceCode);
  await insertAttendanceRow(client, employee, clockOut.toDate(), date, shiftId, deviceId, deviceCode);
}

// Longshift: 2 shift berurutan (Shift 1 -> Shift 2) dianggap SATU presensi -
// clock_in di awal shift pertama, clock_out di akhir shift kedua. BUKAN 2 presensi
// terpisah per shift.
async function insertLongshiftAttendance(client, employee, date, shiftFirst, shiftSecond, deviceId, deviceCode) {
  const crossesMidnight = shiftFirst.min_end_time < shiftFirst.start_time;
  const clockInDate = crossesMidnight ? moment(date).subtract(1, 'day').format('YYYY-MM-DD') : date;
  const clockIn = moment(`${clockInDate} ${shiftFirst.start_time}`, 'YYYY-MM-DD HH:mm:ss').add(randomInt(-15, 0), 'minutes');
  const clockOut = moment(`${date} ${shiftSecond.min_end_time}`, 'YYYY-MM-DD HH:mm:ss').add(randomInt(0, 60), 'minutes');

  await insertAttendanceRow(client, employee, clockIn.toDate(), date, shiftFirst.id, deviceId, deviceCode);
  await insertAttendanceRow(client, employee, clockOut.toDate(), date, shiftFirst.id, deviceId, deviceCode);
}

async function insertOvertimeRequest(client, employee, date, shift, hours) {
  const startTime = shift ? shift.start_time : '08:30:00';
  const minEndTime = shift ? shift.min_end_time : '17:00:00';
  // Sama kayak clock_out - overtime baru mulai setelah min_end_time, dan kalau
  // shift-nya lewat tengah malam, itu jatuh di hari berikutnya (bukan hari yang sama).
  const startDate = resolveEndDate(date, startTime, minEndTime);
  const start = moment(`${startDate} ${minEndTime}`, 'YYYY-MM-DD HH:mm:ss');
  const end = start.clone().add(hours, 'hours');

  await client.query(
    `INSERT INTO tr_employeerequestovertimes
       (employee_id, company_id, date, request_start_time, request_end_time, is_break, shift_id,
        status_request, status, request_total_hour, created_at, created_by_name)
     VALUES ($1,$2,$3,$4,$5,false,$6,2,1,$7,NOW(),$8)`,
    [employee.id, employee.company_id, date, start.toDate(), end.toDate(), shift ? shift.id : null, hours, MARKER]
  );
}

// employees: [{ id, nik, name, company_id, company_name, is_shift }]
// shiftIds: array of shift_id (multi-select) - tiap hari kerja "biasa" di-random pilih 1
// dari sini ("1 hari maksimal 1 shift"; kalau hari itu kena lembur, lembur ikut shift
// hari itu juga).
// longshiftCount/gapshiftCount: khusus pola Shift 1/2/3 standar (by name) -
//   longshift  = Shift 1 -> Shift 2, SATU presensi menerus (bukan per-shift).
//   gapshift   = Shift 1 & Shift 3 (lompat Shift 2), DUA presensi terpisah hari sama.
async function generateAttendanceAndShift({
  employees,
  startDate,
  endDate,
  sickCount,
  abstainCount,
  offCount,
  shiftIds,
  overtimeTotalHours,
  overtimeRequestCount,
  longshiftCount = 0,
  gapshiftCount = 0,
}) {
  const client = await pgPool.connect();
  const summary = [];

  try {
    let shiftsById = new Map();
    if (shiftIds && shiftIds.length) {
      const { rows } = await client.query('SELECT id, name, start_time, end_time, min_end_time FROM ms_shifts WHERE id = ANY($1::int[])', [
        shiftIds,
      ]);
      shiftsById = new Map(rows.map((s) => [s.id, s]));
    }

    let namedShifts = { shift1: null, shift2: null, shift3: null };
    if ((longshiftCount > 0 || gapshiftCount > 0) && employees.length) {
      namedShifts = await getNamedShifts(employees[0].company_id);
    }

    const { rows: devices } = await client.query('SELECT id, code FROM ms_attendancedevices LIMIT 1');
    const device = devices[0] || { id: null, code: 'DUMMY-DEVICE' };

    const allDates = dateRangeList(startDate, endDate);

    for (const employee of employees) {
      let pool = [...allDates];

      const sickDates = takeRandomDates(pool, sickCount);
      pool = pool.filter((d) => !sickDates.includes(d));

      const abstainDates = takeRandomDates(pool, abstainCount);
      pool = pool.filter((d) => !abstainDates.includes(d));

      // Sisa `pool` = kandidat hari kerja normal.
      let offDates = [];
      let workingDates = pool;
      if (employee.is_shift && offCount > 0) {
        offDates = takeRandomDates(pool, offCount);
        workingDates = pool.filter((d) => !offDates.includes(d));
      }

      // Longshift & gap-shift diambil dari sisa hari kerja SEBELUM random-shift biasa,
      // supaya tidak dobel-pakai tanggal yang sama.
      let longshiftDates = [];
      let gapshiftDates = [];
      if (employee.is_shift && namedShifts.shift1 && namedShifts.shift2 && longshiftCount > 0) {
        longshiftDates = takeRandomDates(workingDates, longshiftCount);
        workingDates = workingDates.filter((d) => !longshiftDates.includes(d));
      }
      if (employee.is_shift && namedShifts.shift1 && namedShifts.shift3 && gapshiftCount > 0) {
        gapshiftDates = takeRandomDates(workingDates, gapshiftCount);
        workingDates = workingDates.filter((d) => !gapshiftDates.includes(d));
      }

      let overtimeDates = [];
      if (employee.is_shift && overtimeRequestCount > 0 && overtimeTotalHours > 0) {
        overtimeDates = takeRandomDates(workingDates, overtimeRequestCount);
      }

      // 1 hari kerja "biasa" = 1 shift, di-random per tanggal dari shift yang dipilih
      // di form - dipakai konsisten buat schedule/attendance/overtime tanggal yang
      // sama, jadi lembur di hari itu otomatis ikut shift hari itu juga. Hari OFF
      // selalu pakai shift_id=4 ("OFF", konvensi data asli) - bukan random dari pool.
      // (insertAttendanceLog & insertLongshiftAttendance sama2 pakai semantik
      // "date = attribution day", jadi antar tanggal berbeda TIDAK PERNAH rebutan
      // malam clock-in yang sama - tidak perlu penghindaran manual di sini.)
      const dateShift = new Map();
      for (const date of workingDates) {
        dateShift.set(date, randomShift(shiftsById, shiftIds || []));
      }

      await client.query('BEGIN');

      for (const date of sickDates) {
        await insertSickPermission(client, employee, date);
      }

      if (employee.is_shift) {
        for (const date of offDates) {
          await replaceShiftScheduleForDate(client, employee, date, [{ shiftId: OFF_SHIFT_ID, isOff: true }]);
        }
        for (const date of workingDates) {
          const shift = dateShift.get(date);
          await replaceShiftScheduleForDate(client, employee, date, [{ shiftId: shift ? shift.id : null, isOff: false }]);
        }
        for (const date of longshiftDates) {
          // Roster dicatat pakai shift pertama (Shift 1) - 1 row, sesuai konvensi
          // longshift yang direpresentasikan sbg satu presensi menerus.
          await replaceShiftScheduleForDate(client, employee, date, [{ shiftId: namedShifts.shift1.id, isOff: false }]);
        }
        for (const date of gapshiftDates) {
          // 2 shift independen hari yang sama -> 2 row roster (Shift 1 & Shift 3).
          await replaceShiftScheduleForDate(client, employee, date, [
            { shiftId: namedShifts.shift1.id, isOff: false },
            { shiftId: namedShifts.shift3.id, isOff: false },
          ]);
        }
      }

      for (const date of workingDates) {
        await insertAttendanceLog(client, employee, date, dateShift.get(date), device.id, device.code);
      }
      for (const date of longshiftDates) {
        await insertLongshiftAttendance(client, employee, date, namedShifts.shift1, namedShifts.shift2, device.id, device.code);
      }
      for (const date of gapshiftDates) {
        await insertAttendanceLog(client, employee, date, namedShifts.shift1, device.id, device.code);
        await insertAttendanceLog(client, employee, date, namedShifts.shift3, device.id, device.code);
      }

      if (overtimeDates.length) {
        const perRequestHours = Math.round((overtimeTotalHours / overtimeDates.length) * 100) / 100;
        for (const date of overtimeDates) {
          await insertOvertimeRequest(client, employee, date, dateShift.get(date), perRequestHours);
        }
      }

      await client.query('COMMIT');

      summary.push({
        employee_id: employee.id,
        name: employee.name,
        sick: sickDates.length,
        abstain: abstainDates.length,
        off: offDates.length,
        longshift: longshiftDates.length,
        gapshift: gapshiftDates.length,
        working: workingDates.length,
        overtime_requests: overtimeDates.length,
      });
    }

    return summary;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { generateAttendanceAndShift, getNamedShifts, MARKER };
