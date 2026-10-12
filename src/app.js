const express = require('express');
const cors = require('cors');
const path = require('path');

// Import rute utama dari aggregator modul
const apiRoutes = require('./modules/index');

const app = express();

app.use(cors()); 

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

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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