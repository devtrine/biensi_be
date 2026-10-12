const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth'); // Asumsi letak auth
const uploader = require('../../middleware/upload');       // Asumsi letak upload

router.use(authenticate); 
router.get('/', controller.getAllMovements);
router.get('/dashboard', controller.getTurnoverDashboard);
router.get('/:id', controller.getMovementById);
router.post('/', controller.createMovement);
router.delete('/:id', controller.deleteMovement);

// KUNCI PERBAIKAN: Gunakan upload.single('file') langsung dari instance multer yang di-export
router.post('/bulk-upload', uploader.upload.single('file'), controller.uploadBulkMovement);

module.exports = router;