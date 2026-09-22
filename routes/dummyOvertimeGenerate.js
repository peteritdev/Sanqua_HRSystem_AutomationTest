const express = require('express');
const router = express.Router();
const moment = require('moment');
const { pgPool } = require('../config/db');
const { getActiveCompanies } = require('../services/companyLookup');
const { generateOvertimeFromAttendance } = require('../services/dummyOvertimeGenerator');

// GET /dummy-data/overtime-generate - form
router.get('/', async (req, res, next) => {
  try {
    const companies = await getActiveCompanies();
    res.render('dummyData/overtimeGenerate', { companies, result: null, formData: {} });
  } catch (err) {
    next(err);
  }
});

// POST /dummy-data/overtime-generate - scan rpt_attendances, insert overtime request PERMANEN
router.post('/', async (req, res, next) => {
  try {
    const companyId = Number(req.body.company_id);
    const employeeIds = [].concat(req.body.employee_ids || []).map(Number).filter(Boolean);
    const startDate = req.body.start_date;
    const endDate = req.body.end_date;
    const processLongshift = req.body.process_longshift === 'on';
    const processGapshift = req.body.process_gapshift === 'on';
    const gapshiftSession = req.body.gapshift_session === 'second' ? 'second' : 'first';

    const companies = await getActiveCompanies();

    if (!companyId || !employeeIds.length || !startDate || !endDate) {
      return res.status(400).render('dummyData/overtimeGenerate', {
        companies,
        result: { error: 'Company, minimal 1 employee, dan rentang tanggal wajib diisi' },
        formData: req.body,
      });
    }
    if (moment(startDate).isAfter(moment(endDate))) {
      return res.status(400).render('dummyData/overtimeGenerate', {
        companies,
        result: { error: 'Tanggal mulai tidak boleh setelah tanggal akhir' },
        formData: req.body,
      });
    }
    if (!processLongshift && !processGapshift) {
      return res.status(400).render('dummyData/overtimeGenerate', {
        companies,
        result: { error: 'Pilih minimal salah satu: proses Long Shift atau Gap Shift' },
        formData: req.body,
      });
    }

    const { rows: employees } = await pgPool.query(
      `SELECT id, nik, name, company_id, company_name FROM ms_employees WHERE id = ANY($1::int[])`,
      [employeeIds]
    );

    const summary = await generateOvertimeFromAttendance({
      employees,
      companyId,
      startDate,
      endDate,
      processLongshift,
      processGapshift,
      gapshiftSession,
    });

    res.render('dummyData/overtimeGenerate', {
      companies,
      result: { summary },
      formData: {},
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
