const repository = require('./repository');
const xlsx = require('xlsx');
const sr = require('../store/repository')
const prisma = require('../../config/database')

// Utility: Hitung usia/masa kerja ke format Desimal
const calculateYears = (startDate) => {
  if (!startDate) return null;
  const diffInMs = new Date() - new Date(startDate);
  const years = diffInMs / (1000 * 60 * 60 * 24 * 365.25);
  return parseFloat(years.toFixed(2));
};

// Tambahkan fungsi utility ini di service.js
const parseMonthYear = (monthStr) => {
  if (!monthStr) return null;
  const str = String(monthStr).toUpperCase().trim();
  const months = {
    'JAN': 1, 'JANUARI': 1, 'FEB': 2, 'FEBRUARI': 2, 'MAR': 3, 'MARET': 3,
    'APR': 4, 'APRIL': 4, 'MEI': 5, 'MAY': 5, 'JUN': 6, 'JUNI': 6,
    'JUL': 7, 'JULI': 7, 'AGU': 8, 'AGUSTUS': 8, 'SEP': 9, 'SEPTEMBER': 9,
    'OKT': 10, 'OKTOBER': 10, 'NOV': 11, 'NOVEMBER': 11, 'DES': 12, 'DESEMBER': 12
  };
  
  // Pisahkan berdasarkan spasi (meskipun spasinya ada banyak)
  const parts = str.split(/\s+/); 
  if (parts.length < 2) return null;
  
  // Ambil 2 kata terakhir
  const monthName = parts[parts.length - 2].replace(/[^A-Z]/g, ''); 
  const year = parseInt(parts[parts.length - 1]);
  
  const month = months[monthName];
  if (!month || isNaN(year)) return null;
  return { year, month };
};

// Fungsi pencari/pembuat periode dinamis
const getOrCreatePeriodId = async (year, month) => {
  let period = await repository.findPeriodByYearMonth(year, month);
  if (!period) {
    period = await openNewPeriod(year, month); // Otomatis buka periode jika belum ada!
  }
  return period.id;
};

// Utility: Parsing string BPJS ke Boolean
const parseBpjs = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase().includes('terdaftar');
  return false;
};

const openNewPeriod = async (year, month) => {
  const y = parseInt(year);
  const m = parseInt(month);

  const existingPeriod = await repository.findPeriodByYearMonth(y, m);
  if (existingPeriod) throw new Error(`Periode ${m}/${y} sudah ada!`);

  const periodStart = new Date(Date.UTC(y, m - 1, 1));
  const periodEnd = new Date(Date.UTC(y, m, 0));

  return await repository.createPeriod({ year: y, month: m, periodStart, periodEnd });
};

const getPeriods = async () => await repository.getAllPeriods();

const getAttendanceAggregate = async () => {
  return await repository.getAllAttendance();
};

const getAllSales = async () => {
  return await repository.getAllSales();
};

// GET Attendance
const getAttendance = async (periodId) => {
  const data = await repository.getAttendanceByPeriod(periodId);
  if (!data) {
    throw new Error("Data absensi belum tersedia untuk periode ini.");
  }
  return data;
};

// GET Sales
const getSales = async (periodId) => {
  const data = await repository.getSalesByPeriod(periodId);
  return data; // Kembalikan array kosong jika belum ada sales
};

const generateSnapshot = async (periodId) => {
  const employees = await repository.getActiveEmployeesForSnapshot();
  
  const snapshotData = employees.map(emp => {
    let status = 'ACTIVE';
    if (emp.endDate && new Date(emp.endDate) < new Date()) status = 'INACTIVE';

    return {
      periodId: periodId,
      employeeId: emp.id,
      divisionId: emp.divisionId,
      departmentId: emp.departmentId,
      positionId: emp.positionId,
      storeId: emp.storeId,
      employeeLevel: emp.position?.employeeLevel || null,
      employmentType: emp.employmentType,
      ageYears: calculateYears(emp.birthDate),
      tenureYears: calculateYears(emp.joinDate),
      employmentStatus: status,
      bpjsKetenagakerjaan: parseBpjs(emp.bpjsKetenagakerjaan),
      bpjsKesehatan: parseBpjs(emp.bpjsKesehatan),
      
      // ---> PERUBAHAN: Integrasi Gaji dari Master Karyawan <---
      budgetLabourCost: emp.baseSalary || 0, // Mengambil nilai dari tabel Employee
      actualLabourCost: null                 // Dikosongkan untuk diisi via Upload Actual
    };
  });

  const result = await repository.bulkCreateSnapshots(snapshotData);
  return { generated: result.count, totalEmployees: employees.length };
};

