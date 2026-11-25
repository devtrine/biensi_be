const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);
router.get('/status', controller.getYearlyStatus);
router.get('/history', controller.getImportHistory);

module.exports = router;