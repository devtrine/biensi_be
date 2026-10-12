const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Simpan di folder uploads
  },
  filename: function (req, file, cb) {
    // Penamaan file yang rapi: Import_1696515848000_Draft_Sales.xlsx
    const uniqueSuffix = Date.now();
    const cleanName = file.originalname.replace(/\s+/g, '_');
    cb(null, `Import_${uniqueSuffix}_${cleanName}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Maksimal 5MB
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

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Boleh diarahkan ke 'uploads/profiles/' jika mau lebih rapi
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now();
    // Ambil ekstensi asli gambar (misal: .jpg, .png)
    const ext = path.extname(file.originalname); 
    // Format nama: Profile_12345_1696515848000.jpg
    cb(null, `Profile_${req.user.id}_${uniqueSuffix}${ext}`); 
  }
});

const image = multer({ 
  storage: imageStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Maksimal 2MB sesuai desain UI[cite: 1]
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif']; // Sesuai desain UI[cite: 1]
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