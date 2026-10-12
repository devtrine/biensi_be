const service = require('./service');

const createUser = async (req, res) => {
  try {
    const { name, email, password, roleId, phoneNumber } = req.body;
    const creatorRoleId = req.user.roleId; // ID pembuat yang didapat dari Token

    // // HIERARKI MUTLAK: Hanya Super Admin (1) yang boleh membuat Super Admin (1) baru
    // if (creatorRoleId !== 1 && parseInt(roleId) === 1) {
    //   return res.status(403).json({ 
    //     success: false, 
    //     message: "Pelanggaran Hierarki: Anda tidak diizinkan membuat akun dengan level Super Admin." 
    //   });
    // }

    // Validasi basic
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Nama, email, password, dan roleId wajib diisi." });
    }

    const result = await service.createNewUser({ name, email, password, roleId: 1, phoneNumber });
    
    res.status(201).json({ success: true, data: result, message: 'Pengguna berhasil ditambahkan' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    // Pastikan pakai kurung kurawal (destructuring)
    const { name, email, phoneNumber } = req.body; 
    let photoUrl = req.body.photoUrl; 

    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    const updateData = { name, email, phoneNumber, photoUrl };
    
    // Pastikan dipanggil dengan 2 parameter!
    const result = await service.updateMyProfile(req.user.id, updateData);
    
    res.status(200).json({ success: true, data: result, message: 'Profil berhasil diperbarui' });
  } catch (error) {
    // Error di console.log agar kita bisa lihat baris persisnya di terminal
    console.error("Error Update Profile:", error); 
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
      return res.status(400).json({ success: false, message: "Data permissions (JSON) wajib diisi" });
    }

    const result = await service.updateRolePermissions(id, permissions);
    res.status(200).json({ success: true, data: result, message: 'Hak akses berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  getAllUsers,
  getAllRoles,
  updateRolePermissions,
  createUser
};