const express = require('express');
const { loginController } = require('./controller');
const router = express.Router();

// Endpoint: POST /api/v1/auth/login
router.post('/login', loginController);

module.exports = router;