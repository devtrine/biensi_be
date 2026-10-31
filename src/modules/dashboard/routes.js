const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth'); 

router.use(authenticate);

// PASANG GEMBOKNYA DI SINI! (Wajib punya izin view di modul dashboard)
router.get('/summary', checkPermission('dashboard', 'view'), controller.getSummary);

module.exports = router;