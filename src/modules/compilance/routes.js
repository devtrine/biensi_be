const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const uploader = require ('../../middleware/upload');

router.use(authenticate)
router.post('/import',checkPermission('import', 'create'), uploader.upload.single('file'), controller.importCompliance);
router.get('/dashboard', controller.getDashboardOverview);

module.exports = router;