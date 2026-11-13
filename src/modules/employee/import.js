const xlsx = require('xlsx');
const repository = require('./repository');
const prisma = require('../../config/database');

// Ubah serial Excel ke Tanggal 
const excelDateToJSDate = (serial) => {
  if (!serial) return null;
  if (serial instanceof Date) return isNaN(serial.getTime()) ? null : serial;

  let date;
  if (typeof serial === 'string') {
    const trimmed = serial.trim();
    if (!trimmed) return null;
    // Dukungan format DD/MM/YYYY atau DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      date = new Date(Date.UTC(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10)));
    } else {
      date = new Date(trimmed);
    }
  } else if (typeof serial === 'number') {
    const utc_days = Math.floor(serial - 25569);
    date = new Date(utc_days * 86400 * 1000);
  } else {
    date = new Date(serial);
  }

  return (date instanceof Date && !isNaN(date.getTime())) ? date : null;
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

// Helper: Normalisasi nama toko (mencegah teks '-' atau 'HO' atau 'TOTAL' didaftarkan sebagai nama Store)
const cleanStore = (val) => {
  if (!val) return null;
  const s = String(val).trim().toUpperCase();
  if (['-', 'TOTAL', 'HO', 'PUSAT', 'KANTOR PUSAT', 'HEAD OFFICE', 'N/A', 'NA', '0', 'NONE', 'SEMUA', 'NULL'].includes(s)) {
    return null;
  }
  return String(val).trim();
};

// Deteksi Bulan & Tahun dari sebuah teks (nama sheet, judul cell, atau nama file)
const detectMonthYearFromText = (text = '') => {
  if (!text) return null;
  const lower = String(text).toLowerCase();

  let year = null;
  const matchYear = lower.match(/\b(20[2-3]\d)\b/) || lower.match(/\b(20\d{2})\b/);
  if (matchYear) {
    year = parseInt(matchYear[1], 10);
  }

  let month = null;
  for (const [mName, mNum] of Object.entries(MONTH_MAP)) {
    if (lower.includes(mName)) {
      month = mNum;
      break;
    }
  }

  if (!month && !year) return null;
  return { year, month };
};

// Deteksi Bulan & Tahun dari baris-baris awal (judul file di baris 1-5 sebelum header tabel)
const detectMonthYearFromRows = (rows = []) => {
  let combinedYear = null;
  let combinedMonth = null;
  for (const r of rows) {
    const text = Array.isArray(r) ? r.join(' ') : Object.values(r || {}).join(' ');
    const res = detectMonthYearFromText(text);
    if (res) {
      if (res.year && !combinedYear) combinedYear = res.year;
      if (res.month && !combinedMonth) combinedMonth = res.month;
      if (combinedYear && combinedMonth) break;
    }
  }
  if (!combinedYear && !combinedMonth) return null;
  return { year: combinedYear, month: combinedMonth };
};

// Helper: Parse Bulan & Tahun dari teks/angka/date per baris data
const parseMonthYearValue = (rawMonth, rawYear, fallback) => {
  const currentFallback = fallback || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  let month = null;
  let year = null;

  // 1. Dukungan format Date Object
  if (rawMonth instanceof Date && !isNaN(rawMonth.getTime())) {
    return { year: rawMonth.getFullYear(), month: rawMonth.getMonth() + 1 };
  }
  if (rawYear instanceof Date && !isNaN(rawYear.getTime())) {
    return { year: rawYear.getFullYear(), month: rawYear.getMonth() + 1 };
  }

  // 2. Dukungan format Excel Serial Date (misal 45566)
  if (typeof rawMonth === 'number' && rawMonth > 1000) {
    const d = excelDateToJSDate(rawMonth);
    if (d) return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }
  if (typeof rawYear === 'number' && rawYear > 1000) {
    const d = excelDateToJSDate(rawYear);
    if (d) return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }

  // 3. Cek Tahun
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

  // 4. Cek Bulan (angka 1-12, nama bulan Indonesia/Inggris, atau format YYYY-MM)
  if (rawMonth !== undefined && rawMonth !== null && rawMonth !== '') {
    const mStr = String(rawMonth).trim().toLowerCase();

    // Jika di kolom Bulan tertulis lengkap dengan tahunnya (misal "Oktober 2026")
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
    year: year || currentFallback.year,
    month: month || currentFallback.month
  };
};

