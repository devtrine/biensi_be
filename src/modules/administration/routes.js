const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const uploader = require('../../middleware/upload')

// 1. GERBANG UTAMA: Pastikan user login & token valid
router.use(authenticate);
// --- SETTINGS (PROFIL PRIBADI) ---
// Bebas diakses selama sudah login
router.get('/profile', controller.getMyProfile);
router.put('/profile', uploader.image.single('photo'), controller.updateMyProfile);

// --- USER MANAGEMENT ---
// Hanya yang punya izin "view" di JSON "users" yang bisa lihat tabel
router.get('/users', checkPermission('users', 'view'), controller.getAllUsers);

// Hanya yang punya izin "create" di JSON "users" yang bisa nambah orang
router.post('/users', checkPermission('users', 'create'), controller.createUser);

// --- ROLE & PERMISSION ---
// Hanya yang punya izin "view" di JSON "roles" yang bisa lihat matriks
router.get('/roles', checkPermission('roles', 'view'), controller.getAllRoles);

// Hanya yang punya izin "edit" di JSON "roles" yang bisa update centang matriks
router.put('/roles/:id/permissions', checkPermission('roles', 'edit'), controller.updateRolePermissions);

module.exports = router;