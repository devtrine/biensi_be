const prisma = require('../../config/database');

const getAllMovements = async (filters) => {
  const { page = 1, limit = 10, search, movementType } = filters;
  const skip = (page - 1) * limit;

  // Bangun query filter
  const where = {};
  if (movementType) where.movementType = movementType;
  if (search) {
    where.employee = {
      fullName: { contains: search, mode: 'insensitive' }
    };
  }

  // Tarik data sekaligus hitung total (untuk pagination)
  const [data, total] = await Promise.all([
    prisma.employeeMovement.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { movementDate: 'desc' }, // Urutkan dari yang terbaru
      include: {
        employee: { select: { fullName: true, employeeNo: true, joinDate: true } },
        store: { select: { storeName: true, region: true } }
      }
    }),
    prisma.employeeMovement.count({ where })
  ]);

  return {
    data,
    meta: {
      total,
      page: parseInt(page),
      lastPage: Math.ceil(total / limit)
    }
  };
};

const getMovementById = async (id) => {
  return await prisma.employeeMovement.findUnique({
    where: { id },
    include: {
      employee: { select: { fullName: true, employeeNo: true, joinDate: true, status: true } },
      store: { select: { storeName: true, storeType: true, region: true } }
    }
  });
};

const createMovement = async (data) => {
  return await prisma.employeeMovement.create({ data });
};

const deleteMovement = async (id) => {
  return await prisma.employeeMovement.delete({ where: { id } });
};

const processBulkMovement = async (parsedData) => {
  let successCount = 0;
  let errorList = [];

  for (const row of parsedData) {
    try {
      // 1. === AUTO-UPDATE/CREATE STORE ===
      let storeId = null;
      if (row.storeName) {
        const cleanStoreName = String(row.storeName).trim();
        let store = await prisma.store.findFirst({
          where: { storeName: { equals: cleanStoreName, mode: 'insensitive' } }
        });

        if (!store) {
          store = await prisma.store.create({
            data: {
              storeName: cleanStoreName,
              storeCode: `STR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              region: row.region,
              storeType: row.storeType,
              asstHead: row.asstHead
            }
          });
        } else {
          // Jika toko sudah ada, PERKAYA datanya jika sebelumnya kosong
          await prisma.store.update({
            where: { id: store.id },
            data: {
              region: row.region || store.region,
              storeType: row.storeType || store.storeType,
              asstHead: row.asstHead || store.asstHead
            }
          });
        }
        storeId = store.id;
      }

    // 1. === AUTO-CREATE / CARI DIVISI ===
      let divisionId = null;
      if (row.divisionName) {
        const cleanDivName = String(row.divisionName).trim();
        let division = await prisma.division.findFirst({
          where: { name: { equals: cleanDivName, mode: 'insensitive' } } 
        });

        if (!division) {
          division = await prisma.division.create({
            data: { 
              name: cleanDivName,
              // Tambahkan dummy code untuk jaga-jaga jika Division butuh code
              code: `DIV-${Date.now()}-${Math.floor(Math.random() * 1000)}` 
            } 
          });
        }
        divisionId = division.id;
      }

      // 2. === AUTO-CREATE / CARI DEPARTEMEN ===
      let departmentId = null;
      if (row.departmentName) {
        const cleanDeptName = String(row.departmentName).trim();
        let department = await prisma.department.findFirst({
          where: { name: { equals: cleanDeptName, mode: 'insensitive' } } 
        });

        if (!department) {
          department = await prisma.department.create({
            data: { 
              name: cleanDeptName,
              // ---> INI SOLUSI ERRORNYA: Tambahkan dummy code <---
              code: `DPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              divisionId: divisionId 
            }
          });
        }
        departmentId = department.id;
      }

      // 2. === CARI KARYAWAN ATAU AUTO-CREATE HISTORICAL EMPLOYEE ===
      let employee = await prisma.employee.findFirst({
        where: { fullName: { equals: row.employeeName, mode: 'insensitive' } }
      });

      if (!employee) {
        // Helper NIK Pintar (Format YYYYMMDD)
        const formatDate = (date) => {
          if (!date) return '00000000';
          const d = new Date(date);
          return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        };

        const safeJoinDate = row.joinDate || new Date(row.movementDate.getFullYear(), 0, 1);
        const joinStr = formatDate(safeJoinDate);
        const endStr = formatDate(row.movementDate);
        const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        
        // Ciptakan NIK Dummy: EX-Masuk-Keluar-RND (Misal: EX-20230124-20250119-045)
        const dummyNIK = `EX-${joinStr}-${endStr}-${randomSuffix}`;
        
        employee = await prisma.employee.create({
          data: {
            employeeNo: dummyNIK,
            fullName: row.employeeName,
            joinDate: safeJoinDate, 
            endDate: row.movementDate,
            status: 'INACTIVE', // Otomatis matikan
            storeId: storeId,    // Kaitkan dengan toko terakhir
            divisionId: divisionId,
            departmentId: departmentId
          }
        });
      } else {
        // Jika karyawan sudah ada di Master Data, matikan statusnya!
        await prisma.employee.update({
          where: { id: employee.id },
          data: { 
            status: 'INACTIVE',
            endDate: row.movementDate
          }
        });
      }

      // 3. === INSERT LOG MOVEMENT ===
      await prisma.employeeMovement.create({
        data: {
          employeeId: employee.id,
          movementType: row.movementType,
          movementDate: row.movementDate,
          reasonCategory: row.reason,
          storeId: storeId,
          divisionId: divisionId,
          departmentId: departmentId
        }
      });

      successCount++;
    } catch (error) {
      errorList.push(`Gagal memproses '${row.employeeName}': ${error.message}`);
    }
  }
  return { sukses: successCount, gagal: errorList.length, errorList };
};

const getTurnoverMovements = async (startDate, endDate) => {
  return await prisma.employeeMovement.findMany({
    where: {
      movementDate: { gte: startDate, lte: endDate },
      movementType: { in: ['VOLUNTARY', 'INVOLUNTARY', 'CONTRACT_END'] }
    },
    include: {
      employee: { include: { position: true } },
      store: true,
      department: true
    }
  });
};

const getExpiringContracts = async (targetDate) => {
  return await prisma.employee.findMany({
    where: { 
      endDate: { lte: targetDate, gt: new Date() }, 
      status: 'ACTIVE' 
    },
    include: { store: true, position: true },
    take: 6
  });
};

module.exports = {
  getAllMovements,
  getMovementById,
  createMovement,
  deleteMovement,
  processBulkMovement,
  getExpiringContracts,
  getTurnoverMovements
};