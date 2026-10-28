const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const uploader = require('../../middleware/upload');

router.use(authenticate); 
router.get('/', controller.getAllMovements);
router.get('/dashboard', controller.getTurnoverDashboard);
router.get('/:id', controller.getMovementById);
router.post('/', controller.createMovement);
router.delete('/:id', controller.deleteMovement);

router.post('/bulk-upload', uploader.upload.single('file'), controller.uploadBulkMovement);

module.exports = router;