const prisma = require('../../config/database');

const resolveRelations = async (row) => {
  let storeId = null, divisionId = null, departmentId = null;

  // Resolve Store
  if (row.storeName) {
    const cleanStoreName = String(row.storeName).trim();
    let store = await prisma.store.findFirst({ where: { storeName: { equals: cleanStoreName, mode: 'insensitive' } } });
    if (!store) store = await prisma.store.create({ data: { storeName: cleanStoreName, storeCode: `STR-${Date.now()}` } });
    storeId = store.id;
  }

  // Resolve Divisi & Departemen
  if (row.divisionName) {
    let div = await prisma.division.findFirst({ where: { name: { equals: String(row.divisionName).trim(), mode: 'insensitive' } } });
    if (!div) div = await prisma.division.create({ data: { name: row.divisionName, code: `DIV-${Date.now()}` } });
    divisionId = div.id;
  }
  if (row.departmentName) {
    let dept = await prisma.department.findFirst({ where: { name: { equals: String(row.departmentName).trim(), mode: 'insensitive' } } });
    if (!dept) dept = await prisma.department.create({ data: { name: row.departmentName, code: `DPT-${Date.now()}`, divisionId } });
    departmentId = dept.id;
  }

  // Resolve Employee
  let employee = null;
  const cleanName = String(row.employeeName).trim();
  if (row.employeeNo) {
    employee = await prisma.employee.findFirst({ where: { employeeNo: row.employeeNo } });
  } else {
    employee = await prisma.employee.findFirst({ where: { fullName: { equals: cleanName, mode: 'insensitive' } } });
  }

// Auto Create Employee
  if (!employee) {
    const dummyNIK = row.employeeNo || `EX-HO-${Date.now().toString().slice(-6)}`;
    employee = await prisma.employee.create({
      data: {
        employeeNo: dummyNIK,
        fullName: cleanName,
        storeId, 
        divisionId, 
        departmentId,
        status: 'ACTIVE',
        joinDate: new Date() // <--- INI KUNCI UTAMANYA! Tambahkan baris ini.
      }
    });
  }

  return { employeeId: employee.id, storeId, divisionId, departmentId };
};

// === 1. PROCESS BULK SP (TOKO & HO) ===
const processBulkSP = async (parsedData) => {
  let successCount = 0; let errorList = [];

  for (const row of parsedData) {
    try {
      const rel = await resolveRelations(row);
      await prisma.disciplinaryCase.create({
        data: {
          employeeId: rel.employeeId,
          referenceNo: row.referenceNo || `SP-${Date.now().toString().slice(-5)}`,
          disciplineType: row.disciplineName || 'Surat Peringatan',
          category: row.category || 'Tata Tertib',
          startDate: row.startDate,
          endDate: row.endDate,
          remark: row.remark,
          divisionId: rel.divisionId,
          departmentId: rel.departmentId,
          storeId: rel.storeId,
          status: 'AKTIF'
        }
      });
      successCount++;
    } catch (error) {
      errorList.push(`Gagal SP '${row.employeeName}': ${error.message}`);
    }
  }
  return { successCount, failCount: errorList.length, errors: errorList };
};

// === 2. PROCESS BULK FRAUD (KHUSUS AUDIT) ===
const processBulkFraud = async (parsedData) => {
  let successCount = 0; let errorList = [];

  for (const row of parsedData) {
    try {
      const rel = await resolveRelations(row);
      
      // Buat SP-nya dulu (Induk Kasus)
      const discipline = await prisma.disciplinaryCase.create({
        data: {
          employeeId: rel.employeeId,
          referenceNo: `FRD-${Date.now().toString().slice(-5)}`,
          disciplineType: row.disciplineName || 'Tindak Lanjut Audit',
          category: 'Fraud & Audit',
          startDate: row.startDate,
          remark: row.remark,
          storeId: rel.storeId,
          status: 'AKTIF'
        }
      });

      // Buat Data Fraud-nya (Child/Detail Kasus)
      await prisma.fraudCase.create({
        data: {
          employeeId: rel.employeeId,
          storeId: rel.storeId,
          disciplineId: discipline.id,
          fraudCategory: row.fraudCategory || 'Selisih Barang',
          remark: row.remark,
          auditDate: row.auditDate || row.startDate,
          discrepancyQty: row.selisihQty || 0,
          bakbAmount: row.bakbAmount || 0,
          salesTarget: row.salesTarget || 0,
          salesActual: row.salesActual || 0,
          status: 'OPEN'
        }
      });
      successCount++;
    } catch (error) {
      errorList.push(`Gagal Fraud '${row.employeeName}': ${error.message}`);
    }
  }
  return { successCount, failCount: errorList.length, errors: errorList };
};

