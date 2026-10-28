const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const uploader = require ('../../middleware/upload');

router.use(authenticate)
router.post('/import', uploader.upload.single('file'), controller.importCompliance);
router.get('/dashboard', controller.getDashboardOverview);

module.exports = router;