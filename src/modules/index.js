const express = require('express');
const router = express.Router();

const authRoutes = require('./auth/routes');
const storeRoutes = require('./store/routes');
const divisionRoutes = require('./division/routes');
const departmentRoutes = require('./department/routes');
const positionRoutes = require('./position/routes');

router.use('/auth', authRoutes);
router.use('/stores', storeRoutes);
router.use('/divisions', divisionRoutes);
router.use('/departments', departmentRoutes);
router.use('/positions', positionRoutes);

module.exports = router;