const express = require('express');
const router = express.Router();

const authRoutes = require('./auth/routes');
const storeRoutes = require('./store/routes');
const divisionRoutes = require('./division/routes');
const departmentRoutes = require('./department/routes');
const positionRoutes = require('./position/routes');
const unitRoutes = require('./unit/routes');
const employeeRoutes = require('./employee/routes');

router.use('/auth', authRoutes);
router.use('/stores', storeRoutes);
router.use('/divisions', divisionRoutes);
router.use('/departments', departmentRoutes);
router.use('/positions', positionRoutes);
router.use('/units', unitRoutes);
router.use('/employees', employeeRoutes);

module.exports = router;