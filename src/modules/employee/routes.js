const express = require('express');
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const router = express.Router();
const uploader = require('../../middleware/upload');

router.use(authenticate);

// GET & CRUD Manual: Dibatasi modul 'employees'
router.get('/', checkPermission('employees', 'view'), controller.getEmployees);
router.get('/:id', checkPermission('employees', 'view'), controller.getEmployeeById);
router.post('/', checkPermission('employees', 'create'), controller.createEmployee);
router.put('/:id', checkPermission('employees', 'edit'), controller.updateEmployee);
router.delete('/:id', checkPermission('employees', 'delete'), controller.deleteEmployee);

// [GEMBOK IMPORT] Wajib punya izin 'create' di modul khusus 'import'
router.post('/import', checkPermission('import', 'create'), uploader.upload.single('file'), controller.importEmployees);

module.exports = router;