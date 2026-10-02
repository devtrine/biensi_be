const prisma = require('../src/config/database');
const bcrypt = require('bcrypt');

async function main() {
  console.log('🌱 Memulai proses seeding database...');

  // 1. Buat Role SUPER_ADMIN (Menggunakan upsert agar tidak error jika di-run 2 kali)
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      permissions: {
        users: ['create', 'read', 'update', 'delete'],
        dashboard: ['read'],
        master_data: ['create', 'read', 'update', 'delete'],
        region_access: ['ALL']
      }
    }
  });
  console.log(`✅ Role dibuat: ${superAdminRole.name}`);

  // 2. Hash password 'password123'
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 3. Buat User HR Manager
  const adminUser = await prisma.user.upsert({
    where: { email: 'hr.manager@company.com' },
    update: {},
    create: {
      email: 'hr.manager@company.com',
      name: 'Super Admin HR',
      password: hashedPassword,
      roleId: superAdminRole.id,
      isActive: true
    }
  });
  console.log(`✅ User dibuat: ${adminUser.email}`);
  
  console.log('🎉 Seeding selesai!');
}

main()
  .catch((e) => {
    console.error('❌ Error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });