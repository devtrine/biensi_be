const express = require('express');
const controller = require('./controller');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');

// Endpoint: POST /api/v1/auth/login
router.post('/login', controller.loginController);

router.use(authenticate);
router.post('/logout', controller.logoutController);

module.exports = router;