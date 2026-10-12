const express = require('express');
const router = express.Router();

const authRoutes = require('./auth/routes');
const administrationRoutes = require('./administration/routes')
const storeRoutes = require('./store/routes');
const divisionRoutes = require('./division/routes');
const departmentRoutes = require('./department/routes');
const positionRoutes = require('./position/routes');
const unitRoutes = require('./unit/routes');
const employeeRoutes = require('./employee/routes');
const monthlyReportingRoutes = require('./monthly-reporting/routes');
const movemntRoutes = require('./employee-movement/routes');
const disciplinaryRoutes = require ('./disciplinary/routes');
const compilanceRoutes = require ('./compilance/routes');

router.use('/auth', authRoutes);
router.use('/administration', administrationRoutes);
router.use('/stores', storeRoutes);
router.use('/divisions', divisionRoutes);
router.use('/departments', departmentRoutes);
router.use('/positions', positionRoutes);
router.use('/units', unitRoutes);
router.use('/employees', employeeRoutes);
router.use('/reporting-monthly', monthlyReportingRoutes);
router.use('/movement', movemntRoutes);
router.use('/disciplinary', disciplinaryRoutes);
router.use('/compilance', compilanceRoutes);

module.exports = router;