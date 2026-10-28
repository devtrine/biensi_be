const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const uploader = require('../../middleware/upload');

router.use(authenticate);

router.post('/import-sp', uploader.upload.single('file'), controller.importBulkSP);
router.post('/import-fraud', uploader.upload.single('file'), controller.importBulkFraud);
router.post('/import-bipartit', uploader.upload.single('file'), controller.importBulkBipartit);
router.post('/sp-rekap/import', uploader.upload.single('file'), controller.importSpTokoRekap);

// 2. Endpoint GET
router.get('/dashboard', controller.getDashboardOverview);
router.get('/sp-rekap', controller.getSpTokoRekap);
router.get('/', controller.getAllCases);
router.get('/:id', controller.getCaseById);
router.delete('/:id', controller.deleteCase);

module.exports = router;