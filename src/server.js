require('dotenv').config(); // Load variabel dari .env pertama kali

const app = require('./app');

// Gunakan port dari .env, atau gunakan 5000 sebagai fallback
const PORT = process.env.PORT || 5000;

// Mulai nyalakan server
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Server berhasil menyala!`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);
  console.log(`🎯 API Endpoint: http://localhost:${PORT}/api/v1`);
});

// Keamanan Tambahan: Mencegah server mati mendadak jika ada error asynchronous yang bocor
process.on('unhandledRejection', (err) => {
  console.error('❌ [Unhandled Rejection]:', err);
});