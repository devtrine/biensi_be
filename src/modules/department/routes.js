const express = require('express');
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate);
router.get('/', controller.getDepartments);
router.get('/:id', controller.getDepartmentById);
router.post('/', controller.createDepartment);
router.put('/:id', controller.updateDepartment);
router.delete('/:id', controller.deleteDepartment);

module.exports = router;