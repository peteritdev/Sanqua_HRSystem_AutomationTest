const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const TsLog = require('../models/TsLog');
const { decimalHoursToLabel } = require('../utils/timeFormat');

const PAGE_SIZE = 20;

// GET /overtime/logs - list log run, filter by status/date/run_id
router.get('/', async (req, res, next) => {
  try {
    const { status, date_from, date_to, run_id } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const where = { module_name: 'overtime' };
    if (status) where.status = status;
    if (run_id) where.run_id = run_id;
    if (date_from || date_to) {
      where.log_time = {};
      if (date_from) where.log_time[Op.gte] = new Date(`${date_from}T00:00:00`);
      if (date_to) where.log_time[Op.lte] = new Date(`${date_to}T23:59:59`);
    }

    const { rows, count } = await TsLog.findAndCountAll({
      where,
      order: [['log_time', 'DESC']],
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });

    res.render('logs/list', {
      logs: rows,
      filters: { status: status || '', date_from: date_from || '', date_to: date_to || '', run_id: run_id || '' },
      page,
      totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
      totalCount: count,
      formatHM: decimalHoursToLabel,
    });
  } catch (err) {
    next(err);
  }
});

// POST /overtime/logs/clear - hapus semua log run (history), tidak mengubah
// last_run_status/last_run_at di master test case (itu status "hasil run terakhir"
// yang independen dari histori log).
router.post('/clear', async (req, res, next) => {
  try {
    await TsLog.destroy({ where: { module_name: 'overtime' } });
    res.redirect('/overtime/logs');
  } catch (err) {
    next(err);
  }
});

// GET /overtime/logs/:run_id - detail satu batch run
router.get('/:run_id', async (req, res, next) => {
  try {
    const rows = await TsLog.findAll({
      where: { run_id: req.params.run_id },
      order: [['id', 'ASC']],
    });

    if (!rows.length) return res.status(404).send('Run tidak ditemukan');

    res.render('logs/detail', { logs: rows, runId: req.params.run_id, formatHM: decimalHoursToLabel });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
