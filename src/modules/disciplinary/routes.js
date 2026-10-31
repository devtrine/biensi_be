const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth'); // Inject middleware
const uploader = require('../../middleware/upload');

router.use(authenticate);

// [GEMBOK IMPORT] Mengunci semua celah upload excel SP, Fraud, dan Bipartit
router.post('/import-sp', checkPermission('import', 'create'), uploader.upload.single('file'), controller.importBulkSP);
router.post('/import-fraud', checkPermission('import', 'create'), uploader.upload.single('file'), controller.importBulkFraud);
router.post('/import-bipartit', checkPermission('import', 'create'), uploader.upload.single('file'), controller.importBulkBipartit);
router.post('/sp-rekap/import', checkPermission('import', 'create'), uploader.upload.single('file'), controller.importSpTokoRekap);

// Endpoint GET & DELETE: Dibatasi oleh modul 'disciplinary'
router.get('/dashboard', checkPermission('disciplinary', 'view'), controller.getDashboardOverview);
router.get('/sp-rekap', checkPermission('disciplinary', 'view'), controller.getSpTokoRekap);
router.get('/', checkPermission('disciplinary', 'view'), controller.getAllCases);
router.get('/:id', checkPermission('disciplinary', 'view'), controller.getCaseById);
router.delete('/:id', checkPermission('disciplinary', 'delete'), controller.deleteCase);

module.exports = router;    