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
    return { description: 'Akses mutlak ke semua fitur', accessLevel: 'READ_WRITE', modules: baseModules };
  }

  if (preset === 'HR_MANAGER') {
    // Role 2: Default bisa semua, KECUALI create/delete akun pengguna (Bisa diubah Super Admin nanti)
    Object.keys(baseModules).forEach(k => Object.assign(baseModules[k], full));
    baseModules.users = { label: 'Manajemen Akun Pengguna', view: true, create: false, edit: true, delete: false, export: true };
    baseModules.roles = { label: 'Role & Matriks Hak Akses', view: true, create: false, edit: false, delete: false, export: false };
    return { description: 'Akses penuh operasional, tanpa pembuatan akun', accessLevel: 'RESTRICTED_READ', modules: baseModules };
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
    return { description: 'Akses input dan ubah data operasional harian', accessLevel: 'RESTRICTED_READ', modules: baseModules };
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

  return { description: 'Akses baca terbatas pada data non-sensitif', accessLevel: 'RESTRICTED_READ', modules: baseModules };
};

// Gabungkan role legacy 'SUPER_ADMIN' (dari seed lama) ke 'Super Admin' agar tidak duplikat
const reconcileLegacySuperAdminRole = async () => {
  const [legacyRole, canonicalRole] = await Promise.all([
    prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } }),
    prisma.role.findUnique({ where: { name: 'Super Admin' } })
  ]);

  if (!legacyRole) return;

  const defaultSuperAdminPerm = buildDefaultPermissions('SUPER_ADMIN');
  const legacyPerm = legacyRole.permissions && typeof legacyRole.permissions === 'object' ? legacyRole.permissions : {};

  if (!canonicalRole) {
    const nextPermissions = legacyPerm.modules
      ? { accessLevel: 'READ_WRITE', ...legacyPerm }
      : defaultSuperAdminPerm;

    await prisma.role.update({
      where: { id: legacyRole.id },
      data: { name: 'Super Admin', permissions: nextPermissions }
    });
    return;
  }

  // Pertahankan ID yang lebih kecil (umumnya ID 1) agar token/user yang sudah terikat tidak putus
  const [keepRole, dropRole] =
    legacyRole.id <= canonicalRole.id ? [legacyRole, canonicalRole] : [canonicalRole, legacyRole];

  const canonicalPerm = canonicalRole.permissions && typeof canonicalRole.permissions === 'object' ? canonicalRole.permissions : {};
  const mergedPermissions = legacyPerm.modules
    ? { accessLevel: 'READ_WRITE', ...legacyPerm }
    : canonicalPerm.modules
      ? { accessLevel: 'READ_WRITE', ...canonicalPerm }
      : defaultSuperAdminPerm;

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { roleId: dropRole.id },
      data: { roleId: keepRole.id }
    });
    await tx.role.delete({ where: { id: dropRole.id } });
    await tx.role.update({
      where: { id: keepRole.id },
      data: { name: 'Super Admin', permissions: mergedPermissions }
    });
  });
};

const ensureDefaultRoles = async () => {
  await reconcileLegacySuperAdminRole();

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
  buildDefaultPermissions,
  ensureDefaultRoles,
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