// 2. GANTI FUNGSI IMPORT ATTENDANCE & LABOUR COST
const importAttendanceAggregate = async (rawData) => {
  let successCount = 0;
  let currentScope = 'HQ'; // Default tabel bagian atas adalah HQ

  for (const row of rawData) {
    // 1. Deteksi jika melewati baris Header Kedua di tengah sheet (Tabel Store)
    const rowValues = Object.values(row).map(v => String(v || '').toUpperCase());
    if (rowValues.some(v => v.includes('JUMLAH KARYWAN STORE') || v.includes('JUMLAH KARYAWAN STORE'))) {
      currentScope = 'STORE';
      continue; // Lewati baris header ini, lanjut ke baris data Store di bawahnya
    }

    if (!row.BULAN || String(row.BULAN).toUpperCase() === 'BULAN') continue;

    const parsedDate = parseMonthYear(row.BULAN);
    if (!parsedDate) continue;

    const periodId = await getOrCreatePeriodId(parsedDate.year, parsedDate.month);

    // 2. Gunakan row.scope jika sudah diset dari parser, atau pakai currentScope hasil deteksi
    const activeScope = row.scope || currentScope;

    // 3. Normalisasi attendanceRate (di Excel nilainya desimal 0.8229 -> bulatkan 2 desimal)
    const rawRate = parseFloat(row.attendanceRate ?? row['%TASE KEHADIRAN'] ?? 0);

    const data = {
      totalEmployees: parseInt(row.totalEmployees ?? row['JUMLAH KARYWAN HEAD OFFICE'] ?? row['JUMLAH KARYWAN STORE'] ?? 0),
      sickCount: parseInt(row.sickCount ?? row['JML KARYAWAN SAKIT'] ?? 0),
      permissionCount: parseInt(row.permissionCount ?? row['JML KARYAWAN IJIN'] ?? 0),
      annualLeaveCount: parseInt(row.annualLeaveCount ?? row['CUTI TAHUNAN'] ?? 0),
      absentCount: parseInt(row.absentCount ?? row['ALPHA'] ?? 0),
      workingDays: parseInt(row.workingDays ?? row['HARI KERJA'] ?? 22) || 22,
      attendanceRate: isNaN(rawRate) ? null : Number(rawRate.toFixed(2))
    };

    // ✅ PERBAIKAN: Kirim 3 parameter (periodId, activeScope, data) sesuai urutan di repository!
    await repository.upsertAttendanceAggregate(periodId, activeScope, data);
    successCount++;
  }

  return { imported: successCount };
};

const importActualLabourCost = async (periodId, rawData) => {
  // rawData expect: [{ nik: "EMP-01", actualAmount: 5500000 }]
  const employees = await repository.getAllEmployeesNik();
  const kamusNik = {};
  employees.forEach(e => kamusNik[e.nik] = e.id);

  let successCount = 0;
  const updatePromises = rawData.map(row => {
    const empId = kamusNik[row.nik];
    if (!empId) return null; // Jika NIK tidak ditemukan, skip
    successCount++;
    return repository.updateSnapshotActualCost(periodId, empId, row.actualAmount || 0);
  }).filter(Boolean); // Buang yang null

  await Promise.all(updatePromises);
  return { imported: successCount };
};

const importSales = async (periodId, rawData) => {
  // 1. FASE FORMAT DATA
  // Menerjemahkan kolom Excel klien ('qty' dan 'Value') ke kolom Database ('salesQty' dan 'netSales')
  const formattedData = rawData.map(row => ({
    periodId: periodId,
    storeId: parseInt(row.storeId), // Pastikan jadi angka
    salesQty: parseFloat(row.qty || 0),
    netSales: parseFloat(row.Value || 0)
  })).filter(row => !isNaN(row.storeId)); // Buang baris kosong yang storeId-nya tidak valid
  // 2. FASE PROCESS BULK (Panggil Repository)
  const result = await repository.bulkCreateSales(formattedData);
  
  return { imported: result.count };
};

