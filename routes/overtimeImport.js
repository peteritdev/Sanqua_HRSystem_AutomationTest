const express = require('express');
const router = express.Router();
const multer = require('multer');

const TsMsOvertimeCondition = require('../models/TsMsOvertimeCondition');
const { buildImportTemplateWorkbook } = require('../services/excelTemplate');
const { parseImportFile } = require('../services/excelImport');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowed.includes(file.mimetype) && !file.originalname.toLowerCase().endsWith('.xlsx')) {
      return cb(new Error('File harus format .xlsx'));
    }
    cb(null, true);
  },
});

// GET /overtime/import - halaman upload
router.get('/', (req, res) => {
  res.render('overtime/import', { result: null });
});

// GET /overtime/import/template - download template .xlsx
router.get('/template', async (req, res, next) => {
  try {
    const workbook = await buildImportTemplateWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="template-import-overtime.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// POST /overtime/import - upload & proses file
router.post('/', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).render('overtime/import', {
        result: { fatalError: err.message },
      });
    }
    if (!req.file) {
      return res.status(400).render('overtime/import', {
        result: { fatalError: 'File belum dipilih' },
      });
    }

    try {
      const { validRows, errors } = await parseImportFile(req.file.buffer);

      let insertedCount = 0;
      if (validRows.length) {
        const payload = validRows.map(({ _rowNumber, ...row }) => ({
          ...row,
          created_by: req.testerName,
          updated_by: req.testerName,
        }));
        const created = await TsMsOvertimeCondition.bulkCreate(payload);
        insertedCount = created.length;
      }

      res.render('overtime/import', {
        result: {
          fatalError: null,
          totalValid: validRows.length,
          totalError: errors.length,
          inserted: insertedCount,
          errors,
        },
      });
    } catch (err) {
      res.status(400).render('overtime/import', {
        result: { fatalError: err.message },
      });
    }
  });
});

module.exports = router;
