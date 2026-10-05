const prisma = require('../../config/database');

const findAllEmployees = async (searchQuery = '') => {
  return await prisma.employee.findMany({
    where: searchQuery ? {
      OR: [
        { fullName: { contains: searchQuery, mode: 'insensitive' } },
        { employeeNo: { contains: searchQuery, mode: 'insensitive' } }
      ]
    } : {},
    include: {
      division: true,
      department: true,
      unit: true,        // Relasi baru
      position: true,
      store: true
    },
    orderBy: { fullName: 'asc' }
  });
};

const findEmployeeById = async (id) => {
  return await prisma.employee.findUnique({
    where: { id }, // UUID tidak perlu parseInt
    include: { division: true, department: true, unit: true, position: true, store: true }
  });
};

const findEmployeeByNo = async (employeeNo) => {
  return await prisma.employee.findUnique({ where: { employeeNo } });
};

const createEmployee = async (data) => {
  // 1. Ekstrak semua relasi ID keluar dari objek data, sisanya masuk ke 'basicData'
  const { 
    divisionId, 
    departmentId, 
    unitId, 
    positionId, 
    storeId, 
    ...basicData // Berisi employeeNo, fullName, birthDate, dll (tanpa Id relasi)
  } = data;

  // 2. Kirim ke Prisma dengan format 'connect' yang aman
  return await prisma.employee.create({
    data: {
      ...basicData, // Data bersih dimasukkan
      
      // Jika ID ada nilainya, kita buatkan objek connect-nya
      ...(divisionId ? { division: { connect: { id: divisionId } } } : {}),
      ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
      ...(unitId ? { unit: { connect: { id: unitId } } } : {}),
      ...(positionId ? { position: { connect: { id: positionId } } } : {}),
      ...(storeId ? { store: { connect: { id: storeId } } } : {})
    }
  });
};

const updateEmployee = async (id, data) => {
  // Sama, ekstrak dulu sebelum update
  const { 
    divisionId, 
    departmentId, 
    unitId, 
    positionId, 
    storeId, 
    ...basicData 
  } = data;

  return await prisma.employee.update({
    where: { id },
    data: {
      ...basicData,
      
      ...(divisionId !== undefined && { 
        division: divisionId ? { connect: { id: divisionId } } : { disconnect: true } 
      }),
      ...(departmentId !== undefined && { 
        department: departmentId ? { connect: { id: departmentId } } : { disconnect: true } 
      }),
      ...(unitId !== undefined && { 
        unit: unitId ? { connect: { id: unitId } } : { disconnect: true } 
      }),
      ...(positionId !== undefined && { 
        position: positionId ? { connect: { id: positionId } } : { disconnect: true } 
      }),
      ...(storeId !== undefined && { 
        store: storeId ? { connect: { id: storeId } } : { disconnect: true } 
      })
    }
  });
};

const deleteEmployee = async (id) => {
  return await prisma.employee.delete({ where: { id } });
};
const processBulkImport = async (rawData) => {
  const results = { sukses: 0, gagal: 0, errorList: [] };

  for (const row of rawData) {
    try {
      if (!row.employeeNo) continue;

      // 1. Resolve Master Data (find or create) -> Tambahkan let storeId = null
      let divisionId = null, departmentId = null, unitId = null, positionId = null, storeId = null;

      if (row.divisionName) {
        let div = await prisma.division.findFirst({ where: { name: { equals: row.divisionName, mode: 'insensitive' } } });
        if (!div) div = await prisma.division.create({ data: { name: row.divisionName, code: `DIV-${Date.now()}` } });
        divisionId = div.id;
      }

      if (row.departmentName && divisionId) {
        let dept = await prisma.department.findFirst({ where: { name: { equals: row.departmentName, mode: 'insensitive' } } });
        if (!dept) dept = await prisma.department.create({ data: { name: row.departmentName, code: `DEPT-${Date.now()}`, divisionId } });
        departmentId = dept.id;
      }

      if (row.unitName && departmentId) {
        let unit = await prisma.unit.findFirst({ where: { name: { equals: row.unitName, mode: 'insensitive' } } });
        if (!unit) unit = await prisma.unit.create({ data: { name: row.unitName, code: `UNT-${Date.now()}`, departmentId } });
        unitId = unit.id;
      }

      if (row.positionName) {
        let pos = await prisma.position.findFirst({ where: { name: { equals: row.positionName, mode: 'insensitive' } } });
        if (!pos) pos = await prisma.position.create({ data: { name: row.positionName, code: `POS-${Date.now()}`, employeeLevel: row.levelName || 'STAFF' } });
        positionId = pos.id;
      }

      // --- TAMBAHAN BLOK STORE YANG BENAR ---
      if (row.storeName) {
        let store = await prisma.store.findFirst({ where: { storeName: { equals: row.storeName, mode: 'insensitive' } } });
        if (!store) store = await prisma.store.create({ data: { storeName: row.storeName, storeCode: `STR-${Date.now()}` } });
        storeId = store.id;
      }
      // --------------------------------------

      // 2. Siapkan data karyawan untuk Prisma
      const employeeData = {
        employeeNo: row.employeeNo,
        fullName: row.fullName,
        gender: row.gender,
        birthDate: row.birthDate,
        educationLevel: row.educationLevel,
        employmentType: row.employmentType,
        joinDate: row.joinDate,
        endDate: row.endDate,
        bpjsKetenagakerjaan: row.bpjsKetenagakerjaan,
        bpjsKesehatan: row.bpjsKesehatan,
        
        // Relasi (menggunakan sintaks connect yang aman)
        ...(divisionId ? { division: { connect: { id: divisionId } } } : {}),
        ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
        ...(unitId ? { unit: { connect: { id: unitId } } } : {}),
        ...(positionId ? { position: { connect: { id: positionId } } } : {}),
        
        // --- SUNTIKKAN STORE ID KE SINI ---
        ...(storeId ? { store: { connect: { id: storeId } } } : {})
      };

      // 3. Eksekusi Upsert
      await prisma.employee.upsert({
        where: { employeeNo: employeeData.employeeNo },
        update: employeeData,
        create: employeeData
      });

      results.sukses++;
    } catch (error) {
      results.gagal++;
      results.errorList.push(`Error NIK ${row.employeeNo}: ${error.message}`);
    }
  }
  return results;
};

module.exports = {
  findAllEmployees,
  findEmployeeById,
  findEmployeeByNo,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  processBulkImport
};