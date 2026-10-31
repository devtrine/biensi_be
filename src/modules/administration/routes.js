const express = require('express');
const router = express.Router();
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const uploader = require('../../middleware/upload');

router.use(authenticate);

// --- PROFILE PRIBADI ---
router.get('/profile', controller.getMyProfile);
router.put('/profile', uploader.image.single('photo'), controller.updateMyProfile);

// --- USER MANAGEMENT ---
router.get('/users', checkPermission('users', 'view'), controller.getAllUsers);
router.post('/users', checkPermission('users', 'create'), controller.createUser);
router.put('/users/:id', checkPermission('users', 'edit'), controller.updateUser);
router.delete('/users/:id', checkPermission('users', 'delete'), controller.deleteUser);

// --- ROLE & PERMISSION MATRIX ---
router.get('/roles', checkPermission('roles', 'view'), controller.getAllRoles);
router.put('/roles/:id/permissions', checkPermission('roles', 'edit'), controller.updateRolePermissions);

module.exports = router;    