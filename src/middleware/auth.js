const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  try {
    // Ambil token dari header 'Authorization: Bearer <token>'
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Akses ditolak. Token tidak ditemukan.' }
      });
    }
    
    // console.log("CEK HEADER:", authHeader);
    const token = authHeader.split(' ')[1];

    // Verifikasi token menggunakan JWT_SECRET dari .env
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Simpan data user (id, role, permissions) ke object req agar bisa dibaca oleh Controller
    req.user = decoded; 
    
    next(); // Silakan masuk ke Controller
} catch (error) {
    // KITA HARUS LIHAT NAMA ERROR ASLINYA
    console.error('❌ [JWT DEBUG]:', error.name, '=>', error.message); 

    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token tidak valid atau sudah kedaluwarsa.' }
    });
  }
};

module.exports = { authenticate };