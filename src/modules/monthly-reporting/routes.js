// src/modules/monthly-reporting/routes.js
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth'); // Inject middleware
const uploader = require('../../middleware/upload');

router.use(authenticate);

// Manajemen Periode & Snapshot
router.get('/', checkPermission('dashboard', 'view'), controller.getAllPeriods);
router.post('/', checkPermission('dashboard', 'create'), controller.createPeriod);
router.get('/produktivitas/active', checkPermission('productivity', 'view'), controller.getActiveStorePerformance);
router.get('/produktivitas/:periodId', checkPermission('productivity', 'view'), controller.getStorePerformanceByPeriod);
router.get('/:periodId/summary', checkPermission('dashboard', 'view'), controller.getSummary);
router.post('/:periodId/snapshots/generate', checkPermission('employees', 'create'), controller.generateMonthlySnapshot);

// [GEMBOK IMPORT] Semua jenis upload file dikunci oleh satu pintu: modul 'import'
router.post('/:periodId/attendance', checkPermission('import', 'create'), uploader.upload.single('file'), controller.uploadAttendance);
router.post('/:periodId/sales', checkPermission('import', 'create'), uploader.upload.single('file'), controller.uploadSales);
router.post('/bulk-attendance', checkPermission('import', 'create'), uploader.upload.single('file'), controller.uploadAttendanceUniversal);
router.post('/bulk-sales', checkPermission('import', 'create'), uploader.upload.single('file'), controller.uploadSalesUniversal);

// Pembacaan Data Spesifik
router.get('/attendance', checkPermission('attendance', 'view'), controller.getAllAttendance);
router.get('/sales', checkPermission('productivity', 'view'), controller.getAllSales);
router.get('/:periodId/attendance', checkPermission('attendance', 'view'), controller.getAttendance);
router.get('/:periodId/sales', checkPermission('productivity', 'view'), controller.getSales);

module.exports = router;