const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth'); // Sesuaikan path-nya

router.use(authenticate);

router.get('/summary', controller.getSummary);

module.exports = router;