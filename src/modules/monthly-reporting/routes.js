// src/modules/monthly-reporting/routes.js
const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const multer = require('multer');
const path = require('path'); // Bawaan Node.js, tidak perlu di-install

// Konfigurasi Storage Permanen
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Simpan di folder uploads
  },
  filename: function (req, file, cb) {
    // Beri nama file yang unik dan bisa dibaca manusia: 
    // Contoh: "Import_Pegawai_1696515848000.xlsx"
    const uniqueSuffix = Date.now();
    const cleanName = file.originalname.replace(/\s+/g, '_'); // Ganti spasi dengan underscore
    cb(null, `Import_${uniqueSuffix}_${cleanName}`);
  }
});

const upload = multer({ 
  storage: storage, // Gunakan storage custom kita
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.ms-excel', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format file ditolak! Hanya file Excel (.xlsx / .xls) yang diperbolehkan.'));
    }
  }
});

router.use(authenticate);

// Manajemen Periode
router.get('/', controller.getAllPeriods);
router.post('/', controller.createPeriod);
router.get('/:periodId/summary', controller.getSummary);
router.post('/:periodId/snapshots/generate', controller.generateMonthlySnapshot);

// Endpoint Upload File (Sama persis polanya dengan Employee)
router.post('/:periodId/attendance', upload.single('file'), controller.uploadAttendance);
router.post('/:periodId/labour-costs', upload.single('file'), controller.uploadActualLabourCost);
router.post('/:periodId/sales', upload.single('file'), controller.uploadSales);

router.get('/attendance', controller.getAllAttendance);
router.get('/sales', controller.getAllSales);
router.get('/:periodId/attendance', controller.getAttendance);
router.get('/:periodId/sales', controller.getSales);

//universal Bulk
router.post('/bulk-attendance', upload.single('file'), controller.uploadAttendanceUniversal);
router.post('/bulk-sales', upload.single('file'), controller.uploadSalesUniversal);

module.exports = router;