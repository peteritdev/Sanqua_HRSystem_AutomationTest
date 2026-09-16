const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { randomUUID } = require('crypto');
const moment = require('moment');

const { pgPool } = require('../config/db');
const TsMsOvertimeCondition = require('../models/TsMsOvertimeCondition');
const TsLog = require('../models/TsLog');
const overtimeRunner = require('../runners/overtimeRunner');
const { getActiveCompanies } = require('../services/companyLookup');
const { decimalHoursToHM, decimalHoursToLabel, hmToDecimalHours } = require('../utils/timeFormat');

const validateConditionForm = [
  body('test_case_name').trim().notEmpty().withMessage('Nama test case wajib diisi'),
  body('company_id').isInt({ min: 1 }).withMessage('Company wajib dipilih'),
  body('employee_id').isInt({ min: 1 }).withMessage('Employee wajib dipilih'),
  body('shift_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Shift tidak valid'),
  body('clock_in').notEmpty().withMessage('Clock in wajib diisi'),
  body('clock_out').notEmpty().withMessage('Clock out wajib diisi'),
  body('period_date').notEmpty().withMessage('Period date wajib diisi'),
  body('overtime_start').notEmpty().withMessage('Overtime start wajib diisi'),
  body('overtime_end').notEmpty().withMessage('Overtime end wajib diisi'),
  body('expected_result_before_rounding_hours').isInt().withMessage('Expected (before rounding) - jam harus angka'),
  body('expected_result_before_rounding_minutes')
    .isInt({ min: 0, max: 59 })
    .withMessage('Expected (before rounding) - menit harus 0-59'),
  body('expected_result_after_rounding_hours').isInt().withMessage('Expected (after rounding) - jam harus angka'),
  body('expected_result_after_rounding_minutes')
    .isInt({ min: 0, max: 59 })
    .withMessage('Expected (after rounding) - menit harus 0-59'),
];

function toConditionPayload(formBody, testerName) {
  return {
    test_case_name: formBody.test_case_name.trim(),
    company_id: Number(formBody.company_id),
    employee_id: Number(formBody.employee_id),
    shift_id: formBody.shift_id ? Number(formBody.shift_id) : null,
    clock_in: formBody.clock_in,
    clock_out: formBody.clock_out,
    is_break: formBody.is_break === 'on' || formBody.is_break === 'true',
    period_date: formBody.period_date,
    overtime_start: formBody.overtime_start,
    overtime_end: formBody.overtime_end,
    test_objective: formBody.test_objective || null,
    expected_result_before_rounding: hmToDecimalHours(
      formBody.expected_result_before_rounding_hours,
      formBody.expected_result_before_rounding_minutes
    ),
    expected_result_after_rounding: hmToDecimalHours(
      formBody.expected_result_after_rounding_hours,
      formBody.expected_result_after_rounding_minutes
    ),
    updated_by: testerName,
  };
}

async function getEmployeesForCompany(companyId) {
  if (!companyId) return [];
  const { rows } = await pgPool.query(
    `SELECT id, nik, name FROM ms_employees WHERE company_id = $1 AND status = 1 AND COALESCE(is_delete,0) = 0 ORDER BY name`,
    [companyId]
  );
  return rows;
}

async function getShiftsForCompany(companyId) {
  if (!companyId) return [];
  const { rows } = await pgPool.query(
    `SELECT id, name FROM ms_shifts WHERE company_id = $1 AND status = 1 AND COALESCE(is_delete,0) = 0 ORDER BY name`,
    [companyId]
  );
  return rows;
}

async function writeLogAndUpdateCondition({ runId, condition, result, triggeredBy }) {
  await TsLog.create({
    run_id: runId,
    module_name: overtimeRunner.moduleName,
    condition_id: condition.id,
    test_data_condition: condition.toJSON(),
    expected_result: {
      before_rounding: Number(condition.expected_result_before_rounding),
      after_rounding: Number(condition.expected_result_after_rounding),
    },
    actual_result: result.actual_result || {},
    status: result.status,
    error_message: result.error_message || null,
    duration_ms: result.duration_ms || null,
    triggered_by: triggeredBy || 'anonymous',
  });

  await condition.update({
    actual_result_before_rounding:
      result.actual_result && result.actual_result.before_rounding !== undefined
        ? result.actual_result.before_rounding
        : null,
    actual_result_after_rounding:
      result.actual_result && result.actual_result.after_rounding !== undefined
        ? result.actual_result.after_rounding
        : null,
    last_run_status: result.status,
    last_run_at: new Date(),
  });
}