// --- DASHBOARD AGGREGATION LAYER (THE SOURCE OF TRUTH COMBINER) ---
const getDashboardSummary = async (periodId) => {
  // 1. Ambil Data Dasar
  const period = await prisma.reportingPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Periode tidak ditemukan");

  // 2. Ambil Snapshots (Pastikan include relasi divisinya!)
  const snapshots = await prisma.employeeMonthlySnapshot.findMany({
    where: { periodId },
    include: {
      employee: {
        include: {
          division: true,
          department: true,
          unit: true
        }
      }
    }
  });

  const attendance = await repository.getAttendanceByPeriod(periodId);
  const sales = await repository.getSalesByPeriod(periodId);

  // --- 3. PROSES DEMOGRAFI & GROUPING ---
  let totalAge = 0;
  let validAgeCount = 0;

  const distribution = {
    byDivision: {},
    byDepartment: {},
    byGender: {},
    byEmploymentType: {}
  };

  // --- TAMBAHAN: PENAMPUNG AGREGASI BIAYA ---
  const costDistribution = {
    byDivision: {},
    byDepartment: {},
    byEmploymentType: {}
  };

  let totalBudget = 0;
  let totalActual = 0;

  const STANDAR_HARI_KERJA = attendance ? parseFloat(attendance.workingDays || 22) : 22;

  snapshots.forEach(snap => {
    const emp = snap.employee;
    if (!emp) return;

    // --- KALKULASI FINANSIAL & ABSENSI ---
    const budget = parseFloat(snap.budgetLabourCost || emp.baseSalary || 0); // Fallback ke baseSalary
    
    // Hitung Actual Cost (Opsi 1: Otomatis potong absen jika actualLabourCost kosong/nol)
    let actual = parseFloat(snap.actualLabourCost || 0);
    if (actual === 0 && attendance) {
       // Asumsi kita punya data absen per karyawan di masa depan. 
       // Untuk saat ini, kita fallback actual = budget jika tidak ada data absen spesifik.
       actual = budget; 
    }

    totalBudget += budget;
    totalActual += actual;

    // A. Histori Umur
    if (emp.birthDate) {
      const birthYear = new Date(emp.birthDate).getFullYear();
      const ageAtPeriod = period.year - birthYear;
      totalAge += ageAtPeriod;
      validAgeCount++;
    }

    // Variabel Penamaan Kategori
    const divName = emp.division?.name || 'Uncategorized';
    const deptName = emp.department?.name || 'Uncategorized';
    const gender = emp.gender || 'Unknown';
    const status = emp.employmentType || 'Unknown';

    // B. Grouping Demografi (Hitungan Kepala)
    distribution.byDivision[divName] = (distribution.byDivision[divName] || 0) + 1;
    distribution.byDepartment[deptName] = (distribution.byDepartment[deptName] || 0) + 1;
    distribution.byGender[gender] = (distribution.byGender[gender] || 0) + 1;
    distribution.byEmploymentType[status] = (distribution.byEmploymentType[status] || 0) + 1;

    // C. Grouping Biaya (Untuk Tab Labour Cost)
    // 1. Biaya per Divisi
    if (!costDistribution.byDivision[divName]) costDistribution.byDivision[divName] = { headcount: 0, budgetCost: 0, actualCost: 0 };
    costDistribution.byDivision[divName].headcount += 1;
    costDistribution.byDivision[divName].budgetCost += budget;
    costDistribution.byDivision[divName].actualCost += actual;

    // 2. Biaya per Departemen
    if (!costDistribution.byDepartment[deptName]) costDistribution.byDepartment[deptName] = { headcount: 0, budgetCost: 0, actualCost: 0, parentDivision: divName };
    costDistribution.byDepartment[deptName].headcount += 1;
    costDistribution.byDepartment[deptName].budgetCost += budget;
    costDistribution.byDepartment[deptName].actualCost += actual;

    // 3. Biaya per Tipe Kontrak (Musiman vs Tetap)
    if (!costDistribution.byEmploymentType[status]) costDistribution.byEmploymentType[status] = { headcount: 0, budgetCost: 0, actualCost: 0 };
    costDistribution.byEmploymentType[status].headcount += 1;
    costDistribution.byEmploymentType[status].budgetCost += budget;
    costDistribution.byEmploymentType[status].actualCost += actual;
  });

  const avgAge = validAgeCount ? (totalAge / validAgeCount).toFixed(1) : 0;
  const totalSales = sales.reduce((sum, s) => sum + parseFloat(s.netSales || 0), 0);

  // --- HELPER FORMATTING BIAYA ---
  const formatCostAgg = (aggObj) => {
    return Object.keys(aggObj).map(key => {
      const item = aggObj[key];
      const variansAmount = item.actualCost - item.budgetCost;
      const variansPercentage = item.budgetCost > 0 ? (variansAmount / item.budgetCost) * 100 : 0;
      
      // Hitung Kontribusi Revenue Asumsi (Proporsional berdasarkan headcount jika tidak ada data real per divisi)
      const assumedRevenue = totalSales > 0 ? (item.headcount / snapshots.length) * totalSales : 0;
      const rasioThdRevenue = assumedRevenue > 0 ? ((item.actualCost / assumedRevenue) * 100).toFixed(2) + '%' : '0%';

      return {
        name: key,
        parentDivision: item.parentDivision || null,
        headcount: item.headcount,
        budgetCost: item.budgetCost,
        actualCost: item.actualCost,
        revenueContribution: assumedRevenue,
        labourCostRatio: rasioThdRevenue,
        variansAmount: variansAmount,
        variansPercentage: variansPercentage.toFixed(2) + '%',
        statusAnggaran: variansAmount > 0 ? 'Melebihi Anggaran' : 'Sesuai Anggaran'
      };
    });
  };

  // --- 4. SUSUN JSON FINAL UNTUK DASHBOARD ---
  return {
    period: {
      id: period.id,
      year: period.year,
      month: period.month
    },
    demographics: {
      totalHeadcount: snapshots.length,
      avgAgeAtPeriod: parseFloat(avgAge),
      distribution
    },
    attendance: attendance || null,
    productivity: {
      totalBudgetCost: totalBudget,
      totalActualCost: totalActual, // Sekarang menggunakan Actual!
      totalSales: totalSales,
      labourCostRatio: totalSales > 0 ? ((totalActual / totalSales) * 100).toFixed(2) + '%' : '0%', // Diperbaiki: Pakai Actual
      revenuePerFte: snapshots.length > 0 ? (totalSales / snapshots.length).toFixed(2) : 0,
      
      // --- DATA BARU UNTUK UI LABOUR COST ---
      costByDivision: formatCostAgg(costDistribution.byDivision),
      costByDepartment: formatCostAgg(costDistribution.byDepartment).sort((a, b) => b.actualCost - a.actualCost), // Langsung di-ranking
      costByEmploymentType: formatCostAgg(costDistribution.byEmploymentType)
    },
    retention: {
      totalResigned: 0, 
      turnoverRate: "0%"
    }
  };
};

