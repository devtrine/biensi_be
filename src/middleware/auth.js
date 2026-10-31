const jwt = require('jsonwebtoken');
const prisma = require('../config/database');

// Normalisasi nama action (Inggris <-> Indonesia sesuai kolom di Mockup FE)
const ACTION_ALIASES = {
  view: ['view', 'lihat', 'read'],
  create: ['create', 'tambah', 'add', 'write', 'import'],
  edit: ['edit', 'ubah', 'update', 'write'],
  delete: ['delete', 'hapus', 'remove'],
  export: ['export', 'ekspor', 'download']
};

// Modul sensitif yang dibatasi jika level akses Fase 1 adalah "RESTRICTED_READ" (Read Terbatas)
const RESTRICTED_MODULES = ['labourCost', 'users', 'roles', 'masterData', 'activityLog', 'import'];

const authenticate = async (req, res, next) => { // <-- Ubah jadi async
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak ditemukan.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // [BARU] Tarik Role & Permissions terbaru dari DB berdasarkan roleId di token
    const userRole = await prisma.role.findUnique({
      where: { id: decoded.roleId },
      select: { name: true, permissions: true }
    });

    if (!userRole) {
      return res.status(401).json({ success: false, message: 'Role pengguna tidak valid.' });
    }

    // Gabungkan data decoded dengan permissions real-time dari DB
    req.user = {
      ...decoded,
      roleName: userRole.name,
      permissions: userRole.permissions // <--- DIJAMIN 100% SINKRON!
    };
    
    next();
  } catch (error) {
    console.error('❌ [JWT DEBUG]:', error.name, '=>', error.message);
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
};

const checkPermission = (moduleName, action) => {
  return (req, res, next) => {
    // 1. Super Admin Bebas Hambatan (ID 1 atau 2)
    const userRole = req.user.roleId;
    const roleName = String(req.user.roleName || '').toUpperCase();
    if (userRole === 1 || userRole === 2 || roleName === 'SUPER ADMIN') {
      return next();
    }

    const permissions = req.user.permissions || {};
    const modulesPerm = permissions.modules || {};

    // 2. CEK KETAT JSON FASE 2 (Matriks Mikro)
    if (modulesPerm[moduleName]) {
      // Normalisasi nama aksi (jika FE mengirim 'read', kita samakan dengan 'view')
      const actionKey = (action === 'read') ? 'view' : action;
      
      // Jika di JSON nilainya true, izinkan. Jika false, BLOKIR MUTLAK!
      if (modulesPerm[moduleName][actionKey] === true) {
        return next();
      } else {
        return res.status(403).json({ 
          success: false, 
          message: `Akses ditolak. Anda tidak memiliki izin '${actionKey}' pada modul '${moduleName}'.` 
        });
      }
    }

    // 3. Fallback Fase 1 (Hanya dipakai jika JSON rusak/kosong)
    const accessLevel = permissions.accessLevel || 'RESTRICTED_READ';
    if (accessLevel === 'READ_WRITE') return next();
    if (accessLevel === 'READ' && (action === 'view' || action === 'read')) return next();

    // Jika tidak memenuhi semua syarat, tendang!
    return res.status(403).json({ success: false, message: `Akses ditolak.` });
  };
};

module.exports = { authenticate, checkPermission };