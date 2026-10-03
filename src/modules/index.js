const express = require('express');
const router = express.Router();

const authRoutes = require('./auth/routes');
const storeRoutes = require('./store/routes');

router.use('/auth', authRoutes);
router.use('/stores', storeRoutes);

module.exports = router;