const getStorePerformanceDashboard = async (periodId) => {
  const salesData = await repository.getSalesByPeriod(periodId);
  const allEmployees = await repository.getActiveEmployeesForSnapshot();
  const employees = allEmployees.filter(emp => emp.storeId !== null);

  const today = new Date();
  let totalNetSales = 0;
  let totalTargetSales = 0;

  // Helper penentu Region & StoreType otomatis jika di tabel Store masih null
  const inferRegion = (storeName, dbRegion) => {
    if (dbRegion && ['BARAT', 'TIMUR'].includes(dbRegion.toUpperCase())) return dbRegion.toUpperCase();
    const name = String(storeName || '').toUpperCase();
    const timurKeywords = ['SEMARANG', 'SMG', 'SOLO', 'SIDOARJO', 'JOMBANG', 'TUBAN', 'SALATIGA', 'CENDRAWASIH', 'MKS', 'MAKASSAR'];
    return timurKeywords.some(k => name.includes(k)) ? 'TIMUR' : 'BARAT';
  };

  const inferStoreType = (storeName, dbType) => {
    if (dbType) return dbType.toUpperCase();
    const name = String(storeName || '').toUpperCase();
    if (name.startsWith('FS ')) return 'FAMILY STORE';
    if (name.startsWith('SHOWROOM')) return 'SHOWROOM';
    return 'COUNTER';
  };

  const regionalData = {
    BARAT: { storeCount: 0, headcount: 0, totalAge: 0, validAgeCount: 0, totalTenure: 0, validTenureCount: 0, sales: 0, target: 0 },
    TIMUR: { storeCount: 0, headcount: 0, totalAge: 0, validAgeCount: 0, totalTenure: 0, validTenureCount: 0, sales: 0, target: 0 }
  };

  let managerTenureSum = 0; let managerCount = 0;
  let frontlineTenureSum = 0; let frontlineCount = 0;
  const leaderboard = [];
  const storeEmployeeMap = {};

  const calculateYears = (dateStr) => {
    if (!dateStr) return null;
    const years = (today - new Date(dateStr)) / (1000 * 60 * 60 * 24 * 365.25);
    return years > 0 ? years : null;
  };

  // 3. Mapping Karyawan Toko & Demografi (Dengan Fallback Region agar semua 19 orang masuk BARAT/TIMUR)
  employees.forEach(emp => {
    const storeName = emp.store?.storeName || '';
    const region = inferRegion(storeName, emp.store?.region);
    const age = calculateYears(emp.birthDate);
    const tenure = calculateYears(emp.joinDate);
    const posName = (emp.position?.name || emp.position?.employeeLevel || 'UNKNOWN').toUpperCase();
    const storeId = emp.storeId;
    const realSalary = parseFloat(emp.baseSalary || 0);

    if (!storeEmployeeMap[storeId]) {
      storeEmployeeMap[storeId] = { managers: 0, staffs: 0, managerTenure: 0, totalSalary: 0 };
    }

    storeEmployeeMap[storeId].totalSalary += (realSalary > 0 ? realSalary : 5000000);

    if (posName.includes('MANAGER') || posName.includes('LEADER')) {
      storeEmployeeMap[storeId].managers++;
      if (tenure !== null) {
        storeEmployeeMap[storeId].managerTenure = Math.max(storeEmployeeMap[storeId].managerTenure, tenure);
        managerCount++;
        managerTenureSum += tenure;
      }
    } else {
      storeEmployeeMap[storeId].staffs++;
      if (tenure !== null) {
        frontlineCount++;
        frontlineTenureSum += tenure;
      }
    }

    if (regionalData[region]) {
      regionalData[region].headcount++;
      if (age !== null) {
        regionalData[region].totalAge += age;
        regionalData[region].validAgeCount++;
      }
      if (tenure !== null) {
        regionalData[region].totalTenure += tenure;
        regionalData[region].validTenureCount++;
      }
    }
  });

  // 4. Mapping Penjualan & Leaderboard (Dengan Dummy Target sesuai arahan PM)
  salesData.forEach((sale, idx) => {
    const storeName = sale.store?.storeName || '';
    const cleanName = storeName.toUpperCase().trim();

    // Blokir baris rekap "TOTAL" dan data dummy testing "STORE SUDIRMAN"
    if (cleanName === 'TOTAL' || cleanName === 'STORE SUDIRMAN') return;

    const region = inferRegion(storeName, sale.store?.region);
    const storeType = inferStoreType(storeName, sale.store?.storeType);
    const actual = parseFloat(sale.netSales || 0);

    // ✅ DUMMY TARGET GENERATOR (Sesuai arahan PM):
    // Jika targetSales di DB masih null/0, buat dummy target proporsional (antara 88% s/d 112% dari actual)
    // supaya persentase achievement di Leaderboard & Regional hidup dan bervariasi!
    let target = parseFloat(sale.targetSales || 0);
    if (!target && actual > 0) {
      const multipliers = [0.90, 0.95, 1.02, 0.88, 1.05, 0.92, 1.08, 0.97, 1.12, 0.94];
      const factor = multipliers[(sale.storeId || idx) % multipliers.length];
      target = Math.round(actual * factor);
    }

    totalNetSales += actual;
    totalTargetSales += target;

    if (regionalData[region]) {
      regionalData[region].storeCount++;
      regionalData[region].sales += actual;
      regionalData[region].target += target;
    }

    const storeEmpStats = storeEmployeeMap[sale.storeId] || { managers: 0, staffs: 0, managerTenure: 0, totalSalary: 0 };
    const totalStaff = storeEmpStats.managers + storeEmpStats.staffs;
    const achPercent = target > 0 ? (actual / target) * 100 : 0;

    // ✅ Tambahan sesuai gambar metrik: Komposisi Labour Cost per Store vs Sales
    const storeLabourRatio = actual > 0 ? ((storeEmpStats.totalSalary / actual) * 100).toFixed(2) + '%' : '0%';

    leaderboard.push({
      storeName: storeName,
      region: region,
      storeType: storeType,
      headcount: totalStaff,
      spgRatio: `1 : ${storeEmpStats.managers > 0 ? (storeEmpStats.staffs / storeEmpStats.managers).toFixed(1) : storeEmpStats.staffs}`,
      leaderTenure: storeEmpStats.managerTenure.toFixed(1),
      netSales: actual,
      targetSales: target,
      achievement: achPercent.toFixed(1) + '%',
      labourCost: storeEmpStats.totalSalary,
      labourCostRatio: storeLabourRatio,
      revenuePerFte: totalStaff > 0 ? Math.round(actual / totalStaff) : 0
    });
  });

  // 5. Return JSON siap saji
  const formatRegion = (data) => ({
    storeCount: data.storeCount,
    headcount: data.headcount,
    avgAge: data.validAgeCount > 0 ? (data.totalAge / data.validAgeCount).toFixed(1) : '0.0',
    avgTenure: data.validTenureCount > 0 ? (data.totalTenure / data.validTenureCount).toFixed(1) : '0.0',
    achievement: data.target > 0 ? ((data.sales / data.target) * 100).toFixed(1) + '%' : '0%',
    revenuePerFte: data.headcount > 0 ? Math.round(data.sales / data.headcount) : 0
  });

  const mgrAvg = managerCount > 0 ? (managerTenureSum / managerCount) : 0;
  const frontAvg = frontlineCount > 0 ? (frontlineTenureSum / frontlineCount) : 0;

  return {
    success: true,
    data: {
      overview: {
        totalSales: totalNetSales,
        targetAchievement: totalTargetSales > 0 ? ((totalNetSales / totalTargetSales) * 100).toFixed(1) + '%' : '0%',
        retailAssociates: employees.length,
        revenuePerFte: employees.length > 0 ? Math.round(totalNetSales / employees.length) : 0
      },
      regionalComparison: {
        BARAT: formatRegion(regionalData.BARAT),
        TIMUR: formatRegion(regionalData.TIMUR)
      },
      tenureGap: {
        seniorManagerAvg: mgrAvg.toFixed(1),
        frontlineAvg: frontAvg.toFixed(1),
        gapYears: Math.max(0, mgrAvg - frontAvg).toFixed(1)
      },
      storeLeaderboard: leaderboard.sort((a, b) => parseFloat(b.achievement) - parseFloat(a.achievement))
    }
  };
};

