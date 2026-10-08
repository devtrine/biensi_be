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

  for (const row of rawData) {
    if (!row.BULAN) continue; // Jika tidak ada keterangan bulan, lewati
    
    const parsedDate = parseMonthYear(row.BULAN);
    if (!parsedDate) continue;

    const periodId = await getOrCreatePeriodId(parsedDate.year, parsedDate.month);

    const data = {
      totalEmployees: row.totalEmployees || 0,
      sickCount: row.sickCount || 0,
      permissionCount: row.permissionCount || 0,
      annualLeaveCount: row.annualLeaveCount || 0,
      absentCount: row.absentCount || 0,
      workingDays: row.workingDays || 0,
      attendanceRate: row.attendanceRate || null
    };

    await repository.upsertAttendanceAggregate(periodId, data);
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
  // Ini memanggil prisma.salesMonthly.createMany() yang ada di repository.js
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

  let totalBudget = 0;
  let totalActual = 0;

  snapshots.forEach(snap => {
    const emp = snap.employee;
    
    // Kalkulasi Finansial (Pastikan di-parse ke Float jika Decimal dari Prisma)
    totalBudget += parseFloat(snap.budgetLabourCost || 0);
    totalActual += parseFloat(snap.actualLabourCost || 0);

    if (!emp) return;

    // A. Histori Umur yang Akurat (Tahun Periode - Tahun Lahir)
    if (emp.birthDate) {
      const birthYear = new Date(emp.birthDate).getFullYear();
      const ageAtPeriod = period.year - birthYear; // Umur pada saat periode tersebut!
      totalAge += ageAtPeriod;
      validAgeCount++;
    }

    // B. Grouping Divisi
    const divName = emp.division?.name || 'Uncategorized';
    distribution.byDivision[divName] = (distribution.byDivision[divName] || 0) + 1;

    // C. Grouping Departemen
    const deptName = emp.department?.name || 'Uncategorized';
    distribution.byDepartment[deptName] = (distribution.byDepartment[deptName] || 0) + 1;

    // D. Grouping Gender
    const gender = emp.gender || 'Unknown';
    distribution.byGender[gender] = (distribution.byGender[gender] || 0) + 1;

    // E. Grouping Status Kontrak
    const status = emp.employmentType || 'Unknown';
    distribution.byEmploymentType[status] = (distribution.byEmploymentType[status] || 0) + 1;
  });

  const avgAge = validAgeCount ? (totalAge / validAgeCount).toFixed(1) : 0;
  const totalSales = sales.reduce((sum, s) => sum + parseFloat(s.netSales || 0), 0);

  // --- 4. SUSUN JSON FINAL UNTUK DASHBOARD ---
  return {
    period: {
      id: period.id,
      year: period.year,
      month: period.month
    },
    demographics: {
      totalHeadcount: snapshots.length,
      avgAgeAtPeriod: parseFloat(avgAge), // Penamaan lebih jelas!
      distribution // Seluruh data pie-chart masuk ke sini
    },
    attendance: attendance || null,
    productivity: {
      totalBudgetCost: totalBudget,
      totalActualCost: totalActual,
      totalSales: totalSales,
      labourCostRatio: totalSales > 0 ? ((totalBudget / totalSales) * 100).toFixed(2) + '%' : '0%', // Mencegah bagi nol
      revenuePerFte: snapshots.length > 0 ? (totalSales / snapshots.length).toFixed(2) : 0
    },
    retention: {
      // TODO: Nantinya di-query dari tabel EmployeeMovement berdasarkan bulan & tahun
      totalResigned: 0, 
      turnoverRate: "0%"
    }
  };
};
//Universal Import 
const importAttendanceUniversal = async (raw2DArray) => {
  let successCount = 0;
  let headerIndex = -1;

  // 1. Cari secara dinamis di baris mana HRD menaruh Header "BULAN"
  for (let i = 0; i < raw2DArray.length; i++) {
    if (raw2DArray[i].some(cell => typeof cell === 'string' && cell.toUpperCase().includes('BULAN'))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) throw new Error("Format salah: Kolom 'BULAN' tidak ditemukan di Excel.");

  const headers = raw2DArray[headerIndex].map(h => typeof h === 'string' ? h.toUpperCase().trim() : h);
  const dataRows = raw2DArray.slice(headerIndex + 1);

  // 2. Looping setiap baris data (bisa dari Jan s.d Des)
  for (const row of dataRows) {
    // Map Array menjadi Object berdasarkan index header
    const rowData = {};
    headers.forEach((header, index) => {
      if (header) rowData[header] = row[index];
    });

    if (!rowData['BULAN']) continue; // Skip baris kosong

    const parsedDate = parseMonthYear(rowData['BULAN']);
    if (!parsedDate) continue;

    const periodId = await getOrCreatePeriodId(parsedDate.year, parsedDate.month);

    // Ambil data (mendukung variasi pengetikan nama kolom HRD)
    const data = {
      totalEmployees: parseInt(rowData['JUMLAH KARYWAN'] || rowData['JUMLAH KARYAWAN STORE'] || 0),
      sickCount: parseInt(rowData['JML KARYAWAN SAKIT'] || 0),
      permissionCount: parseInt(rowData['JML KARYAWAN IJIN'] || 0),
      annualLeaveCount: parseInt(rowData['CUTI TAHUNAN'] || 0),
      absentCount: parseInt(rowData['ALPHA'] || 0),
      workingDays: parseInt(rowData['HARI KERJA'] || 0), // Klien kadang kosong, bisa set default 22
      attendanceRate: parseFloat(rowData['%TASE KEHADIRAN'] || 0)
    };

    await repository.upsertAttendanceAggregate(periodId, data);
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
  openNewPeriod, getPeriods, generateSnapshot,
  importAttendanceAggregate, importActualLabourCost, importSales, getDashboardSummary,
  importAttendanceUniversal, importSalesUniversal, getAttendance, getSales, getAttendanceAggregate, getAllSales
};