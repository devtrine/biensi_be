const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Pastikan folder uploads selalu ada secara otomatis (Anti-ENOENT)
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir); // Simpan di folder uploads dengan path absolut
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
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
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

// Kita export variabel 'upload' agar bisa di-import di routes mana pun
module.exports = {
  upload, image
};
