const express = require('express');
const router = express.Router();
const moment = require('moment');
const { pgPool } = require('../config/db');
const { getActiveCompanies } = require('../services/companyLookup');
const { generateAttendanceAndShift, getNamedShifts } = require('../services/dummyAttendanceGenerator');

// GET /dummy-data/attendance-shift - form
router.get('/', async (req, res, next) => {
  try {
    const companies = await getActiveCompanies();
    res.render('dummyData/attendanceShift', { companies, result: null, formData: {} });
  } catch (err) {
    next(err);
  }
});

// POST /dummy-data/attendance-shift - generate presensi/izin/off/jadwal shift, INSERT PERMANEN
router.post('/', async (req, res, next) => {
  try {
    const companyId = Number(req.body.company_id);
    const employeeIds = [].concat(req.body.employee_ids || []).map(Number).filter(Boolean);
    const startDate = req.body.start_date;
    const endDate = req.body.end_date;
    const sickCount = parseInt(req.body.sick_count, 10) || 0;
    const abstainCount = parseInt(req.body.abstain_count, 10) || 0;
    const offCount = parseInt(req.body.off_count, 10) || 0;
    const shiftIds = [].concat(req.body.shift_ids || []).map(Number).filter(Boolean);
    const longshiftCount = parseInt(req.body.longshift_count, 10) || 0;
    const longshiftMode = req.body.longshift_mode === 'hours' ? 'hours' : 'full';
    const longshiftHours = parseFloat(req.body.longshift_hours) || 0;
    const gapshiftCount = parseInt(req.body.gapshift_count, 10) || 0;
    const gapshiftMode = req.body.gapshift_mode === 'hours' ? 'hours' : 'full';
    const gapshiftHours = parseFloat(req.body.gapshift_hours) || 0;

    const companies = await getActiveCompanies();

    if (!companyId || !employeeIds.length || !startDate || !endDate) {
      return res.status(400).render('dummyData/attendanceShift', {
        companies,
        result: { error: 'Company, minimal 1 employee, dan rentang tanggal wajib diisi' },
        formData: req.body,
      });
    }
    if (moment(startDate).isAfter(moment(endDate))) {
      return res.status(400).render('dummyData/attendanceShift', {
        companies,
        result: { error: 'Tanggal mulai tidak boleh setelah tanggal akhir' },
        formData: req.body,
      });
    }

    const { rows: employees } = await pgPool.query(
      `SELECT id, nik, name, company_id, company_name, is_shift FROM ms_employees WHERE id = ANY($1::int[])`,
      [employeeIds]
    );

    if (employees.some((e) => e.is_shift) && !shiftIds.length) {
      return res.status(400).render('dummyData/attendanceShift', {
        companies,
        result: { error: 'Ada employee is_shift=true di batch ini - minimal 1 shift wajib dipilih' },
        formData: req.body,
      });
    }

    if (longshiftCount > 0 || gapshiftCount > 0) {
      const { shift1, shift2, shift3 } = await getNamedShifts(companyId);
      if (longshiftCount > 0 && (!shift1 || !shift2)) {
        return res.status(400).render('dummyData/attendanceShift', {
          companies,
          result: { error: 'Long Shift butuh "Shift 1" dan "Shift 2" (by name) aktif di company ini' },
          formData: req.body,
        });
      }
      if (gapshiftCount > 0 && (!shift1 || !shift3)) {
        return res.status(400).render('dummyData/attendanceShift', {
          companies,
          result: { error: 'Double Shift (gap) butuh "Shift 1" dan "Shift 3" (by name) aktif di company ini' },
          formData: req.body,
        });
      }
    }
    if (longshiftCount > 0 && longshiftMode === 'hours' && longshiftHours <= 0) {
      return res.status(400).render('dummyData/attendanceShift', {
        companies,
        result: { error: 'Long Shift mode "berapa jam" butuh jumlah jam > 0' },
        formData: req.body,
      });
    }
    if (gapshiftCount > 0 && gapshiftMode === 'hours' && gapshiftHours <= 0) {
      return res.status(400).render('dummyData/attendanceShift', {
        companies,
        result: { error: 'Double Shift (gap) mode "berapa jam" butuh jumlah jam > 0' },
        formData: req.body,
      });
    }

    const summary = await generateAttendanceAndShift({
      employees,
      startDate,
      endDate,
      sickCount,
      abstainCount,
      offCount,
      shiftIds,
      longshiftCount,
      longshiftMode,
      longshiftHours,
      gapshiftCount,
      gapshiftMode,
      gapshiftHours,
    });

    res.render('dummyData/attendanceShift', {
      companies,
      result: { summary },
      formData: {},
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
