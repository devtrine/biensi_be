const prisma = require('../../config/database');

const normalizeText = (val) => {
  if (!val) return null;
  let clean = String(val).trim().replace(/\s+/g, ' ').toUpperCase();
  if (clean === 'COMERCIAL BUSSINESS' || clean === 'COMERCIAL BUSINESS') {
    clean = 'COMMERCIAL BUSINESS';
  }
  return clean;
};

const getAllMovements = async (filters) => {
  const { page = 1, limit = 10, search, movementType } = filters;
  const skip = (page - 1) * limit;

  const where = {};
  if (movementType) where.movementType = movementType;
  if (search) {
    where.employee = {
      fullName: { contains: search, mode: 'insensitive' }
    };
  }

  const [data, total] = await Promise.all([
    prisma.employeeMovement.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { movementDate: 'desc' },
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
      const cleanEmpName = normalizeText(row.employeeName);
      if (!cleanEmpName) continue;

      // 1. === AUTO-UPDATE / CREATE STORE ===
      let storeId = null;
      const cleanStoreName = normalizeText(row.storeName);
      if (cleanStoreName && cleanStoreName !== 'TOTAL') {
        let store = await prisma.store.findFirst({
          where: { storeName: { equals: cleanStoreName, mode: 'insensitive' } }
        });

        if (!store) {
          store = await prisma.store.create({
            data: {
              storeName: cleanStoreName,
              storeCode: `STR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              region: normalizeText(row.region),
              storeType: normalizeText(row.storeType),
              asstHead: normalizeText(row.asstHead)
            }
          });
        } else {
          await prisma.store.update({
            where: { id: store.id },
            data: {
              region: normalizeText(row.region) || store.region,
              storeType: normalizeText(row.storeType) || store.storeType,
              asstHead: normalizeText(row.asstHead) || store.asstHead
            }
          });
        }
        storeId = store.id;
      }

      // 2. === AUTO-CREATE / CARI DIVISI & DEPARTEMEN ===
      let divisionId = null;
      const cleanDivName = normalizeText(row.divisionName);
      if (cleanDivName) {
        let division = await prisma.division.findFirst({
          where: { name: { equals: cleanDivName, mode: 'insensitive' } }
        });
        if (!division) {
          division = await prisma.division.create({
            data: {
              name: cleanDivName,
              code: `DIV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            }
          });
        }
        divisionId = division.id;
      }

      let departmentId = null;
      const cleanDeptName = normalizeText(row.departmentName);
      if (cleanDeptName) {
        let department = await prisma.department.findFirst({
          where: { name: { equals: cleanDeptName, mode: 'insensitive' } }
        });
        if (!department && divisionId) {
          department = await prisma.department.create({
            data: {
              name: cleanDeptName,
              code: `DPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              divisionId: divisionId
            }
          });
        }
        if (department) departmentId = department.id;
      }

      // 3. === CARI KARYAWAN (PRIORITAS 1: NIK, PRIORITAS 2: NAMA) & AUTO-INACTIVE ===
      let employee = null;
      const cleanEmpNo = row.employeeNo ? String(row.employeeNo).trim().toUpperCase() : null;

      if (cleanEmpNo) {
        employee = await prisma.employee.findFirst({
          where: { employeeNo: { equals: cleanEmpNo, mode: 'insensitive' } }
        });
      }
      if (!employee) {
        employee = await prisma.employee.findFirst({
          where: { fullName: { equals: cleanEmpName, mode: 'insensitive' } }
        });
      }

      const safeJoinDate = row.joinDate || new Date(row.movementDate.getFullYear(), 0, 1);

      if (!employee) {
        const formatDate = (date) => {
          if (!date) return '00000000';
          const d = new Date(date);
          return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        };

        const joinStr = formatDate(safeJoinDate);
        const endStr = formatDate(row.movementDate);
        const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const finalNIK = cleanEmpNo || `EX-${joinStr}-${endStr}-${randomSuffix}`;

        employee = await prisma.employee.create({
          data: {
            employeeNo: finalNIK,
            fullName: cleanEmpName,
            joinDate: safeJoinDate,
            endDate: row.movementDate,
            status: 'INACTIVE',
            storeId: storeId,
            divisionId: divisionId,
            departmentId: departmentId
          }
        });
      } else {
        // ✅ OTOMATIS SET INACTIVE: Saat karyawan di Master masuk ke Bulk Turnover akhir bulan,
        // langsung matikan statusnya dan warisi relasi jabatannya!
        employee = await prisma.employee.update({
          where: { id: employee.id },
          data: {
            status: 'INACTIVE',
            endDate: row.movementDate,
            storeId: employee.storeId || storeId,
            divisionId: employee.divisionId || divisionId,
            departmentId: employee.departmentId || departmentId
          }
        });
      }

      // 4. === SMART UPSERT LOG MOVEMENT (ANTI REDUNDAN!) ===
      const existingMovement = await prisma.employeeMovement.findFirst({
        where: {
          employeeId: employee.id,
          movementDate: row.movementDate
        }
      });

      const movementPayload = {
        employeeId: employee.id,
        movementType: row.movementType,
        movementDate: row.movementDate,
        reasonCategory: row.reason,
        storeId: storeId || employee.storeId,
        divisionId: divisionId || employee.divisionId,
        departmentId: departmentId || employee.departmentId
      };

      if (existingMovement) {
        await prisma.employeeMovement.update({
          where: { id: existingMovement.id },
          data: movementPayload
        });
      } else {
        await prisma.employeeMovement.create({
          data: movementPayload
        });
      }

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
      status: 'ACTIVE',
      baseSalary: { not: null } 
    },
    include: { store: true, position: true },
    orderBy: { endDate: 'asc' },
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