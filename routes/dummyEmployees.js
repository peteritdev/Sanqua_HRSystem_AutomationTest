const express = require('express');
const router = express.Router();
const { generateDummyEmployees, getRecentDummyEmployees } = require('../services/dummyEmployeeGenerator');

const MAX_COUNT = 500;

// GET /dummy-data/employees - form generate + list dummy terakhir
router.get('/', async (req, res, next) => {
  try {
    const recent = await getRecentDummyEmployees();
    res.render('dummyData/employees', { recent, result: null, maxCount: MAX_COUNT });
  } catch (err) {
    next(err);
  }
});

// POST /dummy-data/employees - generate N dummy employee, INSERT PERMANEN ke ms_employees
router.post('/', async (req, res, next) => {
  try {
    const count = parseInt(req.body.count, 10);
    if (!count || count < 1 || count > MAX_COUNT) {
      const recent = await getRecentDummyEmployees();
      return res.status(400).render('dummyData/employees', {
        recent,
        result: { error: `Jumlah harus angka 1-${MAX_COUNT}` },
        maxCount: MAX_COUNT,
      });
    }

    const created = await generateDummyEmployees(count);
    const recent = await getRecentDummyEmployees();
    res.render('dummyData/employees', {
      recent,
      result: { created },
      maxCount: MAX_COUNT,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
