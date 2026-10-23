const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Path folder uploads absolut (biensi_be/uploads)
const uploadDir = path.resolve(__dirname, '../../uploads');

// Otomatisasi pembuatan direktori dan permissions 775 (Cross-platform safe)
const ensureUploadDir = (dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o775 });
    }
    fs.chmodSync(dir, 0o775);
  } catch (err) {
    // Diabaikan pada OS non-POSIX (Windows)
  }
};
ensureUploadDir(uploadDir);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureUploadDir(uploadDir);
    cb(null, uploadDir); // Simpan di folder uploads dengan path absolut konsisten
  },
  filename: function (req, file, cb) {
    // Penamaan file yang rapi dan aman dari Path Traversal
    const uniqueSuffix = Date.now();
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `Import_${uniqueSuffix}_${safeBase}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Maksimal 50MB (sinkron dengan batasan UI)
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.ms-excel', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimeTypes.includes(file.mimetype) || ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Format file ditolak! Hanya file Excel (.xlsx / .xls) yang diperbolehkan.'));
    }
  }
});

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureUploadDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now();
    const ext = path.extname(file.originalname); 
    const userId = req.user ? req.user.id : 'anon';
    cb(null, `Profile_${userId}_${uniqueSuffix}${ext}`); 
  }
});

const image = multer({ 
  storage: imageStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Maksimal 2MB sesuai desain UI
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format ditolak! Hanya JPG, PNG, atau GIF maksimal 2MB.'));
    }
  }
});

module.exports = {
  upload,
  image,
  uploadDir,
  ensureUploadDir
};
