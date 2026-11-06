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
      const storeRegion = normalizeText(row.storeRegion);
      const storeType = normalizeText(row.storeType);

      // Batasi panjang teks agar tidak melebihi batasan varchar database
      const safeDivName = divName ? divName.substring(0, 95) : null;
      const safeDeptName = deptName ? deptName.substring(0, 95) : null;
      const safeUnitName = unitName ? unitName.substring(0, 95) : null;
      const safePosName = posName ? posName.substring(0, 95) : null;

      // Fallback nama jika kosong (seperti baris pertama A15161718 di Excel HO)
      const fullName = row.fullName && String(row.fullName).trim() !== ''
        ? String(row.fullName).trim().toUpperCase().substring(0, 190)
        : `KARYAWAN ${empNo}`;

      // 2. Antisipasi NIK Ganda antara HO dan Toko (Contoh: A15161760 dipakai Bagus Prayudo & Riko)
      const existingEmp = await prisma.employee.findUnique({ where: { employeeNo: empNo } });
      if (existingEmp && existingEmp.fullName.toUpperCase() !== fullName) {
        // Jika salah satunya orang Toko dan namanya beda, beri sufiks -STR agar tidak saling timpa
        if (storeName) {
          empNo = `${empNo}-STR`;
        }
      }
      row.employeeNo = empNo;

      // 3. Resolve Master Data (Find or Create dengan nama yang sudah dinormalisasi)
      let divisionId = null, departmentId = null, unitId = null, positionId = null, storeId = null;

      if (safeDivName) {
        let div = await prisma.division.findFirst({ where: { name: { equals: safeDivName, mode: 'insensitive' } } });
        if (!div) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          div = await prisma.division.create({ data: { name: safeDivName, code: `DIV-${Date.now()}-${rand}` } });
        }
        divisionId = div.id;
      }

      if (safeDeptName && divisionId) {
        let dept = await prisma.department.findFirst({ where: { name: { equals: safeDeptName, mode: 'insensitive' } } });
        if (!dept) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          dept = await prisma.department.create({ data: { name: safeDeptName, code: `DEPT-${Date.now()}-${rand}`, divisionId } });
        }
        departmentId = dept.id;
      }

      if (safeUnitName && departmentId) {
        let unit = await prisma.unit.findFirst({ where: { name: { equals: safeUnitName, mode: 'insensitive' } } });
        if (!unit) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          unit = await prisma.unit.create({ data: { name: safeUnitName, code: `UNT-${Date.now()}-${rand}`, departmentId } });
        }
        unitId = unit.id;
      }

      if (safePosName) {
        let pos = await prisma.position.findFirst({ where: { name: { equals: safePosName, mode: 'insensitive' } } });
        if (!pos) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          pos = await prisma.position.create({
            data: { name: safePosName, code: `POS-${Date.now()}-${rand}`, employeeLevel: levelName }
          });
        } else if (row.levelName && pos.employeeLevel !== levelName) {
          // Pastikan level jabatan ter-update jika sebelumnya masih default
          pos = await prisma.position.update({ where: { id: pos.id }, data: { employeeLevel: levelName } });
        }
        positionId = pos.id;
      }

      if (storeName && storeName !== 'TOTAL') {
        let store = await prisma.store.findFirst({ where: { storeName: { equals: storeName, mode: 'insensitive' } } });
        if (!store) {
          store = await prisma.store.create({
            data: {
              storeName: storeName,
              storeCode: `STR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              region: storeRegion,
              storeType: storeType
            }
          });
        } else if ((storeRegion && store.region !== storeRegion) || (storeType && store.storeType !== storeType)) {
          store = await prisma.store.update({
            where: { id: store.id },
            data: {
              region: storeRegion || store.region,
              storeType: storeType || store.storeType
            }
          });
        }
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

      // 5. Validasi Tanggal (Aman terhadap Invalid Date)
      const empType = normalizeText(row.employmentType);
      let validEndDate = row.endDate ? new Date(row.endDate) : null;
      if (validEndDate && isNaN(validEndDate.getTime())) validEndDate = null;
      if (empType === 'TETAP' || (validEndDate && validEndDate.getFullYear() < 2020)) {
        validEndDate = null;
      }

      let validBirthDate = row.birthDate ? new Date(row.birthDate) : null;
      if (validBirthDate && isNaN(validBirthDate.getTime())) validBirthDate = null;

      let validJoinDate = row.joinDate ? new Date(row.joinDate) : new Date();
      if (validJoinDate && isNaN(validJoinDate.getTime())) validJoinDate = new Date();

      const basePayload = {
        employeeNo: empNo,
        fullName: fullName,
        gender: normalizeGender(row.gender),
        birthDate: validBirthDate,
        educationLevel: normalizeText(row.educationLevel),
        employmentType: empType,
        joinDate: validJoinDate,
        endDate: validEndDate,
        status: (validEndDate && validEndDate < new Date()) ? 'INACTIVE' : 'ACTIVE',
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
      const rowNum = row.rowNumber ? `Baris ${row.rowNumber}` : 'Baris Data';
      const cleanEmpNo = row.employeeNo || '-';
      const cleanName = fullName || '-';
      let reason = error.message || 'Kesalahan pemrosesan data';
      if (reason.includes('Unique constraint failed')) {
        reason = 'Data duplikat pada database';
      } else if (reason.includes('too long for type')) {
        reason = 'Teks pada kolom melebihi batas panjang karakter';
      } else if (reason.includes('Invalid Date') || reason.includes('DateTime')) {
        reason = 'Format tanggal tidak valid';
      } else if (reason.includes('foreign key constraint')) {
        reason = 'Relasi master organisasi tidak valid';
      }
      results.errorList.push(`${rowNum} (NIK: ${cleanEmpNo}, Nama: ${cleanName}): ${reason}`);
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