const processExcelImport = async (filePath, originalFilename = '') => {
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

  const rawExcelData = [];

  for (const sheetName of targetSheets) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Cari di baris ke-berapa header tabel berada (antisipasi jika ada judul Periode di baris 1-3)
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const rowStr = (matrix[r] || []).map(c => String(c || '').toUpperCase().replace(/\s+/g, '')).join(' ');
      if (rowStr.includes('EMPLOYEENO') || rowStr.includes('NAMAKARYAWAN') || rowStr.includes('NIK')) {
        headerRowIdx = r;
        break;
      }
    }

    // Deteksi periode spesifik per sheet: prioritaskan judul baris atas, nama sheet, nama file asli, atau kalender saat ini
    const detectedFromTitle = detectMonthYearFromRows(matrix.slice(0, Math.min(6, matrix.length)));
    const detectedFromSheet = detectMonthYearFromText(sheetName);
    const detectedFromFile = detectMonthYearFromText(originalFilename);

    const now = new Date();
    const sheetFallbackPeriod = {
      year: detectedFromSheet?.year || detectedFromTitle?.year || detectedFromFile?.year || now.getFullYear(),
      month: detectedFromSheet?.month || detectedFromTitle?.month || detectedFromFile?.month || (now.getMonth() + 1)
    };

    const sheetData = xlsx.utils.sheet_to_json(sheet, { range: headerRowIdx });
    sheetData.forEach((row, idx) => {
      rawExcelData.push({
        ...row,
        _sheetName: sheetName,
        _excelRowNumber: headerRowIdx + 2 + idx,
        _sheetFallbackPeriod: sheetFallbackPeriod
      });
    });
  }

  const formattedData = rawExcelData.map(row => {
    const bpjsKesehatanString = String(getValue(row, 'bpjskesehatan') || '');
    const bpjsKetenagakerjaanString = String(getValue(row, 'bpjsketenagakerjaan') || '');
    const isBpjsKesehatanValid = bpjsKesehatanString.toLowerCase().includes('terdaftar');
    const isBpjsKetenagakerjaanValid = bpjsKetenagakerjaanString.toLowerCase().includes('terdaftar');

    // Baca kolom Bulan, Tahun, atau Periode dari baris Excel
    const rawBulan = getValue(row, 'bulan') ?? getValue(row, 'month') ?? getValue(row, 'periode') ?? getValue(row, 'period') ?? getValue(row, 'bulantahun') ?? getValue(row, 'cutoff') ?? getValue(row, 'tanggal');
    const rawTahun = getValue(row, 'tahun') ?? getValue(row, 'year') ?? getValue(row, 'periode') ?? getValue(row, 'period') ?? getValue(row, 'bulantahun');
    const rowPeriod = parseMonthYearValue(rawBulan, rawTahun, row._sheetFallbackPeriod);

    // Normalisasi Store: mencegah "-" atau "HO" atau "TOTAL" menjadi record Store
    const rawStore = getValue(row, 'namatoko') || getValue(row, 'store') || getValue(row, 'storename') || getValue(row, 'showroom') || getValue(row, 'toko');
    const cleanStoreName = cleanStore(rawStore);

    return {
      rowNumber: row._excelRowNumber || null,
      sheetName: row._sheetName || null,
      employeeNo: String(getValue(row, 'employeeno') || getValue(row, 'nik') || getValue(row, 'idkaryawan') || ''),
      fullName: getValue(row, 'namakaryawan') || getValue(row, 'nama') || getValue(row, 'name') || 'TIDAK ADA NAMA',
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
      storeName: cleanStoreName,
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

  // Auto-generate & timpa reporting periods & snapshots sesuai Bulan & Tahun di Excel secara aman terisolasi
  await syncSnapshotsAfterEmployeeImport(formattedData);

  return importResult;
};

const syncSnapshotsAfterEmployeeImport = async (formattedData) => {
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
      const now = new Date();
      periodMap.set(`${now.getFullYear()}-${now.getMonth() + 1}`, { year: now.getFullYear(), month: now.getMonth() + 1 });
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

      if (snapRows.length === 0) continue;

      // Hitung komposisi karyawan HO vs Toko yang diunggah untuk periode ini
      const incomingHoCount = snapRows.filter(s => s.storeId === null).length;
      const incomingStoreCount = snapRows.filter(s => s.storeId !== null).length;

      // Logika pembersihan snapshot yang presisi & terisolasi:
      if (incomingHoCount >= 5 && incomingStoreCount >= 5) {
        // File adalah gabungan utuh HO dan Toko sekaligus -> Bersihkan seluruh snapshot periode ini
        await prisma.employeeMonthlySnapshot.deleteMany({
          where: { periodId: period.id }
        });
      } else if (incomingStoreCount > 0 && incomingHoCount < 5) {
        // File adalah data Toko (Store) -> HANYA bersihkan data Toko lama, DATA HO LAMA TETAP AMAN!
        await prisma.employeeMonthlySnapshot.deleteMany({
          where: {
            periodId: period.id,
            storeId: { not: null }
          }
        });
        // Jika ada 1-4 baris anomali HO di file toko, hapus hanya untuk employeeId spesifik tersebut agar tidak duplikat
        if (incomingHoCount > 0) {
          const hoEmpIds = snapRows.filter(s => s.storeId === null).map(s => s.employeeId);
          await prisma.employeeMonthlySnapshot.deleteMany({
            where: {
              periodId: period.id,
              employeeId: { in: hoEmpIds }
            }
          });
        }
      } else if (incomingHoCount > 0 && incomingStoreCount < 5) {
        // File adalah data HO (Kantor Pusat) -> HANYA bersihkan data HO lama, DATA TOKO LAMA TETAP AMAN!
        await prisma.employeeMonthlySnapshot.deleteMany({
          where: {
            periodId: period.id,
            storeId: null
          }
        });
        // Jika ada 1-4 baris anomali Toko di file HO, hapus hanya untuk employeeId spesifik tersebut agar tidak duplikat
        if (incomingStoreCount > 0) {
          const strEmpIds = snapRows.filter(s => s.storeId !== null).map(s => s.employeeId);
          await prisma.employeeMonthlySnapshot.deleteMany({
            where: {
              periodId: period.id,
              employeeId: { in: strEmpIds }
            }
          });
        }
      } else {
        // Fallback aman: hapus hanya record untuk employeeId yang akan dimasukkan
        const incomingEmpIds = snapRows.map(s => s.employeeId);
        await prisma.employeeMonthlySnapshot.deleteMany({
          where: {
            periodId: period.id,
            employeeId: { in: incomingEmpIds }
          }
        });
      }

      // Masukkan baris snapshot baru untuk periode ini
      await prisma.employeeMonthlySnapshot.createMany({
        data: snapRows,
        skipDuplicates: true
      });
    }
  } catch (err) {
    console.error('Error auto-syncing snapshots after import:', err.message);
  }
};

module.exports = { processExcelImport };
