const express = require('express');
const router = express.Router();
const { getActiveCompanies } = require('../services/companyLookup');
const { previewClearData, clearData, TARGETS } = require('../services/dummyDataCleaner');

function parseCommon(body) {
  return {
    companyId: Number(body.company_id) || null,
    employeeIds: [].concat(body.employee_ids || []).map(Number).filter(Boolean),
    startDate: body.start_date,
    endDate: body.end_date,
    tables: [].concat(body.tables || []).filter((k) => TARGETS[k]),
  };
}

function validate({ companyId, employeeIds, startDate, endDate, tables }) {
  if (!companyId) return 'Company wajib dipilih';
  if (!employeeIds.length) return 'Minimal 1 employee wajib dipilih';
  if (!startDate || !endDate) return 'Rentang tanggal wajib diisi';
  if (new Date(startDate) > new Date(endDate)) return 'Tanggal mulai tidak boleh setelah tanggal akhir';
  if (!tables.length) return 'Minimal 1 tabel wajib dipilih';
  return null;
}

// GET /dummy-data/clear - form
router.get('/', async (req, res, next) => {
  try {
    const companies = await getActiveCompanies();
    res.render('dummyData/clear', { companies, targets: TARGETS, preview: null, result: null, error: null, formData: {} });
  } catch (err) {
    next(err);
  }
});

// POST /dummy-data/clear/preview - hitung jumlah row yang akan kehapus (BELUM eksekusi)
router.post('/preview', async (req, res, next) => {
  try {
    const companies = await getActiveCompanies();
    const params = parseCommon(req.body);
    const error = validate(params);
    if (error) {
      return res.status(400).render('dummyData/clear', {
        companies,
        targets: TARGETS,
        preview: null,
        result: null,
        error,
        formData: req.body,
      });
    }

    const preview = await previewClearData(params);
    res.render('dummyData/clear', {
      companies,
      targets: TARGETS,
      preview,
      result: null,
      error: null,
      formData: req.body,
    });
  } catch (err) {
    next(err);
  }
});

// POST /dummy-data/clear - eksekusi DELETE beneran (dipanggil dari tombol "Confirm Delete"
// setelah preview - request body sama persis dgn yang di-preview)
router.post('/', async (req, res, next) => {
  try {
    const companies = await getActiveCompanies();
    const params = parseCommon(req.body);
    const error = validate(params);
    if (error) {
      return res.status(400).render('dummyData/clear', {
        companies,
        targets: TARGETS,
        preview: null,
        result: null,
        error,
        formData: req.body,
      });
    }

    const result = await clearData(params);
    res.render('dummyData/clear', {
      companies,
      targets: TARGETS,
      preview: null,
      result,
      error: null,
      formData: {},
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