const processBulkBipartit = async (parsedData) => {
  let successCount = 0; let errorList = [];

  for (const row of parsedData) {
    try {
      // Panggil resolver ajaib kita (sudah auto-create NIK dummy & resolve toko)
      const rel = await resolveRelations(row);
      
      // Pragmatis: Jika ada periode selesai berarti sudah Selesai, kalau kosong berarti Proses
      const caseStatus = row.endDate ? 'SELESAI' : 'PROSES MEDIASI';

      await prisma.industrialRelationCase.create({
        data: {
          employeeId: rel.employeeId,
          storeId: rel.storeId,
          caseCategory: row.category || 'Bipartit',
          description: row.keterangan,
          startDate: row.startDate,
          endDate: row.endDate,
          status: caseStatus 
        }
      });
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
  // 1. HITUNG KPI (Key Performance Indicators)
  const totalSP = await prisma.disciplinaryCase.count({
    where: { status: 'AKTIF', category: { not: 'Fraud & Audit' } }
  });
  
  const totalFraud = await prisma.fraudCase.count();
  
  // Hitung total nilai kerugian dari Fraud BAKB (Bisa ditambah dengan IR jika ada kolomnya nanti)
  const fraudAgg = await prisma.fraudCase.aggregate({
    _sum: { bakbAmount: true }
  });
  const totalLoss = fraudAgg._sum.bakbAmount || 0;

  const totalBipartit = await prisma.industrialRelationCase.count();

  const kpi = {
    totalSP,
    totalFraud,
    totalLoss: Number(totalLoss), // Pastikan jadi angka biasa
    totalBipartit
  };

  // 2. AMBIL RAW DATA UNTUK TABEL
  const spCases = await prisma.disciplinaryCase.findMany({
    where: { category: { not: 'Fraud & Audit' } }, // Hanya SP biasa
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

  // 3. UNIFIED FORMAT (Menyamakan bentuk data agar pas dengan kolom UI)
  let tableData = [];

  // Format Data SP
  spCases.forEach(sp => {
    tableData.push({
      caseNo: sp.referenceNo,
      category: 'Disiplin / SP',
      employeeName: sp.employee?.fullName || 'N/A',
      unit: sp.store?.storeName || 'Kantor Pusat',
      sanctionLevel: sp.disciplineType, // SP-1, SP-2, dll
      financialLoss: null,
      remark: sp.remark || 'Pelanggaran Tata Tertib',
      date: sp.startDate,
      status: sp.status
    });
  });

  // Format Data Fraud
  fraudCases.forEach(fr => {
    tableData.push({
      caseNo: fr.discipline?.referenceNo || 'FRD-XXXX',
      category: 'Fraud & Audit',
      employeeName: fr.employee?.fullName || 'N/A',
      unit: fr.store?.storeName || 'N/A',
      sanctionLevel: fr.discipline?.disciplineType || 'Tindak Lanjut',
      financialLoss: Number(fr.bakbAmount),
      remark: fr.remark || fr.fraudCategory,
      date: fr.auditDate,
      status: fr.status
    });
  });

  // Format Data Bipartit
  irCases.forEach(ir => {
    tableData.push({
      caseNo: `BP-${Date.now().toString().slice(-4)}`, // Asumsi jika ada referenceNo
      category: 'Bipartit / Disnaker',
      employeeName: ir.employee?.fullName || 'N/A',
      unit: ir.store?.storeName || 'N/A',
      sanctionLevel: 'Mediasi',
      financialLoss: ir.financialImpact ? Number(ir.financialImpact) : null,
      remark: ir.description || ir.caseCategory,
      date: ir.startDate,
      status: ir.status
    });
  });

  // 4. URUTKAN GABUNGAN DATA BERDASARKAN TANGGAL TERBARU
  tableData.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { kpi, tableData: tableData.slice(0, 50) }; // Kembalikan 50 data teratas
};

module.exports = { processBulkSP, processBulkFraud, getAllCases, getCaseById,
                    deleteCase, getDashboardData, processBulkBipartit };