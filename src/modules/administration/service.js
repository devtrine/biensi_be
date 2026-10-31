const repository = require('./repository');
const bcrypt = require('bcrypt');

const createNewUser = async (userData) => {
  const existingEmail = await repository.findUserByEmail(userData.email);
  if (existingEmail) {
    throw new Error('Email sudah terdaftar pada akun lain.');
  }

  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const parsedRoleId = userData.roleId ? parseInt(userData.roleId, 10) : null;

  const newUser = await repository.createUser({
    name: userData.name,
    email: userData.email,
    password: hashedPassword,
    roleId: parsedRoleId,
    phoneNumber: userData.phoneNumber || null,
    isActive: userData.isActive !== undefined ? Boolean(userData.isActive) : true
  });

  return {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    roleId: newUser.roleId,
    role: newUser.role?.name || 'Tanpa Peran',
    status: newUser.isActive ? 'Aktif' : 'Non-Aktif',
    createdAt: newUser.createdAt
  };
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
    roleId: user.roleId,
    role: user.role?.name || 'Viewer',
    permissions: user.role?.permissions || {}
  };
};

const updateMyProfile = async (userId, updateData) => {
  const allowedUpdates = {};
  if (updateData.name !== undefined) allowedUpdates.name = updateData.name;
  if (updateData.email !== undefined) allowedUpdates.email = updateData.email;
  if (updateData.phoneNumber !== undefined) allowedUpdates.phoneNumber = updateData.phoneNumber;
  if (updateData.photoUrl) allowedUpdates.photoUrl = updateData.photoUrl;
  if (updateData.password) {
    allowedUpdates.password = await bcrypt.hash(updateData.password, 10);
  }

  const updatedUser = await repository.updateUser(userId, allowedUpdates);
  return {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    phoneNumber: updatedUser.phoneNumber || '',
    photoUrl: updatedUser.photoUrl || '',
    role: updatedUser.role?.name || 'Viewer'
  };
};

// --- USER MANAGEMENT ---
const getAllUsersList = async () => {
  const users = await repository.findAllUsers();

  return users.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber || '',
    roleId: user.roleId,
    role: user.role?.name || 'Viewer',
    accessLevel: user.role?.permissions?.accessLevel || 'RESTRICTED_READ',
    isActive: user.isActive,
    status: user.isActive ? 'Aktif' : 'Non-Aktif',
    lastLogin: user.lastLogin,
    createdAt: user.createdAt
  }));
};

const updateUserByAdmin = async (targetUserId, updateData) => {
  const existing = await repository.findUserById(targetUserId);
  if (!existing) throw new Error('Pengguna tidak ditemukan');

  const payload = {};
  if (updateData.name !== undefined) payload.name = updateData.name;
  if (updateData.email !== undefined) payload.email = updateData.email;
  if (updateData.phoneNumber !== undefined) payload.phoneNumber = updateData.phoneNumber;
  if (updateData.roleId !== undefined) payload.roleId = updateData.roleId ? parseInt(updateData.roleId, 10) : null;
  if (updateData.isActive !== undefined) payload.isActive = Boolean(updateData.isActive);
  if (updateData.password && String(updateData.password).trim() !== '') {
    payload.password = await bcrypt.hash(updateData.password, 10);
  }

  const updated = await repository.updateUser(targetUserId, payload);
  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    roleId: updated.roleId,
    role: updated.role?.name || 'Viewer',
    isActive: updated.isActive,
    status: updated.isActive ? 'Aktif' : 'Non-Aktif'
  };
};

const deleteUserByAdmin = async (targetUserId, requesterId) => {
  if (targetUserId === requesterId) {
    throw new Error('Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif login.');
  }
  const existing = await repository.findUserById(targetUserId);
  if (!existing) throw new Error('Pengguna tidak ditemukan');

  await repository.deleteUserById(targetUserId);
  return { id: targetUserId };
};

// --- ROLE & PERMISSION ---
const getRolesMatrix = async () => {
  return await repository.findAllRoles();
};

const updateRolePermissions = async (roleId, permissions) => {
  const existingRole = await repository.findRoleById(roleId);
  if (!existingRole) throw new Error('Role tidak ditemukan');

  // Gabungkan permissions lama dengan perubahan baru agar struktur tidak rusak
  const mergedPermissions = {
    ...(typeof existingRole.permissions === 'object' ? existingRole.permissions : {}),
    ...permissions
  };

  return await repository.updateRole(roleId, { permissions: mergedPermissions });
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  getAllUsersList,
  createNewUser,
  updateUserByAdmin,
  deleteUserByAdmin,
  getRolesMatrix,
  updateRolePermissions
};