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
  body('schedule_1_date').optional({ checkFalsy: true }).isISO8601().withMessage('Schedule 1: tanggal tidak valid'),
  body('schedule_1_shift_id').custom((value, { req }) => {
    const hasDate = !!req.body.schedule_1_date;
    const isOff = req.body.schedule_1_is_off === 'on' || req.body.schedule_1_is_off === 'true';
    if (hasDate && !isOff && !value) {
      throw new Error('Schedule 1: shift wajib dipilih kalau bukan hari libur (is_off)');
    }
    return true;
  }),
  body('schedule_2_date').optional({ checkFalsy: true }).isISO8601().withMessage('Schedule 2: tanggal tidak valid'),
  body('schedule_2_shift_id').custom((value, { req }) => {
    const hasDate = !!req.body.schedule_2_date;
    const isOff = req.body.schedule_2_is_off === 'on' || req.body.schedule_2_is_off === 'true';
    if (hasDate && !isOff && !value) {
      throw new Error('Schedule 2: shift wajib dipilih kalau bukan hari libur (is_off)');
    }
    return true;
  }),
];

// Baris "Employee Shift Schedule" opsional - kosongkan tanggal utk skip baris itu.
function toScheduleField(formBody, prefix) {
  const date = formBody[`${prefix}_date`];
  if (!date) return { date: null, is_off: false, shift_id: null };
  const isOff = formBody[`${prefix}_is_off`] === 'on' || formBody[`${prefix}_is_off`] === 'true';
  return {
    date,
    is_off: isOff,
    shift_id: isOff ? null : formBody[`${prefix}_shift_id`] ? Number(formBody[`${prefix}_shift_id`]) : null,
  };
}

function toConditionPayload(formBody, testerName) {
  const schedule1 = toScheduleField(formBody, 'schedule_1');
  const schedule2 = toScheduleField(formBody, 'schedule_2');
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
    schedule_1_date: schedule1.date,
    schedule_1_is_off: schedule1.is_off,
    schedule_1_shift_id: schedule1.shift_id,
    schedule_2_date: schedule2.date,
    schedule_2_is_off: schedule2.is_off,
    schedule_2_shift_id: schedule2.shift_id,
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

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// GET /overtime - grid test condition (search + filter status + paging)
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const status = req.query.status || '';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = PAGE_SIZE_OPTIONS.includes(Number(req.query.page_size)) ? Number(req.query.page_size) : 20;

    const whereParts = ['oc.is_active = true'];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      // 1 kolom search cover kode, nama test case, nama employee, & nik employee sekaligus
      whereParts.push(
        `(oc.test_case_code ILIKE $${idx} OR oc.test_case_name ILIKE $${idx} OR e.name ILIKE $${idx} OR e.nik ILIKE $${idx})`
      );
    }

    if (status === 'null') {
      whereParts.push('oc.last_run_status IS NULL');
    } else if (status) {
      params.push(status);
      whereParts.push(`oc.last_run_status = $${params.length}`);
    }

    const whereClause = `WHERE ${whereParts.join(' AND ')}`;
    const joinClause = `
      FROM ts_ms_overtimeconditions oc
      LEFT JOIN ms_employees e ON e.id = oc.employee_id
      LEFT JOIN ms_shifts s ON s.id = oc.shift_id
      ${whereClause}
    `;

    const { rows: countRows } = await pgPool.query(`SELECT COUNT(*) AS total ${joinClause}`, params);
    const totalCount = Number(countRows[0].total);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const dataParams = [...params, pageSize, (page - 1) * pageSize];
    const { rows } = await pgPool.query(
      `SELECT oc.*, e.name AS employee_name, e.nik AS employee_nik, s.name AS shift_name
       ${joinClause}
       ORDER BY oc.id DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    // company_id = ms_plants.id (DB esanqua) - lihat services/companyLookup.js
    const companies = await getActiveCompanies();
    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));
    const conditions = rows.map((row) => ({
      ...row,
      company_name: companyNameById.get(row.company_id) || row.company_id,
    }));

    res.render('overtime/list', {
      conditions,
      formatHM: decimalHoursToLabel,
      filters: { q, status },
      page,
      pageSize,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      totalPages,
      totalCount,
    });
  } catch (err) {
    next(err);
  }
});

// POST /overtime/reset-status - reset last_run_status/actual_result SEMUA test case aktif
router.post('/reset-status', async (req, res, next) => {
  try {
    await TsMsOvertimeCondition.update(
      {
        last_run_status: null,
        last_run_at: null,
        actual_result_before_rounding: null,
        actual_result_after_rounding: null,
      },
      { where: { is_active: true } }
    );
    res.redirect('/overtime');
  } catch (err) {
    next(err);
  }
});

// POST /overtime/delete-all - soft-delete SEMUA test case aktif (sama semantiknya
// dengan tombol Delete per-baris, cuma sekaligus semua)
router.post('/delete-all', async (req, res, next) => {
  try {
    await TsMsOvertimeCondition.update(
      { is_active: false, updated_by: req.testerName },
      { where: { is_active: true } }
    );
    res.redirect('/overtime');
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
