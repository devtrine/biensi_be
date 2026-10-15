const prisma = require('../../config/database');

const normalizeText = (val) => {
  if (!val) return null;
  let clean = String(val).trim().replace(/\s+/g, ' ').toUpperCase();
  if (clean === 'COMERCIAL BUSSINESS' || clean === 'COMERCIAL BUSINESS') {
    clean = 'COMMERCIAL BUSINESS';
  }
  return clean;
};

const resolveRelations = async (row) => {
  let storeId = null, divisionId = null, departmentId = null;

  // 1. Resolve Store (Selalu Uppercase agar tidak duplikat)
  const cleanStoreName = normalizeText(row.storeName);
  if (cleanStoreName && cleanStoreName !== 'TOTAL') {
    let store = await prisma.store.findFirst({
      where: { storeName: { equals: cleanStoreName, mode: 'insensitive' } }
    });
    if (!store) {
      store = await prisma.store.create({
        data: { storeName: cleanStoreName, storeCode: `STR-${Date.now()}-${Math.floor(Math.random() * 100)}` }
      });
    }
    storeId = store.id;
  }

  // 2. Resolve Divisi & Departemen
  const cleanDivName = normalizeText(row.divisionName);
  if (cleanDivName) {
    let div = await prisma.division.findFirst({
      where: { name: { equals: cleanDivName, mode: 'insensitive' } }
    });
    if (!div) {
      div = await prisma.division.create({
        data: { name: cleanDivName, code: `DIV-${Date.now()}-${Math.floor(Math.random() * 100)}` }
      });
    }
    divisionId = div.id;
  }

  const cleanDeptName = normalizeText(row.departmentName);
  if (cleanDeptName && divisionId) {
    let dept = await prisma.department.findFirst({
      where: { name: { equals: cleanDeptName, mode: 'insensitive' } }
    });
    if (!dept) {
      dept = await prisma.department.create({
        data: { name: cleanDeptName, code: `DPT-${Date.now()}-${Math.floor(Math.random() * 100)}`, divisionId }
      });
    }
    departmentId = dept.id;
  }

  // 3. Resolve Employee (Cari via NIK dulu, lalu fallback ke Nama)
  let employee = null;
  const cleanName = String(row.employeeName || '').trim().toUpperCase();
  const cleanEmpNo = row.employeeNo ? String(row.employeeNo).trim().toUpperCase() : null;

  if (cleanEmpNo) {
    employee = await prisma.employee.findFirst({
      where: { employeeNo: { equals: cleanEmpNo, mode: 'insensitive' } }
    });
  }
  if (!employee && cleanName) {
    employee = await prisma.employee.findFirst({
      where: { fullName: { equals: cleanName, mode: 'insensitive' } }
    });
  }

  // Fallback Auto-Create (Tetap aman karena gender & baseSalary dibiarkan null sehingga tidak masuk Snapshot aktif)
  if (!employee) {
    const dummyNIK = cleanEmpNo || `EX-CASE-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
    employee = await prisma.employee.create({
      data: {
        employeeNo: dummyNIK,
        fullName: cleanName || dummyNIK,
        storeId,
        divisionId,
        departmentId,
        status: 'ACTIVE',
        joinDate: new Date()
      }
    });
  }

  return { employeeId: employee.id, storeId, divisionId, departmentId };
};

// === 1. PROCESS BULK SP (TOKO & HO) - ANTI REDUNDAN + AUTO-INACTIVE JIKA PHK ===
const processBulkSP = async (parsedData) => {
  let successCount = 0; let errorList = [];

  for (const row of parsedData) {
    try {
      const rel = await resolveRelations(row);
      const validStartDate = row.startDate || row.endDate || new Date();
      const discType = row.disciplineName || 'Surat Peringatan';

      // Cek apakah SP untuk karyawan ini pada tanggal & jenis SP yang sama sudah ada
      const existingSP = await prisma.disciplinaryCase.findFirst({
        where: {
          employeeId: rel.employeeId,
          disciplineType: { equals: discType, mode: 'insensitive' },
          startDate: validStartDate,
          category: { not: 'Fraud & Audit' }
        }
      });

      const spPayload = {
        employeeId: rel.employeeId,
        disciplineType: discType,
        category: row.category || 'Tata Tertib',
        startDate: validStartDate,
        endDate: row.endDate,
        remark: row.remark,
        divisionId: rel.divisionId,
        departmentId: rel.departmentId,
        storeId: rel.storeId,
        status: 'AKTIF'
      };

      if (existingSP) {
        await prisma.disciplinaryCase.update({
          where: { id: existingSP.id },
          data: {
            ...spPayload,
            referenceNo: row.referenceNo || existingSP.referenceNo
          }
        });
      } else {
        await prisma.disciplinaryCase.create({
          data: {
            ...spPayload,
            referenceNo: row.referenceNo || `SP-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 100)}`
          }
        });
      }

      // ✅ EFEK DOMINO OTOMATIS: Jika sanksi di tabel SP adalah PHK, langsung nonaktifkan karyawan!
      if (discType.toUpperCase().includes('PHK')) {
        await prisma.employee.update({
          where: { id: rel.employeeId },
          data: { status: 'INACTIVE', endDate: validStartDate }
        });
      }

      successCount++;
    } catch (error) {
      errorList.push(`Gagal SP '${row.employeeName}': ${error.message}`);
    }
  }
  return { successCount, failCount: errorList.length, errors: errorList };
};

// === 2. PROCESS BULK FRAUD (KHUSUS AUDIT) - ANTI REDUNDAN + AUTO-INACTIVE JIKA PHK ===
const processBulkFraud = async (parsedData) => {
  let successCount = 0; let errorList = [];

  // SAPU BERSIH OTOMATIS: Hapus baris Fraud lama yang caseDate-nya masih null (sisa import lama)
  const oldNullFrauds = await prisma.fraudCase.findMany({
    where: { caseDate: null },
    select: { id: true, disciplineId: true }
  });
  if (oldNullFrauds.length > 0) {
    const oldDiscIds = oldNullFrauds.map(f => f.disciplineId).filter(Boolean);
    await prisma.fraudCase.deleteMany({ where: { caseDate: null } });
    if (oldDiscIds.length > 0) {
      await prisma.disciplinaryCase.deleteMany({ where: { id: { in: oldDiscIds } } });
    }
  }

  for (const row of parsedData) {
    try {
      const rel = await resolveRelations(row);
      const validCaseDate = row.startDate || row.auditDate || new Date();
      const validAuditDate = row.auditDate || row.startDate || new Date();
      const bakbVal = row.bakbAmount || 0;
      const discQty = row.selisihQty || 0;
      const discType = row.disciplineName || 'Tindak Lanjut Audit';

      // 1. Cek apakah kasus Fraud ini sudah ada di DB berdasarkan Kunci Komposit Unik
      const existingFraud = await prisma.fraudCase.findFirst({
        where: {
          employeeId: rel.employeeId,
          storeId: rel.storeId,
          bakbAmount: bakbVal,
          discrepancyQty: discQty,
          caseDate: validCaseDate
        }
      });

      if (existingFraud) {
        if (existingFraud.disciplineId) {
          await prisma.disciplinaryCase.update({
            where: { id: existingFraud.disciplineId },
            data: {
              disciplineType: discType,
              startDate: validCaseDate,
              remark: row.remark,
              storeId: rel.storeId
            }
          });
        }

        await prisma.fraudCase.update({
          where: { id: existingFraud.id },
          data: {
            fraudCategory: row.fraudCategory || 'Selisih Barang',
            remark: row.remark,
            caseDate: validCaseDate,
            auditDate: validAuditDate,
            discrepancyQty: discQty,
            bakbAmount: bakbVal,
            salesTarget: row.salesTarget || 0,
            salesActual: row.salesActual || 0
          }
        });
      } else {
        const discipline = await prisma.disciplinaryCase.create({
          data: {
            employeeId: rel.employeeId,
            referenceNo: `FRD-${Date.now().toString().slice(-5)}-${Math.floor(Math.random() * 100)}`,
            disciplineType: discType,
            category: 'Fraud & Audit',
            startDate: validCaseDate,
            remark: row.remark,
            storeId: rel.storeId,
            status: 'AKTIF'
          }
        });

        await prisma.fraudCase.create({
          data: {
            employeeId: rel.employeeId,
            storeId: rel.storeId,
            disciplineId: discipline.id,
            fraudCategory: row.fraudCategory || 'Selisih Barang',
            remark: row.remark,
            caseDate: validCaseDate,
            auditDate: validAuditDate,
            discrepancyQty: discQty,
            bakbAmount: bakbVal,
            salesTarget: row.salesTarget || 0,
            salesActual: row.salesActual || 0,
            status: 'OPEN'
          }
        });
      }

      // ✅ EFEK DOMINO OTOMATIS: Jika sanksi dari temuan Fraud adalah PHK, langsung nonaktifkan karyawan!
      if (discType.toUpperCase().includes('PHK')) {
        await prisma.employee.update({
          where: { id: rel.employeeId },
          data: { status: 'INACTIVE', endDate: validCaseDate }
        });
      }

      successCount++;
    } catch (error) {
      errorList.push(`Gagal Fraud '${row.employeeName}': ${error.message}`);
    }
  }
  return { successCount, failCount: errorList.length, errors: errorList };
};

// === 3. PROCESS BULK BIPARTIT (KASUS INDUSTRIAL) - ANTI REDUNDAN (UPSERT) ===
const processBulkBipartit = async (parsedData) => {
  let successCount = 0; let errorList = [];

  for (const row of parsedData) {
    try {
      const rel = await resolveRelations(row);
      const ketUpper = String(row.keterangan || '').toUpperCase();
      const isFinished = Boolean(row.endDate) || ketUpper.includes('SELESAI');
      const caseStatus = isFinished ? 'SELESAI' : 'PROSES MEDIASI';
      const validStartDate = row.startDate || row.endDate || new Date();

      // Cek apakah kasus Bipartit untuk karyawan & toko ini sudah ada
      const existingCase = await prisma.industrialRelationCase.findFirst({
        where: {
          employeeId: rel.employeeId,
          storeId: rel.storeId,
          description: row.keterangan
        }
      });

      const casePayload = {
        employeeId: rel.employeeId,
        storeId: rel.storeId,
        caseCategory: row.category || 'Bipartit',
        description: row.keterangan,
        startDate: validStartDate,
        endDate: row.endDate,
        status: caseStatus
      };

      if (existingCase) {
        await prisma.industrialRelationCase.update({
          where: { id: existingCase.id },
          data: casePayload
        });
      } else {
        await prisma.industrialRelationCase.create({
          data: casePayload
        });
      }
      successCount++;
    } catch (error) {
      errorList.push(`Gagal Bipartit '${row.employeeName}': ${error.message}`);
    }
  }
  return { successCount, failCount: errorList.length, errors: errorList };
};

// === CRUD WRAPPERS ===
const getAllCases = async (filters = {}) => {
  return await prisma.disciplinaryCase.findMany({
    where: filters,
    include: { employee: true, store: true, division: true, fraudCases: true },
    orderBy: { createdAt: 'desc' }
  });
};

const getCaseById = async (id) => {
  return await prisma.disciplinaryCase.findUnique({
    where: { id },
    include: { employee: true, store: true, division: true, department: true, fraudCases: true }
  });
};

const deleteCase = async (id) => {
  await prisma.fraudCase.deleteMany({ where: { disciplineId: id } });
  return await prisma.disciplinaryCase.delete({ where: { id } });
};

const getDashboardData = async () => {
  const totalSP = await prisma.disciplinaryCase.count({
    where: { status: 'AKTIF', category: { not: 'Fraud & Audit' } }
  });

  const totalFraud = await prisma.fraudCase.count();

  const fraudAgg = await prisma.fraudCase.aggregate({
    _sum: { bakbAmount: true }
  });
  const totalLoss = fraudAgg._sum.bakbAmount || 0;

  const totalBipartit = await prisma.industrialRelationCase.count();

  const kpi = {
    totalSP,
    totalFraud,
    totalLoss: Number(totalLoss),
    totalBipartit
  };

  const spCases = await prisma.disciplinaryCase.findMany({
    where: { category: { not: 'Fraud & Audit' } },
    include: { employee: { select: { fullName: true, employeeNo: true } }, store: true },
    take: 20, orderBy: { startDate: 'desc' }
  });

  const fraudCases = await prisma.fraudCase.findMany({
    include: { employee: { select: { fullName: true, employeeNo: true } }, store: true, discipline: true },
    take: 20, orderBy: { auditDate: 'desc' }
  });

  const irCases = await prisma.industrialRelationCase.findMany({
    include: { employee: { select: { fullName: true, employeeNo: true } }, store: true },
    take: 20, orderBy: { startDate: 'desc' }
  });

  let tableData = [];

  spCases.forEach(sp => {
    tableData.push({
      caseNo: sp.referenceNo,
      category: `Disiplin / SP (${sp.category || 'Tata Tertib'})`,
      employeeName: sp.employee?.fullName || 'N/A',
      unit: sp.store?.storeName || 'Kantor Pusat',
      sanctionLevel: sp.disciplineType,
      financialLoss: null,
      remark: sp.remark || `Pelanggaran ${sp.category || 'Tata Tertib'}`,
      date: sp.startDate,
      status: sp.status
    });
  });

  fraudCases.forEach(fr => {
    tableData.push({
      caseNo: fr.discipline?.referenceNo || 'FRD-XXXX',
      category: 'Fraud & Audit',
      employeeName: fr.employee?.fullName || 'N/A',
      unit: fr.store?.storeName || 'N/A',
      sanctionLevel: fr.discipline?.disciplineType || 'Tindak Lanjut',
      financialLoss: Number(fr.bakbAmount),
      remark: fr.remark || fr.fraudCategory,
      date: fr.caseDate || fr.auditDate,
      status: fr.status
    });
  });

  irCases.forEach((ir, idx) => {
    tableData.push({
      caseNo: `BP-${String(idx + 1).padStart(4, '0')}`,
      category: `Industrial (${ir.caseCategory || 'Bipartit'})`,
      employeeName: ir.employee?.fullName || 'N/A',
      unit: ir.store?.storeName || 'N/A',
      sanctionLevel: ir.caseCategory || 'Mediasi',
      financialLoss: ir.financialImpact ? Number(ir.financialImpact) : null,
      remark: ir.description || ir.caseCategory,
      date: ir.startDate || ir.endDate,
      status: ir.status
    });
  });

  tableData.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return { kpi, tableData: tableData.slice(0, 50) };
};

module.exports = {
  processBulkSP,
  processBulkFraud,
  getAllCases,
  getCaseById,
  deleteCase,
  getDashboardData,
  processBulkBipartit
};