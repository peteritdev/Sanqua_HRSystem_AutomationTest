const express = require('express');
const router = express.Router();

// GET /dummy-data - hub menu
router.get('/', (req, res) => {
  res.render('dummyData/hub');
});

module.exports = router;
