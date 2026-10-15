const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth'); // Sesuaikan path-nya

// Gunakan middleware JWT
router.use(authenticate);

// Endpoint utama
router.get('/summary', controller.getSummary);

module.exports = router;