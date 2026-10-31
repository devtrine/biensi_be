const service = require('./service');

const createUser = async (req, res) => {
  try {
    const { name, email, password, roleId, phoneNumber, isActive } = req.body;
    const creatorRoleId = req.user.roleId;

    if (!name || !email || !password || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'Nama, email, password, dan roleId wajib diisi.'
      });
    }

    // HIERARKI MUTLAK: Hanya Super Admin (roleId === 1) yang boleh membuat akun Super Admin baru
    if (creatorRoleId !== 1 && parseInt(roleId, 10) === 1) {
      return res.status(403).json({
        success: false,
        message: 'Pelanggaran Hierarki: Anda tidak diizinkan membuat akun dengan level Super Admin.'
      });
    }

    const result = await service.createNewUser({
      name,
      email,
      password,
      roleId: parseInt(roleId, 10),
      phoneNumber,
      isActive
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Pengguna berhasil ditambahkan'
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, roleId, phoneNumber, isActive } = req.body;
    const editorRoleId = req.user.roleId;

    // Cegah non-Super Admin mengubah role seseorang menjadi Super Admin
    if (roleId !== undefined && editorRoleId !== 1 && parseInt(roleId, 10) === 1) {
      return res.status(403).json({
        success: false,
        message: 'Pelanggaran Hierarki: Anda tidak diizinkan memberikan hak akses Super Admin.'
      });
    }

    const result = await service.updateUserByAdmin(id, {
      name,
      email,
      password,
      roleId,
      phoneNumber,
      isActive
    });

    res.status(200).json({
      success: true,
      data: result,
      message: 'Data pengguna berhasil diperbarui'
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await service.deleteUserByAdmin(id, req.user.id);
    res.status(200).json({
      success: true,
      message: 'Pengguna berhasil dihapus'
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const result = await service.getMyProfile(req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const { name, email, phoneNumber, password } = req.body;
    let photoUrl = req.body.photoUrl;

    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    const result = await service.updateMyProfile(req.user.id, {
      name,
      email,
      phoneNumber,
      password,
      photoUrl
    });

    res.status(200).json({
      success: true,
      data: result,
      message: 'Profil berhasil diperbarui'
    });
  } catch (error) {
    console.error('Error Update Profile:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- USER MANAGEMENT CONTROLLERS ---
const getAllUsers = async (req, res) => {
  try {
    const result = await service.getAllUsersList();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- ROLE & PERMISSION CONTROLLERS ---
const getAllRoles = async (req, res) => {
  try {
    const result = await service.getRolesMatrix();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateRolePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!permissions) {
      return res.status(400).json({
        success: false,
        message: 'Data permissions (JSON) wajib diisi'
      });
    }

    const result = await service.updateRolePermissions(id, permissions);
    res.status(200).json({
      success: true,
      data: result,
      message: 'Hak akses berhasil diperbarui'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getAllRoles,
  updateRolePermissions
};