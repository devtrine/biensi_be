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

const formatImportRowError = (row, fullName, error) => {
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
  return `${rowNum} (NIK: ${cleanEmpNo}, Nama: ${cleanName}): ${reason}`;
};

const runInChunks = async (items, chunkSize, worker) => {
  for (let i = 0; i < items.length; i += chunkSize) {
    await Promise.all(items.slice(i, i + chunkSize).map(worker));
  }
};

const processBulkImport = async (rawData) => {
  const results = { sukses: 0, gagal: 0, errorList: [] };
  if (!Array.isArray(rawData) || rawData.length === 0) return results;

  // 1. Pra-saring baris ringkasan/footer dan NIK tidak valid sebelum query ke DB
  const validRows = [];
  const candidateNoSet = new Set();

  for (const row of rawData) {
    const rawFullName = row.fullName ? String(row.fullName).trim() : '';
    const empNo = String(row.employeeNo || '').trim().replace(/^['"`\s]+/, '').toUpperCase();

    const isSummaryOrIndexRow =
      !empNo ||
      ['TOTAL', 'SUM', 'SUBTOTAL', 'RATA-RATA'].includes(empNo) ||
      (empNo === '1' && (!rawFullName || rawFullName === 'TIDAK ADA NAMA' || rawFullName.toUpperCase() === 'TOTAL' || /^\d+$/.test(rawFullName))) ||
      (/^\d+$/.test(empNo) && /^\d+$/.test(rawFullName));

    if (isSummaryOrIndexRow) {
      if (!empNo && rawFullName && rawFullName !== 'TIDAK ADA NAMA' && rawFullName.toUpperCase() !== 'TOTAL' && !/^\d+$/.test(rawFullName)) {
        results.gagal++;
        results.errorList.push(`Baris ${row.rowNumber || 'Data'} (Nama: ${row.fullName}): NIK kosong atau format NIK tidak valid`);
      }
      continue;
    }

    if (empNo.length < 3) {
      if (row.fullName && row.fullName !== 'TIDAK ADA NAMA') {
        results.gagal++;
        results.errorList.push(`Baris ${row.rowNumber || 'Data'} (Nama: ${row.fullName}): NIK "${empNo}" terlalu pendek / tidak valid`);
      }
      continue;
    }

    const cleanBase = empNo.replace(/-(STR|HO)$/, '');
    candidateNoSet.add(empNo);
    candidateNoSet.add(`${cleanBase}-STR`);
    candidateNoSet.add(`${cleanBase}-HO`);
    validRows.push({ row, initialEmpNo: empNo, rawFullName });
  }

  if (validRows.length === 0) return results;

  // 2. Pre-fetch seluruh master data & karyawan eksisting sekaligus (6 query paralel, bebas N+1)
  const [divisions, departments, units, positions, stores, existingEmployees] = await Promise.all([
    prisma.division.findMany(),
    prisma.department.findMany(),
    prisma.unit.findMany(),
    prisma.position.findMany(),
    prisma.store.findMany(),
    prisma.employee.findMany({
      where: { employeeNo: { in: Array.from(candidateNoSet) } }
    })
  ]);

  const masterKey = (val) => String(val || '').trim().toUpperCase();
  const divMap = new Map(divisions.map((d) => [masterKey(d.name), d]));
  const deptMap = new Map(departments.map((d) => [masterKey(d.name), d]));
  const unitMap = new Map(units.map((u) => [masterKey(u.name), u]));
  const posMap = new Map(positions.map((p) => [masterKey(p.name), p]));
  const storeMap = new Map(stores.map((s) => [masterKey(s.storeName), s]));
  const empMap = new Map(existingEmployees.map((e) => [e.employeeNo.trim().toUpperCase(), e]));

  const pendingPositionLevelUpdates = new Map();
  const pendingStoreUpdates = new Map();
  const writesByEmpNo = new Map();

  // 3. Resolusi master & payload per baris secara kronologis di memori
  for (const item of validRows) {
    const { row, initialEmpNo, rawFullName } = item;
    let empNo = initialEmpNo;
    let fullName = rawFullName;

    try {
      const divName = normalizeText(row.divisionName);
      const deptName = normalizeText(row.departmentName);
      const unitName = normalizeText(row.unitName);
      const posName = normalizeText(row.positionName);
      const levelName = normalizeText(row.levelName) || 'STAFF';
      const storeName = normalizeText(row.storeName);
      const storeRegion = normalizeText(row.storeRegion);
      const storeType = normalizeText(row.storeType);

      const safeDivName = divName ? divName.substring(0, 95) : null;
      const safeDeptName = deptName ? deptName.substring(0, 95) : null;
      const safeUnitName = unitName ? unitName.substring(0, 95) : null;
      const safePosName = posName ? posName.substring(0, 95) : null;

      fullName = row.fullName && String(row.fullName).trim() !== ''
        ? String(row.fullName).trim().toUpperCase().substring(0, 190)
        : `KARYAWAN ${empNo}`;

      // Antisipasi NIK Ganda antara HO dan Toko
      const existingEmp = empMap.get(empNo) || null;
      const isDifferentScope = existingEmp && (Boolean(storeName) !== (existingEmp.storeId !== null));
      const isDummyName = ['UJI', 'COBA', 'TEST'].includes(fullName) || fullName.startsWith('KARYAWAN ');
      if (isDifferentScope && (String(existingEmp.fullName || '').toUpperCase() !== fullName || isDummyName)) {
        if (storeName) {
          empNo = `${empNo}-STR`;
        } else if (existingEmp.storeId !== null) {
          const strNo = `${empNo}-STR`;
          const strTaken = empMap.get(strNo);
          if (!strTaken) {
            if (!existingEmp._isNewPending) {
              await prisma.employee.update({
                where: { id: existingEmp.id },
                data: { employeeNo: strNo }
              });
            }
            const oldKey = existingEmp.employeeNo.trim().toUpperCase();
            empMap.delete(oldKey);
            existingEmp.employeeNo = strNo;
            empMap.set(strNo, existingEmp);

            const pendingEntry = writesByEmpNo.get(oldKey);
            if (pendingEntry) {
              writesByEmpNo.delete(oldKey);
              pendingEntry.empNo = strNo;
              pendingEntry.payload.employeeNo = strNo;
              for (const r of pendingEntry.rows) {
                r.row.employeeNo = strNo;
                r.resolvedBase.employeeNo = strNo;
              }
              writesByEmpNo.set(strNo, pendingEntry);
            }
          } else {
            empNo = `${empNo}-HO`;
          }
        }
      }
      row.employeeNo = empNo;

      // Resolve Master Data via cache Map (query DB hanya jika belum ada)
      let divisionId = null, departmentId = null, unitId = null, positionId = null, storeId = null;

      if (safeDivName) {
        let div = divMap.get(safeDivName);
        if (!div) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          try {
            div = await prisma.division.create({ data: { name: safeDivName, code: `DIV-${Date.now()}-${rand}` } });
          } catch (e) {
            div = await prisma.division.findFirst({ where: { name: { equals: safeDivName, mode: 'insensitive' } } });
            if (!div) throw e;
          }
          divMap.set(safeDivName, div);
        }
        divisionId = div.id;
      }

      if (safeDeptName && divisionId) {
        let dept = deptMap.get(safeDeptName);
        if (!dept) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          try {
            dept = await prisma.department.create({ data: { name: safeDeptName, code: `DEPT-${Date.now()}-${rand}`, divisionId } });
          } catch (e) {
            dept = await prisma.department.findFirst({ where: { name: { equals: safeDeptName, mode: 'insensitive' } } });
            if (!dept) throw e;
          }
          deptMap.set(safeDeptName, dept);
        }
        departmentId = dept.id;
      }

      if (safeUnitName && departmentId) {
        let unit = unitMap.get(safeUnitName);
        if (!unit) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          try {
            unit = await prisma.unit.create({ data: { name: safeUnitName, code: `UNT-${Date.now()}-${rand}`, departmentId } });
          } catch (e) {
            unit = await prisma.unit.findFirst({ where: { name: { equals: safeUnitName, mode: 'insensitive' } } });
            if (!unit) throw e;
          }
          unitMap.set(safeUnitName, unit);
        }
        unitId = unit.id;
      }

      if (safePosName) {
        let pos = posMap.get(safePosName);
        if (!pos) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          try {
            pos = await prisma.position.create({
              data: { name: safePosName, code: `POS-${Date.now()}-${rand}`, employeeLevel: levelName }
            });
          } catch (e) {
            pos = await prisma.position.findFirst({ where: { name: { equals: safePosName, mode: 'insensitive' } } });
            if (!pos) throw e;
          }
          posMap.set(safePosName, pos);
        } else if (row.levelName && pos.employeeLevel !== levelName) {
          pos.employeeLevel = levelName;
          pendingPositionLevelUpdates.set(pos.id, levelName);
        }
        positionId = pos.id;
      }

      if (storeName && storeName !== 'TOTAL') {
        let store = storeMap.get(storeName);
        if (!store) {
          try {
            store = await prisma.store.create({
              data: {
                storeName,
                storeCode: `STR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                region: storeRegion,
                storeType
              }
            });
          } catch (e) {
            store = await prisma.store.findFirst({ where: { storeName: { equals: storeName, mode: 'insensitive' } } });
            if (!store) throw e;
          }
          storeMap.set(storeName, store);
        } else if ((storeRegion && store.region !== storeRegion) || (storeType && store.storeType !== storeType)) {
          store.region = storeRegion || store.region;
          store.storeType = storeType || store.storeType;
          pendingStoreUpdates.set(store.id, {
            region: store.region,
            storeType: store.storeType
          });
        }
        storeId = store.id;
      }

      const parsedSalary = (() => {
        const rawValue = row.baseSalary;
        if (rawValue === undefined || rawValue === null || rawValue === '') return null;
        if (typeof rawValue === 'number') return rawValue;
        const cleanStr = String(rawValue).replace(/[^0-9.-]+/g, '');
        const num = parseFloat(cleanStr);
        return isNaN(num) ? null : Math.round(num);
      })();

      const empType = normalizeText(row.employmentType);
      let validEndDate = row.endDate ? new Date(row.endDate) : null;
      if (validEndDate && isNaN(validEndDate.getTime())) validEndDate = null;
      if (empType === 'TETAP' || (validEndDate && validEndDate.getFullYear() < 2020)) {
        validEndDate = null;
      }

      let validBirthDate = row.birthDate ? new Date(row.birthDate) : null;
      if (validBirthDate && isNaN(validBirthDate.getTime())) validBirthDate = null;

      const targetEmp = empMap.get(empNo) || null;
      const parsedJoinDate = row.joinDate ? new Date(row.joinDate) : null;
      const hasExplicitJoinDate = Boolean(parsedJoinDate && !isNaN(parsedJoinDate.getTime()));
      const validJoinDate = hasExplicitJoinDate
        ? parsedJoinDate
        : (targetEmp?.joinDate || new Date());

      const normalizedGender = normalizeGender(row.gender);
      const normalizedEducation = normalizeText(row.educationLevel);
      const periodCutoffDate = (row.periodYear && row.periodMonth)
        ? new Date(Date.UTC(row.periodYear, row.periodMonth, 0, 23, 59, 59))
        : new Date();

      const scalarPayload = {
        employeeNo: empNo,
        fullName,
        gender: normalizedGender,
        birthDate: validBirthDate,
        educationLevel: normalizedEducation,
        employmentType: empType,
        joinDate: validJoinDate,
        endDate: validEndDate,
        status: (validEndDate && validEndDate < periodCutoffDate) ? 'INACTIVE' : 'ACTIVE',
        bpjsKetenagakerjaan: Boolean(row.bpjsKetenagakerjaan),
        bpjsKesehatan: Boolean(row.bpjsKesehatan),
        baseSalary: parsedSalary,
        divisionId: divisionId ?? null,
        departmentId: departmentId ?? null,
        UnitId: unitId ?? null,
        positionId: positionId ?? null,
        storeId: storeId ?? null
      };

      const existingWrite = writesByEmpNo.get(empNo);
      const isNewEmployee = !targetEmp || targetEmp._isNewPending;

      let mergedPayload;
      if (!existingWrite) {
        if (isNewEmployee) {
          mergedPayload = { ...scalarPayload };
        } else {
          mergedPayload = {
            ...scalarPayload,
            ...(normalizedGender ? {} : { gender: undefined }),
            ...(validBirthDate ? {} : { birthDate: undefined }),
            ...(normalizedEducation ? {} : { educationLevel: undefined }),
            ...(hasExplicitJoinDate ? {} : { joinDate: undefined }),
            ...(parsedSalary !== null ? {} : { baseSalary: undefined })
          };
        }
      } else {
        mergedPayload = {
          ...existingWrite.payload,
          ...scalarPayload,
          ...(normalizedGender ? {} : { gender: existingWrite.payload.gender }),
          ...(validBirthDate ? {} : { birthDate: existingWrite.payload.birthDate }),
          ...(normalizedEducation ? {} : { educationLevel: existingWrite.payload.educationLevel }),
          ...(hasExplicitJoinDate ? {} : { joinDate: existingWrite.payload.joinDate }),
          ...(parsedSalary !== null ? {} : { baseSalary: existingWrite.payload.baseSalary })
        };
      }

      // Perbarui state in-memory agar baris berikutnya untuk NIK yang sama melihat nilai terbaru
      empMap.set(empNo, {
        ...(targetEmp || { _isNewPending: true }),
        employeeNo: empNo,
        fullName,
        gender: normalizedGender ?? targetEmp?.gender ?? null,
        birthDate: validBirthDate ?? targetEmp?.birthDate ?? null,
        educationLevel: normalizedEducation ?? targetEmp?.educationLevel ?? null,
        joinDate: hasExplicitJoinDate ? validJoinDate : (targetEmp?.joinDate ?? validJoinDate),
        baseSalary: parsedSalary !== null ? parsedSalary : (targetEmp?.baseSalary ?? null),
        storeId: storeId ?? null
      });

      const resolvedBase = {
        employeeId: targetEmp && !targetEmp._isNewPending ? targetEmp.id : null,
        employeeNo: empNo,
        divisionId,
        departmentId,
        positionId,
        storeId,
        employeeLevel: levelName,
        employmentType: empType,
        birthDate: validBirthDate ?? targetEmp?.birthDate ?? null,
        joinDate: hasExplicitJoinDate ? validJoinDate : (targetEmp?.joinDate ?? validJoinDate),
        endDate: validEndDate,
        baseSalary: parsedSalary ?? (targetEmp?.baseSalary !== null && targetEmp?.baseSalary !== undefined ? Number(targetEmp.baseSalary) : null),
        bpjsKetenagakerjaan: Boolean(row.bpjsKetenagakerjaan),
        bpjsKesehatan: Boolean(row.bpjsKesehatan)
      };

      const rowMeta = { row, fullName, hasExplicitJoinDate, resolvedBase };
      if (!existingWrite) {
        writesByEmpNo.set(empNo, {
          empNo,
          isNew: isNewEmployee,
          dbId: targetEmp && !targetEmp._isNewPending ? targetEmp.id : null,
          payload: mergedPayload,
          rows: [rowMeta]
        });
      } else {
        existingWrite.payload = mergedPayload;
        existingWrite.rows.push(rowMeta);
      }
    } catch (error) {
      results.gagal++;
      results.errorList.push(formatImportRowError(row, fullName, error));
    }
  }

  // 4. Flush pembaruan metadata Position & Store (maksimal 10 paralel agar aman bagi pool DB)
  if (pendingPositionLevelUpdates.size > 0) {
    const posUpdates = Array.from(pendingPositionLevelUpdates.entries());
    await runInChunks(posUpdates, 10, ([id, employeeLevel]) =>
      prisma.position.update({ where: { id }, data: { employeeLevel } })
    );
  }
  if (pendingStoreUpdates.size > 0) {
    const storeUpdates = Array.from(pendingStoreUpdates.entries());
    await runInChunks(storeUpdates, 10, ([id, data]) =>
      prisma.store.update({ where: { id }, data })
    );
  }

  const applySuccess = (entry, savedEmp) => {
    for (const r of entry.rows) {
      r.row._resolved = {
        ...r.resolvedBase,
        employeeId: savedEmp.id,
        birthDate: r.resolvedBase.birthDate ?? savedEmp.birthDate ?? null,
        joinDate: r.hasExplicitJoinDate ? r.resolvedBase.joinDate : (savedEmp.joinDate ?? r.resolvedBase.joinDate),
        baseSalary:
          r.resolvedBase.baseSalary ??
          (savedEmp.baseSalary !== null && savedEmp.baseSalary !== undefined
            ? Number(savedEmp.baseSalary)
            : null)
      };
      results.sukses++;
    }
  };

  const applyFailure = (entry, error) => {
    for (const r of entry.rows) {
      results.gagal++;
      results.errorList.push(formatImportRowError(r.row, r.fullName, error));
    }
  };

  const allEntries = Array.from(writesByEmpNo.values());
  const newEntries = allEntries.filter((e) => e.isNew);
  const updateEntries = allEntries.filter((e) => !e.isNew);

  // 5a. Batch insert karyawan baru via createMany, fallback per-baris jika ada error agar errorList tetap presisi
  const CREATE_BATCH_SIZE = 200;
  for (let i = 0; i < newEntries.length; i += CREATE_BATCH_SIZE) {
    const chunk = newEntries.slice(i, i + CREATE_BATCH_SIZE);
    let createdMap = new Map();
    let batchFailed = false;

    try {
      await prisma.employee.createMany({
        data: chunk.map((e) => e.payload),
        skipDuplicates: true
      });
      const fetched = await prisma.employee.findMany({
        where: { employeeNo: { in: chunk.map((e) => e.empNo) } },
        select: { id: true, employeeNo: true, birthDate: true, joinDate: true, baseSalary: true }
      });
      createdMap = new Map(fetched.map((e) => [e.employeeNo.trim().toUpperCase(), e]));
    } catch (_) {
      batchFailed = true;
    }

    for (const entry of chunk) {
      const saved = !batchFailed ? createdMap.get(entry.empNo) : null;
      if (saved) {
        applySuccess(entry, saved);
      } else {
        try {
          const created = await prisma.employee.create({
            data: entry.payload,
            select: { id: true, employeeNo: true, birthDate: true, joinDate: true, baseSalary: true }
          });
          applySuccess(entry, created);
        } catch (err) {
          applyFailure(entry, err);
        }
      }
    }
  }

  // 5b. Update karyawan eksisting menggunakan FK skalar langsung (1 SQL UPDATE per karyawan, concurrency 10)
  await runInChunks(updateEntries, 10, async (entry) => {
    try {
      const updated = await prisma.employee.update({
        where: { id: entry.dbId },
        data: entry.payload,
        select: { id: true, employeeNo: true, birthDate: true, joinDate: true, baseSalary: true }
      });
      applySuccess(entry, updated);
    } catch (err) {
      applyFailure(entry, err);
    }
  });

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