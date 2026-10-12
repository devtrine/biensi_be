const express = require('express');
const controller = require('./controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const router = express.Router();
const uploader = require('../../middleware/upload')

router.use(authenticate);
// GET (Lihat Data): Membutuhkan centang 'view' di JSON
router.get('/', checkPermission('employees', 'view'), controller.getEmployees);
router.get('/:id', checkPermission('employees', 'view'), controller.getEmployeeById);

// POST (Tambah Data): Membutuhkan centang 'create' di JSON
router.post('/', checkPermission('employees', 'create'), controller.createEmployee);

// Khusus Import: Karena fungsinya menambah/menimpa data karyawan, kita bisa menggunakan izin 'create'
// (Atau jika Anda punya baris matriks khusus import, bisa ubah menjadi checkPermission('import', 'create'))
router.post('/import', uploader.upload.single('file'), controller.importEmployees);

// PUT (Ubah Data): Membutuhkan centang 'edit' di JSON
router.put('/:id', checkPermission('employees', 'edit'), controller.updateEmployee);

// DELETE (Hapus Data): Membutuhkan centang 'delete' di JSON
router.delete('/:id', checkPermission('employees', 'delete'), controller.deleteEmployee);

module.exports = router;