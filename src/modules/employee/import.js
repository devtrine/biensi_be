const xlsx = require('xlsx');
const repository = require('./repository');
const prisma = require('../../config/database');

// Ubah serial Excel ke Tanggal 
const excelDateToJSDate = (serial) => {
  if (!serial) return null;
  if (serial instanceof Date) return isNaN(serial.getTime()) ? null : serial;

  let date;
  if (typeof serial === 'string') {
    date = new Date(serial);
  } else {
    const utc_days = Math.floor(serial - 25569);
    date = new Date(utc_days * 86400 * 1000);
  }

  return isNaN(date.getTime()) ? null : date;
};

// Menghapus semua spasi, simbol, & enter dari nama kolom Excel
const getValue = (row, targetKey) => {
  const target = targetKey.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  const exactKey = Object.keys(row).find(
    key => key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === target
  );

  return exactKey ? row[exactKey] : undefined;
};

const MONTH_MAP = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agustus: 8, aug: 8, august: 8, agt: 8,
  sep: 9, september: 9, sept: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11, nop: 11,
  des: 12, desember: 12, dec: 12, december: 12
};

// Helper: Parse Bulan & Tahun dari teks/angka (mendukung "September", "9", "09", "September 2026", "2026-09")
const parseMonthYearValue = (rawMonth, rawYear, fallback = { year: 2026, month: 9 }) => {
  let month = null;
  let year = null;

  // 1. Cek Tahun
  if (rawYear !== undefined && rawYear !== null && rawYear !== '') {
    const yrStr = String(rawYear).trim();
    const yrMatch = yrStr.match(/\b(20\d{2})\b/);
    if (yrMatch) {
      year = parseInt(yrMatch[1], 10);
    } else {
      const yrNum = parseInt(yrStr, 10);
      if (!isNaN(yrNum)) {
        year = yrNum < 100 ? 2000 + yrNum : yrNum;
      }
    }
  }

  // 2. Cek Bulan (bisa berupa angka 1-12 atau teks "September" / "September 2026")
  if (rawMonth !== undefined && rawMonth !== null && rawMonth !== '') {
    const mStr = String(rawMonth).trim().toLowerCase();

    // Jika di dalam kolom Bulan/Periode ikut tertulis tahunnya (misal "September 2026" atau "2026-09")
    if (!year) {
      const yrInMonth = mStr.match(/\b(20\d{2})\b/);
      if (yrInMonth) year = parseInt(yrInMonth[1], 10);
    }

    // Cek apakah cocok dengan nama bulan
    for (const [mName, mNum] of Object.entries(MONTH_MAP)) {
      if (mStr.includes(mName)) {
        month = mNum;
        break;
      }
    }

    // Jika bukan nama bulan, cek apakah angka bulan (1 s/d 12) atau format YYYY-MM
    if (!month) {
      const isoMatch = mStr.match(/^20\d{2}[-/](\d{1,2})$/);
      if (isoMatch) {
        month = parseInt(isoMatch[1], 10);
      } else {
        const mNum = parseInt(mStr, 10);
        if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
          month = mNum;
        }
      }
    }
  }

  return {
    year: year || fallback.year,
    month: month || fallback.month
  };
};

const detectMonthYearFromNames = (names = []) => {
  for (const name of names) {
    const lower = String(name || '').toLowerCase();
    for (const [mName, mNum] of Object.entries(MONTH_MAP)) {
      if (lower.includes(mName)) {
        const matchYear = lower.match(/202\d|2\d/);
        let year = 2026;
        if (matchYear) {
          year = matchYear[0].length === 2 ? 2000 + parseInt(matchYear[0], 10) : parseInt(matchYear[0], 10);
        }
        return { year, month: mNum };
      }
    }
  }
  return { year: 2026, month: 9 };
};

