const express = require('express');
const controller = require('./controller');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();
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
router.post('/import', upload.single('file'), controller.importEmployees);

router.get('/', controller.getEmployees);
router.get('/:id', controller.getEmployeeById);
router.post('/', controller.createEmployee);
router.put('/:id', controller.updateEmployee);
router.delete('/:id', controller.deleteEmployee);

module.exports = router;