const express = require('express');
const router = express.Router();
const { pgPool } = require('../config/db');
const { getActiveCompanies } = require('../services/companyLookup');

// Endpoint internal same-origin buat populate dropdown form - bukan API eksternal.

router.get('/companies', async (req, res, next) => {
  try {
    const companies = await getActiveCompanies();
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

router.get('/shifts', async (req, res, next) => {
  try {
    const companyId = Number(req.query.company_id);
    if (!companyId) return res.json([]);
    const { rows } = await pgPool.query(
      `SELECT id, name, start_time, end_time FROM ms_shifts
       WHERE company_id = $1 AND status = 1 AND COALESCE(is_delete,0) = 0
       ORDER BY name`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/employees', async (req, res, next) => {
  try {
    const companyId = Number(req.query.company_id);
    if (!companyId) return res.json([]);
    const q = (req.query.q || '').trim();
    const params = [companyId];
    let where = `company_id = $1 AND status = 1 AND COALESCE(is_delete,0) = 0`;
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (name ILIKE $2 OR nik ILIKE $2)`;
    }
    const { rows } = await pgPool.query(
      `SELECT id, nik, name, is_shift FROM ms_employees WHERE ${where} ORDER BY name LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
