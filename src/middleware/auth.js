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

const checkPermission = (moduleName, action) => {
  return (req, res, next) => {
    try {
      const user = req.user; // Didapat dari middleware authenticate sebelumnya

      // 1. HIERARKI MUTLAK: Jika dia Super Admin, biarkan lewat tanpa cek JSON!
      if (user.roleId === 1) { // Asumsi ID 1 selalu Super Admin
        return next();
      }

      // 2. CEK JSON PERMISSIONS
      // Contoh struktur JSON di DB: { "users": { "view": true, "create": false }, "attendance": { ... } }
      const permissions = user.permissions;

      if (!permissions || !permissions[moduleName] || !permissions[moduleName][action]) {
        return res.status(403).json({
          success: false,
          error: { 
            code: 'FORBIDDEN', 
            message: `Akses ditolak. Anda tidak memiliki izin untuk ${action} pada modul ${moduleName}.` 
          }
        });
      }

      // Jika true, silakan masuk ke Controller
      next(); 
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Kesalahan otorisasi internal.' });
    }
  };
};

module.exports = { authenticate, checkPermission };