const express = require('express');
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate);
router.get('/', controller.getPositions);
router.get('/:id', controller.getPositionById);
router.post('/', controller.createPosition);
router.put('/:id', controller.updatePosition);
router.delete('/:id', controller.deletePosition);

module.exports = router;