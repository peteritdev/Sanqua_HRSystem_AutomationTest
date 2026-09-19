const express = require('express');
const router = express.Router();
const moment = require('moment');
const { pgPool } = require('../config/db');
const { getActiveCompanies } = require('../services/companyLookup');
const { generateAttendanceAndShift } = require('../services/dummyAttendanceGenerator');

// GET /dummy-data/attendance-shift - form
router.get('/', async (req, res, next) => {
  try {
    const companies = await getActiveCompanies();
    res.render('dummyData/attendanceShift', { companies, result: null, formData: {} });
  } catch (err) {
    next(err);
  }
});

// POST /dummy-data/attendance-shift - generate presensi/izin/off/overtime, INSERT PERMANEN
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
    const overtimeTotalHours = parseFloat(req.body.overtime_total_hours) || 0;
    const overtimeRequestCount = parseInt(req.body.overtime_request_count, 10) || 0;

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

    const summary = await generateAttendanceAndShift({
      employees,
      startDate,
      endDate,
      sickCount,
      abstainCount,
      offCount,
      shiftIds,
      overtimeTotalHours,
      overtimeRequestCount,
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
