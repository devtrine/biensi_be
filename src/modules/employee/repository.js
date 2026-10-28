const prisma = require('../../config/database');

// Helper: Normalisasi teks & perbaiki typo divisi dari Excel
const normalizeText = (val) => {
  if (!val) return null;
  let clean = String(val).trim().replace(/\s+/g, ' ').toUpperCase();
  if (clean === 'COMERCIAL BUSSINESS' || clean === 'COMERCIAL BUSINESS') {
    clean = 'COMMERCIAL BUSINESS';
  }
  return clean;
};

// Normalisasi Gender Jika Ada typo pada import file
const normalizeGender = (val) => {
  if (!val) return null;
  const clean = String(val).replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (
    clean.includes('LAKI') ||
    clean.includes('PRIA') ||
    clean.includes('MALE') ||
    clean === 'L' ||
    clean === 'LK' ||
    clean === 'M'
  ) {
    return 'LAKI-LAKI';
  }
  if (
    clean.includes('PEREMPUAN') ||
    clean.includes('WANITA') ||
    clean.includes('FEMALE') ||
    clean === 'P' ||
    clean === 'PR' ||
    clean === 'W' ||
    clean === 'F'
  ) {
    return 'PEREMPUAN';
  }
  return clean;
};

const findAllEmployees = async (searchQuery = '', status = null) => {
  return await prisma.employee.findMany({
    where: {
      // Saring agar karyawan bayangan (auto-create dari SP/Turnover yang gendernya null) tidak mengotori list
      gender: { not: null },
      ...(status ? { status } : { status: { not: 'INACTIVE' } }),
      ...(searchQuery ? {
        OR: [
          { fullName: { contains: searchQuery, mode: 'insensitive' } },
          { employeeNo: { contains: searchQuery, mode: 'insensitive' } }
        ]
      } : {})
    },
    include: {
      division: true,
      department: true,
      unit: true,
      position: true,
      store: true
    },
    orderBy: { fullName: 'asc' }
  });
};

const findEmployeeById = async (id) => {
  return await prisma.employee.findUnique({
    where: { id },
    include: { division: true, department: true, unit: true, position: true, store: true }
  });
};

const findEmployeeByNo = async (employeeNo) => {
  return await prisma.employee.findUnique({ where: { employeeNo } });
};

const createEmployee = async (data) => {
  const { divisionId, departmentId, unitId, positionId, storeId, ...basicData } = data;

  return await prisma.employee.create({
    data: {
      ...basicData,
      ...(divisionId ? { division: { connect: { id: divisionId } } } : {}),
      ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
      ...(unitId ? { unit: { connect: { id: unitId } } } : {}),
      ...(positionId ? { position: { connect: { id: positionId } } } : {}),
      ...(storeId ? { store: { connect: { id: storeId } } } : {})
    }
  });
};

const updateEmployee = async (id, data) => {
  const { divisionId, departmentId, unitId, positionId, storeId, ...basicData } = data;

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
  return await prisma.employee.update({
    where: { id },
    data: { status: 'INACTIVE' }
  });
};

