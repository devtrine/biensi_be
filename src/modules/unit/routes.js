const express = require('express');
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate);
router.get('/', controller.getUnits);
router.get('/:id', controller.getUnitById);
router.post('/', controller.createUnit);
router.put('/:id', controller.updateUnit);
router.delete('/:id', controller.deleteUnit);

module.exports = router;