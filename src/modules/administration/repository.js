const prisma = require('../../config/database');

// Helper untuk membuat template matriks 11 modul sesuai Mockup FE + accessLevel Fase 1 PM
const buildDefaultPermissions = (preset) => {
  const full = { view: true, create: true, edit: true, delete: true, export: true };
  const viewOnly = { view: true, create: false, edit: false, delete: false, export: false };
  const none = { view: false, create: false, edit: false, delete: false, export: false };

  // 12 Modul yang akurat berdasarkan visual Dashboard FE dan data PM
  const baseModules = {
    dashboard: { label: 'Dashboard Eksekutif & KPI', ...none },
    employees: { label: 'Data Demografi Karyawan', ...none },
    turnover: { label: 'Turnover & Movement', ...none },
    productivity: { label: 'Produktivitas & Labour Cost', ...none },
    attendance: { label: 'Tingkat Kehadiran', ...none },
    recruitment: { label: 'Rekrutmen & Man Power', ...none },
    disciplinary: { label: 'Surat Peringatan & Kasus', ...none },
    industrialRelation: { label: 'Sengketa Hub. Industrial', ...none },
    compliance: { label: 'Perizinan (WLKP, PP, K3)', ...none },
    import: { label: 'Impor Data Excel (Bulk)', ...none },
    users: { label: 'Manajemen Akun Pengguna', ...none },
    roles: { label: 'Role & Matriks Hak Akses', ...none }
  };

  if (preset === 'SUPER_ADMIN') {
    Object.keys(baseModules).forEach(k => Object.assign(baseModules[k], full));
    return { description: 'Akses mutlak ke semua fitur', modules: baseModules };
  }

  if (preset === 'HR_MANAGER') {
    // Role 2: Default bisa semua, KECUALI create/delete akun pengguna (Bisa diubah Super Admin nanti)
    Object.keys(baseModules).forEach(k => Object.assign(baseModules[k], full));
    baseModules.users = { label: 'Manajemen Akun Pengguna', view: true, create: false, edit: true, delete: false, export: true };
    baseModules.roles = { label: 'Role & Matriks Hak Akses', view: true, create: false, edit: false, delete: false, export: false };
    return { description: 'Akses penuh operasional, tanpa pembuatan akun', modules: baseModules };
  }

  if (preset === 'HR_STAFF') {
    // Role 3: Default bisa baca-tulis operasional, tapi tidak bisa akses menu pengguna/role
    Object.keys(baseModules).forEach(k => {
      if (['users', 'roles'].includes(k)) {
        Object.assign(baseModules[k], none);
      } else if (k === 'dashboard') {
        Object.assign(baseModules[k], viewOnly); // Cuma bisa lihat dashboard
      } else {
        Object.assign(baseModules[k], { view: true, create: true, edit: true, delete: false, export: true });
      }
    });
    return { description: 'Akses input dan ubah data operasional harian', modules: baseModules };
  }

  // DEFAULT (Role 4 / VIEWER)
  // Hanya bisa lihat modul-modul umum. Gaji/Productivity disensor. (Tergantung kehendak Super Admin)
  Object.keys(baseModules).forEach(k => {
    if (['users', 'roles', 'import', 'productivity', 'industrialRelation'].includes(k)) {
      Object.assign(baseModules[k], none);
    } else {
      Object.assign(baseModules[k], viewOnly);
    }
  });

  return { description: 'Akses baca terbatas pada data non-sensitif', modules: baseModules };
};

const ensureDefaultRoles = async () => {
  const defaultRoles = [
    { name: 'Super Admin', permissions: buildDefaultPermissions('SUPER_ADMIN') },
    { name: 'Manajer HR', permissions: buildDefaultPermissions('HR_MANAGER') },
    { name: 'Staf HR', permissions: buildDefaultPermissions('HR_STAFF') },
    { name: 'Viewer', permissions: buildDefaultPermissions('VIEWER') }
  ];

  for (const r of defaultRoles) {
    const existing = await prisma.role.findUnique({ where: { name: r.name } });
    if (!existing) {
      // HANYA buat baru jika benar-benar belum ada di database
      await prisma.role.create({ data: r });
    }
  }
};

const createUser = async (data) => {
  return await prisma.user.create({
    data,
    select: {
      id: true,
      name: true,
      email: true,
      roleId: true,
      phoneNumber: true,
      isActive: true,
      createdAt: true,
      role: { select: { id: true, name: true } }
    }
  });
};

const findUserById = async (id) => {
  return await prisma.user.findUnique({
    where: { id },
    include: { role: true }
  });
};

const findUserByEmail = async (email) => {
  return await prisma.user.findUnique({
    where: { email },
    include: { role: true }
  });
};

const updateUser = async (id, data) => {
  return await prisma.user.update({
    where: { id },
    data,
    include: { role: true }
  });
};

const deleteUserById = async (id) => {
  return await prisma.user.delete({
    where: { id }
  });
};

const findAllUsers = async () => {
  return await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: 'desc' }
  });
};

const findAllRoles = async () => {
  await ensureDefaultRoles();
  return await prisma.role.findMany({
    orderBy: { id: 'asc' }
  });
};

const findRoleById = async (id) => {
  return await prisma.role.findUnique({
    where: { id: parseInt(id, 10) }
  });
};

const updateRole = async (id, data) => {
  return await prisma.role.update({
    where: { id: parseInt(id, 10) },
    data
  });
};

module.exports = {
  createUser,
  findUserById,
  findUserByEmail,
  updateUser,
  deleteUserById,
  findAllUsers,
  findAllRoles,
  findRoleById,
  updateRole
};