// GET /overtime - grid test condition
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pgPool.query(`
      SELECT oc.*, e.name AS employee_name, e.nik AS employee_nik, s.name AS shift_name
      FROM ts_ms_overtimeconditions oc
      LEFT JOIN ms_employees e ON e.id = oc.employee_id
      LEFT JOIN ms_shifts s ON s.id = oc.shift_id
      WHERE oc.is_active = true
      ORDER BY oc.id DESC
    `);

    // company_id = ms_plants.id (DB esanqua) - lihat services/companyLookup.js
    const companies = await getActiveCompanies();
    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
    const conditions = rows.map((row) => ({
      ...row,
      company_name: companyNameById.get(row.company_id) || row.company_id,
    }));

    res.render('overtime/list', { conditions, formatHM: decimalHoursToLabel });
  } catch (err) {
    next(err);
  }
});

// GET /overtime/new - form tambah
router.get('/new', async (req, res, next) => {
  try {
    const companies = await getActiveCompanies();
    res.render('overtime/form', {
      mode: 'create',
      condition: null,
      companies,
      employees: [],
      shifts: [],
      errors: [],
      formData: {},
      moment,
      decimalHoursToHM,
    });
  } catch (err) {
    next(err);
  }
});

// POST /overtime/new
router.post('/new', validateConditionForm, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const companies = await getActiveCompanies();
      const employees = await getEmployeesForCompany(Number(req.body.company_id));
      const shifts = await getShiftsForCompany(Number(req.body.company_id));
      return res.status(400).render('overtime/form', {
        mode: 'create',
        condition: null,
        companies,
        employees,
        shifts,
        errors: errors.array(),
        formData: req.body,
        moment,
        decimalHoursToHM,
      });
    }

    const payload = toConditionPayload(req.body, req.testerName);
    payload.created_by = req.testerName;
    await TsMsOvertimeCondition.create(payload);
    res.redirect('/overtime');
  } catch (err) {
    next(err);
  }
});

// GET /overtime/:id/edit
router.get('/:id/edit', async (req, res, next) => {
  try {
    const condition = await TsMsOvertimeCondition.findByPk(req.params.id);
    if (!condition) return res.status(404).send('Test case tidak ditemukan');

    const companies = await getActiveCompanies();
    const employees = await getEmployeesForCompany(condition.company_id);
    const shifts = await getShiftsForCompany(condition.company_id);

    res.render('overtime/form', {
      mode: 'edit',
      condition,
      companies,
      employees,
      shifts,
      errors: [],
      formData: {},
      moment,
      decimalHoursToHM,
    });
  } catch (err) {
    next(err);
  }
});

// POST /overtime/:id/edit
router.post('/:id/edit', validateConditionForm, async (req, res, next) => {
  try {
    const condition = await TsMsOvertimeCondition.findByPk(req.params.id);
    if (!condition) return res.status(404).send('Test case tidak ditemukan');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const companies = await getActiveCompanies();
      const employees = await getEmployeesForCompany(Number(req.body.company_id));
      const shifts = await getShiftsForCompany(Number(req.body.company_id));
      return res.status(400).render('overtime/form', {
        mode: 'edit',
        condition,
        companies,
        employees,
        shifts,
        errors: errors.array(),
        formData: req.body,
        moment,
        decimalHoursToHM,
      });
    }

    const payload = toConditionPayload(req.body, req.testerName);
    await condition.update(payload);
    res.redirect('/overtime');
  } catch (err) {
    next(err);
  }
});

// POST /overtime/:id/delete - soft delete
router.post('/:id/delete', async (req, res, next) => {
  try {
    const condition = await TsMsOvertimeCondition.findByPk(req.params.id);
    if (!condition) return res.status(404).send('Test case tidak ditemukan');
    await condition.update({ is_active: false, updated_by: req.testerName });
    res.redirect('/overtime');
  } catch (err) {
    next(err);
  }
});

// POST /overtime/:id/run - run 1 kondisi (AJAX)
router.post('/:id/run', async (req, res, next) => {
  try {
    const condition = await TsMsOvertimeCondition.findByPk(req.params.id);
    if (!condition || !condition.is_active) {
      return res.status(404).json({ error: 'Test case tidak ditemukan' });
    }

    const runId = randomUUID();
    const result = await overtimeRunner.run(condition);
    await writeLogAndUpdateCondition({ runId, condition, result, triggeredBy: req.testerName });

    res.json({
      run_id: runId,
      status: result.status,
      passed: result.passed,
      actual_result: result.actual_result,
      error_message: result.error_message || null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /overtime/run-all - run semua kondisi aktif (AJAX), satu run_id
router.post('/run-all', async (req, res, next) => {
  try {
    const conditions = await TsMsOvertimeCondition.findAll({ where: { is_active: true } });
    const runId = randomUUID();
    let passedCount = 0;
    let notPassedCount = 0;
    let errorCount = 0;

    for (const condition of conditions) {
      const result = await overtimeRunner.run(condition);
      await writeLogAndUpdateCondition({ runId, condition, result, triggeredBy: req.testerName });
      if (result.status === 'passed') passedCount++;
      else if (result.status === 'not_passed') notPassedCount++;
      else errorCount++;
    }

    res.json({
      run_id: runId,
      total: conditions.length,
      passed: passedCount,
      not_passed: notPassedCount,
      error: errorCount,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
