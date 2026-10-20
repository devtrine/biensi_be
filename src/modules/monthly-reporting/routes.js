// src/modules/monthly-reporting/routes.js
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const uploader = require('../../middleware/upload');

router.use(authenticate);

// Manajemen Periode
router.get('/', controller.getAllPeriods);
router.post('/', controller.createPeriod);
router.get('/produktivitas/active', controller.getActiveStorePerformance);
router.get('/produktivitas/:periodId', controller.getStorePerformanceByPeriod);
router.get('/:periodId/summary', controller.getSummary);
router.post('/:periodId/snapshots/generate', controller.generateMonthlySnapshot);

// Endpoint Upload File (Gunakan middleware upload terpusat)
router.post('/:periodId/attendance', uploader.upload.single('file'), controller.uploadAttendance);
router.post('/:periodId/sales', uploader.upload.single('file'), controller.uploadSales);

router.get('/attendance', controller.getAllAttendance);
router.get('/sales', controller.getAllSales);
router.get('/:periodId/attendance', controller.getAttendance);
router.get('/:periodId/sales', controller.getSales);

// Universal Bulk
router.post('/bulk-attendance', uploader.upload.single('file'), controller.uploadAttendanceUniversal);
router.post('/bulk-sales', uploader.upload.single('file'), controller.uploadSalesUniversal);

module.exports = router;
