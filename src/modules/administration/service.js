const repository = require('./repository');
const bcrypt = require('bcrypt');

const createNewUser = async (userData) => {
  // Hash password sebelum masuk DB
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  
  const newUser = await repository.createUser({
    name: userData.name,
    email: userData.email,
    password: hashedPassword,
    roleId: userData.roleId,
    phoneNumber: userData.phoneNumber || null
  });

  return newUser;
};

const getMyProfile = async (userId) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new Error('Pengguna tidak ditemukan');

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber || '',
    photoUrl: user.photoUrl || '',
    role: user.role.name
  };
};

const updateMyProfile = async (userId, updateData) => {
  // Hanya izinkan field yang valid untuk diubah
  const allowedUpdates = {
    name: updateData.name,
    email: updateData.email,
    phoneNumber: updateData.phoneNumber,
  };
  if (updateData.photoUrl) {
    allowedUpdates.photoUrl = updateData.photoUrl;
  }
  const updatedUser = await repository.updateUser(userId, allowedUpdates);
  return {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    phoneNumber: updatedUser.phoneNumber,
    photoUrl: updatedUser.photoUrl
  };
};

// --- USER MANAGEMENT ---[cite: 8]
const getAllUsersList = async () => {
  const users = await repository.findAllUsers();
  
  return users.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
    status: user.isActive ? 'Aktif' : 'Non-Aktif',
    lastLogin: user.lastLogin,
    createdAt: user.createdAt
  }));
};

// --- ROLE & PERMISSION ---[cite: 7]
const getRolesMatrix = async () => {
  return await repository.findAllRoles();
};

const updateRolePermissions = async (roleId, permissions) => {
  // permissions akan otomatis tersimpan sebagai objek JSON berkat skema Prisma Anda
  return await repository.updateRole(roleId, { permissions });
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  getAllUsersList,
  getRolesMatrix,
  updateRolePermissions,
  createNewUser
};