//Universal Import 
const importAttendanceUniversal = async (raw2DArray) => {
  let successCount = 0;
  let currentScope = 'HQ';
  let currentHeaders = [];

  // 1. Looping setiap baris dari atas ke bawah
  for (let i = 0; i < raw2DArray.length; i++) {
    const row = raw2DArray[i];
    
    // Gabungkan teks dalam baris untuk mempermudah deteksi
    const rowString = row.join(' ').toUpperCase();

    // 2. Deteksi Baris Header & Transisi Scope
    if (rowString.includes('BULAN')) {
      // Bersihkan dan simpan susunan kolom header saat ini
      currentHeaders = row.map(h => typeof h === 'string' ? h.toUpperCase().replace(/\s+/g, ' ').trim() : h);
      
      // Deteksi identitas tabel berdasarkan teks di row tersebut
      if (rowString.includes('HEAD OFFICE') || rowString.includes('HO')) {
        currentScope = 'HQ';
      } else if (rowString.includes('STORE')) {
        currentScope = 'STORE';
      }
      continue; // Skip baris header ini, lanjut ke baris datanya
    }

    // 3. Baca Baris Data (Hanya berjalan jika header sudah didapatkan)
    if (currentHeaders.length === 0) continue;

    const rowData = {};
    currentHeaders.forEach((header, index) => {
      if (header) rowData[header] = row[index];
    });

    // Skip baris kosong atau baris pemisah antar tabel
    if (!rowData['BULAN']) continue; 

    // 4. Parsing Periode
    const parsedDate = parseMonthYear(rowData['BULAN']);
    if (!parsedDate) continue;

    const periodId = await getOrCreatePeriodId(parsedDate.year, parsedDate.month);

    // 5. Ambil Data Dinamis (Menangani penamaan kolom Jumlah Karyawan yang berubah-ubah)
    const totalEmpKey = Object.keys(rowData).find(key => 
      key.includes('KARY') && (key.includes('HEAD OFFICE') || key.includes('STORE') || key.includes('HO'))
    );
    
    const data = {
      totalEmployees: parseInt(rowData[totalEmpKey] || rowData['JUMLAH KARYWAN'] || 0),
      sickCount: parseInt(rowData['JML KARYAWAN SAKIT'] || 0),
      permissionCount: parseInt(rowData['JML KARYAWAN IJIN'] || 0),
      annualLeaveCount: parseInt(rowData['CUTI TAHUNAN'] || 0),
      absentCount: parseInt(rowData['ALPHA'] || 0),
      workingDays: parseInt(rowData['HARI KERJA'] || 22), 
      attendanceRate: parseFloat(rowData['%TASE KEHADIRAN'] || 0)
    };

    // Abaikan jika data isinya nol semua (mencegah error dari sel kosong)
    if (data.totalEmployees === 0 && data.sickCount === 0 && data.absentCount === 0) continue;

    // 6. Simpan ke Database menyertakan scope!
    await repository.upsertAttendanceAggregate(periodId, currentScope, data);
    successCount++;
  }
  
  return { imported: successCount };
};