const processExcelImport = async (filePath) => {
  const workbook = xlsx.readFile(filePath);

  // 1. Identifikasi sheet yang berisi data karyawan (HO & Toko)
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return lower.includes('demografi') || lower.includes('karyawan') || lower.includes('pegawai');
  });

  // 2. Fallback: cari sheet yang memiliki header NIK/Nama
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      if (lower.includes('turnover') || lower.includes('kehadiran') || lower.includes('sales') ||
          lower.includes('fraud') || lower.includes('kasus') || lower.includes('phase') ||
          lower.includes('wlkp') || lower.includes('critical') || lower.includes('visual') || lower.includes('panduan')) {
        return false;
      }
      const previewRows = xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).slice(0, 5);
      const headerStr = previewRows.flat().map(c => String(c || '').toUpperCase().replace(/\s+/g, '')).join(' ');
      return headerStr.includes('EMPLOYEENO') || headerStr.includes('NAMAKARYAWAN') || headerStr.includes('NIK');
    });
  }

  if (targetSheets.length === 0) {
    targetSheets = [workbook.SheetNames[0]];
  }

  const sheetFallbackPeriod = detectMonthYearFromNames(targetSheets);
  const rawExcelData = [];

  for (const sheetName of targetSheets) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Cari di baris ke-berapa header tabel berada (antisipasi jika klien menaruh judul Periode di baris 1-3)
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const rowStr = (matrix[r] || []).map(c => String(c || '').toUpperCase().replace(/\s+/g, '')).join(' ');
      if (rowStr.includes('EMPLOYEENO') || rowStr.includes('NAMAKARYAWAN') || rowStr.includes('NIK')) {
        headerRowIdx = r;
        break;
      }
    }

    const sheetData = xlsx.utils.sheet_to_json(sheet, { range: headerRowIdx });
    rawExcelData.push(...sheetData);
  }

  const formattedData = rawExcelData.map(row => {
    const bpjsKesehatanString = String(getValue(row, 'bpjskesehatan') || '');
    const bpjsKetenagakerjaanString = String(getValue(row, 'bpjsketenagakerjaan') || '');
    const isBpjsKesehatanValid = bpjsKesehatanString.toLowerCase().includes('terdaftar');
    const isBpjsKetenagakerjaanValid = bpjsKetenagakerjaanString.toLowerCase().includes('terdaftar');

    // Poin 1: Baca kolom Bulan, Tahun, atau Periode dari baris Excel
    const rawBulan = getValue(row, 'bulan') ?? getValue(row, 'month') ?? getValue(row, 'periode') ?? getValue(row, 'period');
    const rawTahun = getValue(row, 'tahun') ?? getValue(row, 'year') ?? getValue(row, 'periode') ?? getValue(row, 'period');
    const rowPeriod = parseMonthYearValue(rawBulan, rawTahun, sheetFallbackPeriod);

    return {
      employeeNo: String(getValue(row, 'employeeno') || getValue(row, 'nik') || getValue(row, 'idkaryawan') || ''),
      fullName: getValue(row, 'namakaryawan') || getValue(row, 'nama') || getValue(row, 'name') || 'TIDAK ADA NAMA',
      // Poin 2: Dukungan penuh berbagai nama kolom Gender
      gender: getValue(row, 'jeniskelamin') || getValue(row, 'gender') || getValue(row, 'jk') || getValue(row, 'kelamin') || getValue(row, 'sex') || getValue(row, 'lp') || null,
      birthDate: excelDateToJSDate(getValue(row, 'tanggallahir') || getValue(row, 'tgllahir') || getValue(row, 'birthdate')),
      educationLevel: getValue(row, 'pendidikanterakhir') || getValue(row, 'pendidikan') || null,
      employmentType: getValue(row, 'statuskaryawan') || getValue(row, 'employmenttype') || 'KONTRAK',
      joinDate: excelDateToJSDate(getValue(row, 'tglmskkrj') || getValue(row, 'tanggalmasukkerja') || getValue(row, 'joindate')) || new Date(),
      endDate: excelDateToJSDate(getValue(row, 'tglhabiskontrak') || getValue(row, 'tanggalhabiskontrak') || getValue(row, 'enddate')),
      baseSalary: getValue(row, 'labourcostperemployee') || getValue(row, 'basesalary') || getValue(row, 'gajipokok') || getValue(row, 'labourcost'),

      bpjsKetenagakerjaan: isBpjsKetenagakerjaanValid,
      bpjsKesehatan: isBpjsKesehatanValid,

      divisionName: getValue(row, 'divisinewsyfa') || getValue(row, 'divisinew') || getValue(row, 'divisi') || getValue(row, 'division'),
      departmentName: getValue(row, 'departemennewbyhrbp') || getValue(row, 'departemen') || getValue(row, 'department'),
      unitName: getValue(row, 'unitdeptbyhrbp') || getValue(row, 'unit'),
      storeName: getValue(row, 'namatoko') || getValue(row, 'store') || getValue(row, 'storename') || getValue(row, 'showroom'),
      storeRegion: getValue(row, 'arearegional') || getValue(row, 'regional') || getValue(row, 'reg') || null,
      storeType: getValue(row, 'kategoritoko') || getValue(row, 'jenistoko') || getValue(row, 'katagori') || null,
      positionName: getValue(row, 'jabatan') || getValue(row, 'posisi') || getValue(row, 'position'),
      levelName: getValue(row, 'leveljabatan') || getValue(row, 'employeelevel') || getValue(row, 'level'),

      // Simpan informasi periode per baris untuk disinkronkan ke Snapshot
      periodYear: rowPeriod.year,
      periodMonth: rowPeriod.month
    };
  }).filter(data => data.employeeNo && data.employeeNo !== 'undefined' && data.employeeNo.trim() !== '');

  if (formattedData.length === 0) {
    return {
      sukses: 0,
      gagal: 0,
      errorList: ['Tidak ada data valid yang bisa dibaca. Pastikan baris header memiliki kolom Employee No dan Nama Karyawan.']
    };
  }

  // Lempar data ke Repository untuk upsert Master Employee
  const importResult = await repository.processBulkImport(formattedData);

  // Auto-generate & timpa reporting periods & snapshots sesuai Bulan & Tahun di Excel
  await syncSnapshotsAfterEmployeeImport(formattedData, targetSheets);

  return importResult;
};

