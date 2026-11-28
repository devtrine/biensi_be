const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const uploader = require('../../middleware/upload');

router.use(authenticate);

// Unduh Template Excel Resmi & Import Excel Multi-Tahun
router.get('/template', checkPermission('productivity', 'view'), controller.downloadTemplate);
router.post('/import', checkPermission('import', 'create'), uploader.upload.single('file'), controller.importProduction);

// Simple CRUD Realisasi Jumlah Produksi
router.get('/', checkPermission('productivity', 'view'), controller.getAllProduction);
router.get('/:id', checkPermission('productivity', 'view'), controller.getProductionById);
router.post('/', checkPermission('productivity', 'create'), controller.createProduction);
router.put('/:id', checkPermission('productivity', 'edit'), controller.updateProduction);
router.delete('/:id', checkPermission('productivity', 'delete'), controller.deleteProduction);

module.exports = router;
