const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const uploader = require ('../../middleware/upload');

router.use(authenticate)
// Endpoint Upload Excel
router.post('/import', uploader.single('file'), controller.importCompliance);

// Endpoint Get Dashboard (KPI & Tabel Gabungan)
router.get('/dashboard', controller.getDashboardOverview);

module.exports = router;