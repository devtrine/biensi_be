const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const uploader = require('../../middleware/upload');

router.use(authenticate);

router.post('/import-sp', uploader.single('file'), controller.importBulkSP);
router.post('/import-fraud', uploader.single('file'), controller.importBulkFraud);
router.post('/import-bipartit', uploader.single('file'), controller.importBulkBipartit);

// 2. Endpoint CRUD Standar
router.get('/dashboard', controller.getDashboardOverview);
router.get('/', controller.getAllCases);
router.get('/:id', controller.getCaseById);
router.delete('/:id', controller.deleteCase);

module.exports = router;