const processBulkImport = async (rawData) => {
  const results = { sukses: 0, gagal: 0, errorList: [] };

  for (const row of rawData) {
    try {
      // 1. Validasi NIK: Blokir baris null dan baris angka sampah (seperti '1' di bawah sheet Toko)
      let empNo = String(row.employeeNo || '').trim().toUpperCase();
      if (!empNo || !/^[A-Z]/.test(empNo)) continue;

      const divName = normalizeText(row.divisionName);
      const deptName = normalizeText(row.departmentName);
      const unitName = normalizeText(row.unitName);
      const posName = normalizeText(row.positionName);
      const levelName = normalizeText(row.levelName) || 'STAFF';
      const storeName = normalizeText(row.storeName);

      // Fallback nama jika kosong (seperti baris pertama A15161718 di Excel HO)
      const fullName = row.fullName && String(row.fullName).trim() !== ''
        ? String(row.fullName).trim().toUpperCase()
        : `KARYAWAN ${empNo}`;

      // 2. Antisipasi NIK Ganda antara HO dan Toko (Contoh: A15161760 dipakai Bagus Prayudo & Riko)
      const existingEmp = await prisma.employee.findUnique({ where: { employeeNo: empNo } });
      if (existingEmp && existingEmp.fullName.toUpperCase() !== fullName) {
        // Jika salah satunya orang Toko dan namanya beda, beri sufiks -STR agar tidak saling timpa
        if (storeName) {
          empNo = `${empNo}-STR`;
        }
      }

      // 3. Resolve Master Data (Find or Create dengan nama yang sudah dinormalisasi)
      let divisionId = null, departmentId = null, unitId = null, positionId = null, storeId = null;

      if (divName) {
        let div = await prisma.division.findFirst({ where: { name: { equals: divName, mode: 'insensitive' } } });
        if (!div) div = await prisma.division.create({ data: { name: divName, code: `DIV-${Date.now()}` } });
        divisionId = div.id;
      }

      if (deptName && divisionId) {
        let dept = await prisma.department.findFirst({ where: { name: { equals: deptName, mode: 'insensitive' } } });
        if (!dept) dept = await prisma.department.create({ data: { name: deptName, code: `DEPT-${Date.now()}`, divisionId } });
        departmentId = dept.id;
      }

      if (unitName && departmentId) {
        let unit = await prisma.unit.findFirst({ where: { name: { equals: unitName, mode: 'insensitive' } } });
        if (!unit) unit = await prisma.unit.create({ data: { name: unitName, code: `UNT-${Date.now()}`, departmentId } });
        unitId = unit.id;
      }

      if (posName) {
        let pos = await prisma.position.findFirst({ where: { name: { equals: posName, mode: 'insensitive' } } });
        if (!pos) {
          pos = await prisma.position.create({
            data: { name: posName, code: `POS-${Date.now()}`, employeeLevel: levelName }
          });
        } else if (row.levelName && pos.employeeLevel !== levelName) {
          // Pastikan level jabatan ter-update jika sebelumnya masih default
          pos = await prisma.position.update({ where: { id: pos.id }, data: { employeeLevel: levelName } });
        }
        positionId = pos.id;
      }

      if (storeName && storeName !== 'TOTAL') {
        let store = await prisma.store.findFirst({ where: { storeName: { equals: storeName, mode: 'insensitive' } } });
        if (!store) store = await prisma.store.create({ data: { storeName: storeName, storeCode: `STR-${Date.now()}` } });
        storeId = store.id;
      }

      // 4. Parsing Gaji yang Aman terhadap Desimal ("4500000.0" -> 4500000)
      const parsedSalary = (() => {
        const rawValue = row.baseSalary;
        if (rawValue === undefined || rawValue === null || rawValue === '') return null;
        if (typeof rawValue === 'number') return rawValue;
        const cleanStr = String(rawValue).replace(/[^0-9.-]+/g, '');
        const num = parseFloat(cleanStr);
        return isNaN(num) ? null : Math.round(num);
      })();

      // 5. Validasi Tanggal Habis Kontrak (Abaikan jika status TETAP atau tahun di bawah 2020 seperti 1957-05-20)
      const empType = normalizeText(row.employmentType);
      let validEndDate = row.endDate ? new Date(row.endDate) : null;
      if (empType === 'TETAP' || (validEndDate && validEndDate.getFullYear() < 2020)) {
        validEndDate = null;
      }

      const basePayload = {
        employeeNo: empNo,
        fullName: fullName,
        gender: normalizeGender(row.gender),
        birthDate: row.birthDate ? new Date(row.birthDate) : null,
        educationLevel: normalizeText(row.educationLevel),
        employmentType: empType,
        joinDate: row.joinDate ? new Date(row.joinDate) : new Date(),
        endDate: validEndDate,
        bpjsKetenagakerjaan: Boolean(row.bpjsKetenagakerjaan),
        bpjsKesehatan: Boolean(row.bpjsKesehatan),
        baseSalary: parsedSalary
      };

      // 6. Eksekusi Upsert (Pastikan relasi bisa di-disconnect jika karyawan HO tidak punya storeId)
      await prisma.employee.upsert({
        where: { employeeNo: empNo },
        create: {
          ...basePayload,
          ...(divisionId ? { division: { connect: { id: divisionId } } } : {}),
          ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
          ...(unitId ? { unit: { connect: { id: unitId } } } : {}),
          ...(positionId ? { position: { connect: { id: positionId } } } : {}),
          ...(storeId ? { store: { connect: { id: storeId } } } : {})
        },
        update: {
          ...basePayload,
          division: divisionId ? { connect: { id: divisionId } } : { disconnect: true },
          department: departmentId ? { connect: { id: departmentId } } : { disconnect: true },
          unit: unitId ? { connect: { id: unitId } } : { disconnect: true },
          position: positionId ? { connect: { id: positionId } } : { disconnect: true },
          store: storeId ? { connect: { id: storeId } } : { disconnect: true }
        }
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