const syncSnapshotsAfterEmployeeImport = async (formattedData, sheetNames) => {
  try {
    // 1. Kumpulkan semua periode unik (Tahun & Bulan) yang ada di baris file Excel yang di-upload
    const periodMap = new Map();
    for (const row of formattedData) {
      if (row.periodYear && row.periodMonth) {
        const key = `${row.periodYear}-${row.periodMonth}`;
        periodMap.set(key, { year: row.periodYear, month: row.periodMonth });
      }
    }

    if (periodMap.size === 0) {
      const fallback = detectMonthYearFromNames(sheetNames);
      periodMap.set(`${fallback.year}-${fallback.month}`, fallback);
    }

    // 2. Kumpulkan semua NIK yang ada di file Excel dan ambil data employee dari database
    const empNos = Array.from(new Set(formattedData.map(r => String(r.employeeNo || '').trim().toUpperCase())));
    const empNosWithStr = empNos.map(no => `${no}-STR`);

    const matchingEmployees = await prisma.employee.findMany({
      where: {
        OR: [
          { employeeNo: { in: empNos } },
          { employeeNo: { in: empNosWithStr } }
        ]
      },
      include: { position: true, store: true }
    });

    const empMap = new Map();
    for (const emp of matchingEmployees) {
      empMap.set(emp.employeeNo.toUpperCase(), emp);
    }

    // Deteksi cakupan file yang diunggah secara keseluruhan
    const overallHasStore = formattedData.some(r => r.storeName && r.storeName !== 'TOTAL');
    const overallHasHO = formattedData.some(r => !r.storeName || r.storeName === 'TOTAL');

    // 3. Loop per periode bulan yang ada di file Excel
    for (const { year: yr, month: m } of periodMap.values()) {
      let period = await prisma.reportingPeriod.findFirst({
        where: { year: yr, month: m }
      });

      if (!period) {
        const periodStart = new Date(Date.UTC(yr, m - 1, 1));
        const periodEnd = new Date(Date.UTC(yr, m, 0));
        period = await prisma.reportingPeriod.create({
          data: { year: yr, month: m, periodStart, periodEnd }
        });
      }

      // Filter baris data KHUSUS yang tercatat pada bulan & tahun ini
      const rowsForThisPeriod = formattedData.filter(r => r.periodYear === yr && r.periodMonth === m);

      const seenEmpIds = new Set();
      const snapRows = [];

      for (const row of rowsForThisPeriod) {
        const cleanNo = String(row.employeeNo || '').trim().toUpperCase();
        const emp = empMap.get(cleanNo) || empMap.get(`${cleanNo}-STR`);
        if (!emp) continue;
        if (seenEmpIds.has(emp.id)) continue;
        seenEmpIds.add(emp.id);

        let status = 'ACTIVE';
        if (emp.endDate && new Date(emp.endDate) < new Date(period.periodEnd)) {
          status = 'INACTIVE';
        }

        const rowSalary = row.baseSalary !== undefined && row.baseSalary !== null && row.baseSalary !== ''
          ? (typeof row.baseSalary === 'number' ? row.baseSalary : parseFloat(String(row.baseSalary).replace(/[^0-9.-]+/g, '')) || 0)
          : (emp.baseSalary ? parseFloat(emp.baseSalary) : 0);

        snapRows.push({
          periodId: period.id,
          employeeId: emp.id,
          divisionId: emp.divisionId,
          departmentId: emp.departmentId,
          positionId: emp.positionId,
          storeId: emp.storeId,
          employeeLevel: emp.position?.employeeLevel || null,
          employmentType: emp.employmentType,
          ageYears: emp.birthDate ? (period.year - new Date(emp.birthDate).getFullYear()) : null,
          tenureYears: emp.joinDate ? Math.max(0, (new Date(period.periodEnd) - new Date(emp.joinDate)) / (1000 * 60 * 60 * 24 * 365.25)) : null,
          employmentStatus: status,
          bpjsKetenagakerjaan: Boolean(emp.bpjsKetenagakerjaan),
          bpjsKesehatan: Boolean(emp.bpjsKesehatan),
          budgetLabourCost: rowSalary,
          actualLabourCost: null
        });
      }

      // Bersihkan snapshot periode ini sebelum insert data baru
      if (overallHasHO && overallHasStore) {
        // Jika file mengandung HO dan Toko sekaligus, ganti penuh periode ini
        await prisma.employeeMonthlySnapshot.deleteMany({
          where: { periodId: period.id }
        });
      } else if (overallHasHO) {
        // Jika hanya mengunggah HO, hapus data snapshot HO lama pada periode ini
        await prisma.employeeMonthlySnapshot.deleteMany({
          where: {
            periodId: period.id,
            employee: { storeId: null }
          }
        });
      } else if (overallHasStore) {
        // Jika hanya mengunggah Toko, hapus data snapshot Toko lama pada periode ini
        await prisma.employeeMonthlySnapshot.deleteMany({
          where: {
            periodId: period.id,
            employee: { storeId: { not: null } }
          }
        });
      }

      if (snapRows.length > 0) {
        await prisma.employeeMonthlySnapshot.createMany({
          data: snapRows,
          skipDuplicates: true
        });
      }
    }
  } catch (err) {
    console.error('Error auto-syncing snapshots after import:', err.message);
  }
};

module.exports = { processExcelImport };
