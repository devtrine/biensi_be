const express = require('express');
const fs = require('fs');
const router = express.Router();
const { authenticate, checkPermission } = require('../middleware/auth');
const uploader = require('../middleware/upload');
const { validateImportFile } = require('../utils/importValidator');

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
const dashboardRoutes = require ('./dashboard/routes')

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
router.use('/dashboard', dashboardRoutes);

// Endpoint khusus dry-run validasi (read-only, tidak pernah menulis ke DB)
router.post(
  '/import/validate/:moduleKey',
  authenticate,
  checkPermission('import', 'create'),
  uploader.upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'File Excel wajib diunggah untuk validasi.' });
      }
      const report = await validateImportFile(req.params.moduleKey, req.file.path, req.file.originalname);
      return res.status(200).json(report);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    } finally {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
    }
  }
);

module.exports = router;