const importSalesUniversal = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  
  // KUNCI SUKSES: { header: 1 } mengubah Excel jadi Array 2D murni
  const raw2DArray = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

  let header1Index = -1;
  // Cari baris NAMA TOKO (kebal spasi)
  for (let i = 0; i < raw2DArray.length; i++) {
    if (raw2DArray[i].some(cell => typeof cell === 'string' && cell.replace(/\s+/g, '').toUpperCase().includes('NAMATOKO'))) {
      header1Index = i;
      break;
    }
  }

  if (header1Index === -1) throw new Error("Format salah: Kolom 'NAMA TOKO' tidak ditemukan.");

  const headerMonths = raw2DArray[header1Index]; // Berisi: ["NAMA TOKO", ..., "Actual JAN 2026", null, ...]
  const dataRows = raw2DArray.slice(header1Index + 2); // Lewati judul kolom dan baris "qty, Value"
  
  const storeNameIndex = headerMonths.findIndex(h => typeof h === 'string' && h.replace(/\s+/g, '').toUpperCase().includes('NAMATOKO'));

  let formattedData = [];

  for (const row of dataRows) {
    const storeName = row[storeNameIndex];
    if (!storeName || String(storeName).trim() === '') continue; // Skip jika nama toko kosong

    // 1. === AUTO-CREATE STORE ===
    const storeId = await repository.getOrCreateStore(storeName);

    // 2. === PROSES UN-PIVOT ANGKA SALES ===
    for (let colIndex = 0; colIndex < headerMonths.length; colIndex++) {
      const monthCell = headerMonths[colIndex];
      
      if (typeof monthCell === 'string' && monthCell.toUpperCase().includes('ACTUAL')) {
        const parsedDate = parseMonthYear(monthCell);
        
        if (parsedDate) {
          const periodId = await getOrCreatePeriodId(parsedDate.year, parsedDate.month);
          
          // Pembersih Angka (menghapus Rp, koma, titik)
          const cleanNum = (val) => {
            if (val === undefined || val === null) return 0;
            if (typeof val === 'number') return val;
            const digits = String(val).replace(/\D/g, '');
            return parseInt(digits, 10) || 0;
          };

          // Karena pakai { header: 1 }, indeks array pasti pas!
          const qtyValue = cleanNum(row[colIndex]);
          const nominalValue = cleanNum(row[colIndex + 1]);

          // Hanya masukkan jika ada penjualan (hemat database)
          if (qtyValue > 0 || nominalValue > 0) {
            formattedData.push({
              periodId: periodId,
              storeId: storeId, // Pakai ID toko yang otomatis dibuat/dicari tadi
              salesQty: qtyValue,
              netSales: nominalValue
            });
          }
        }
      }
    }
  }

  if (formattedData.length > 0) {
    await repository.bulkCreateSales(formattedData);
  }
  // console.log(successCount);
  return { imported: formattedData.length };
};

module.exports = { 
  openNewPeriod, getPeriods, generateSnapshot, getStorePerformanceDashboard,
  importAttendanceAggregate, importActualLabourCost, importSales, getDashboardSummary,
  importAttendanceUniversal, importSalesUniversal, getAttendance, getSales, getAttendanceAggregate, getAllSales
};