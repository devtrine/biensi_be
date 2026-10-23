const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

// Import rute utama dari aggregator modul
const apiRoutes = require('./modules/index');

const app = express();

// Keamanan: Helmet HTTP Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS Configuration: Mendukung pembatasan via CORS_ORIGIN di .env
const corsOrigin = process.env.CORS_ORIGIN;
if (corsOrigin && corsOrigin !== '*') {
  const allowedOrigins = corsOrigin.split(',').map((origin) => origin.trim());
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Akses diblokir oleh kebijakan CORS'));
      }
    },
    credentials: true
  }));
} else {
  // Default development / same-origin proxy
  app.use(cors());
}

// Mengubah body request dari JSON menjadi objek JavaScript (req.body)
app.use(express.json());

// Mengizinkan penerimaan data dari form-urlencoded
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Welcome to HR Dashboard API v1.0' 
  });
});

// Mount semua rute modul ke awalan /api/v1
app.use('/api/v1', apiRoutes);

// Otomatisasi pembuatan folder uploads & setting permission 775 (Zero-manual setup di VPS)
const uploadDir = path.resolve(__dirname, '../uploads');
const ensureUploadDir = (dir) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o775 });
    }
    fs.chmodSync(dir, 0o775);

    // Pastikan seluruh file/sub-item di dalamnya juga memiliki permission 775
    const files = fs.readdirSync(dir);
    for (const file of files) {
      try {
        fs.chmodSync(path.join(dir, file), 0o775);
      } catch (_) {}
    }
  } catch (err) {
    // Error diabaikan jika berjalan di OS non-POSIX seperti Windows dev environment
  }
};
ensureUploadDir(uploadDir);

app.use('/uploads', express.static(uploadDir));

app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' }
  });
});

// Penangkap error massal (Menangkap throw new Error dari service.js)
app.use((err, req, res, next) => {
  console.error('❌ [Global Error]:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Terjadi kesalahan pada server'
    }
  });
});

module.exports = app;
