const prisma = require('../src/config/database');
const bcrypt = require('bcrypt');
const { ensureDefaultRoles } = require('../src/modules/administration/repository');

async function main() {
  console.log('🌱 Memulai proses seeding database...');

  // 1. Pastikan seluruh role default (termasuk 'Super Admin') tersedia tanpa duplikasi
  await ensureDefaultRoles();
  const superAdminRole = await prisma.role.findUnique({
    where: { name: 'Super Admin' }
  });
  console.log(`✅ Role siap: ${superAdminRole.name}`);

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