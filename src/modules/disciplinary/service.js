const xlsx = require('xlsx');
const repository = require('./repository');

// Helper Tanggal Excel & Teks Bulan Indonesia ("Mei 2025", "januari 2022", "APRIL 2026")
const parseFlexibleDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  let str = String(val).trim();
  if (!str || str === '-') return null;

  const monthMap = {
    januari: 'January', februari: 'February', maret: 'March', april: 'April',
    mei: 'May', juni: 'June', juli: 'July', agustus: 'August',
    september: 'September', oktober: 'October', november: 'November', desember: 'December'
  };

  Object.keys(monthMap).forEach(indo => {
    const regex = new RegExp(indo, 'ig');
    str = str.replace(regex, monthMap[indo]);
  });

  // Jika hanya tertulis nama bulan tanpa tahun (seperti "Januari" di spToko.xlsx), tambahkan 2026
  if (!/\d{4}/.test(str)) {
    str = `${str} 2026`;
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const parseDecimal = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleanStr = String(val).replace(/[^0-9.-]+/g, '');
  return parseFloat(cleanStr) || 0;
};

const toIntSafe = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  const str = String(val).trim().toUpperCase();
  if (!str || str.includes('#REF') || str.includes('#DIV') || str.includes('#VALUE')) return 0;
  const parsed = parseInt(str.replace(/[^0-9-]/g, ''), 10);
  return isNaN(parsed) ? 0 : parsed;
};

const toFloatSafe = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Number((val * 100).toFixed(2));
  const str = String(val).trim().toUpperCase().replace(',', '.');
  if (!str || str.includes('#REF') || str.includes('#DIV') || str.includes('#VALUE')) return 0;
  const parsed = parseFloat(str.replace(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
};

const MONTH_MAP_INDO = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6,
  JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12
};


// === 1. SERVICE UNTUK IMPORT SP (HO & TOKO) ===
const importBulkSP = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = [];

  // Saring sheet untuk SP
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return (lower.includes('sp') || lower.includes('disiplin')) && !lower.includes('demografi') && !lower.includes('turnover');
  });

  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      return !lower.includes('demografi') && !lower.includes('turnover') && !lower.includes('kehadiran') &&
             !lower.includes('sales') && !lower.includes('fraud') && !lower.includes('kasus') &&
             !lower.includes('phase') && !lower.includes('critical') && !lower.includes('visual') && !lower.includes('wlkp');
    });
  }

  if (targetSheets.length === 0) {
    targetSheets = [workbook.SheetNames[0]];
  }

  for (const sheetName of targetSheets) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let dataStartRow = 0;

    // Matrix Scanner (Maksimal 10 Baris Pertama)
    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if (cell.includes('EMPLOYEENO')) col.empNo = c;
        else if (cell.includes('REFERENCENO')) { col.refNo = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell === 'DIVISI') col.divisi = c;
        else if (cell.includes('DEPARTEMENT') || cell.includes('DEPARTMENT')) col.dept = c;
        else if (cell.includes('DISCIPLINESNAME')) { col.discName = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('STARTDATE')) col.startDate = c;
        else if (cell.includes('ENDDATE')) col.endDate = c;
        else if (cell.includes('NONTATATERTIB')) col.nonTataTertib = c;
        else if (cell.includes('TATATERTIB')) col.tataTertib = c;
        else if (cell === 'PERIODE') col.periode = c;
      }
    }

    const hasSpIdentifier = col.refNo !== undefined || col.discName !== undefined || col.tataTertib !== undefined || col.nonTataTertib !== undefined;
    if (col.name === undefined || !hasSpIdentifier) continue;

    for (let r = dataStartRow; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      let category = 'Tata Tertib';
      if (col.nonTataTertib !== undefined && row[col.nonTataTertib]) {
        category = 'Non Tata Tertib';
      }

      const startDate = parseFlexibleDate(row[col.startDate]) || parseFlexibleDate(row[col.periode]);
      const endDate = parseFlexibleDate(row[col.endDate]);

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        divisionName: col.divisi !== undefined ? row[col.divisi] : null,
        departmentName: col.dept !== undefined ? row[col.dept] : null,
        referenceNo: col.refNo !== undefined ? row[col.refNo] : null,
        disciplineName: col.discName !== undefined ? row[col.discName] : 'Surat Peringatan',
        startDate,
        endDate,
        category
      });
    }
  }
  if (allData.length === 0) throw new Error('Gagal. Pastikan format SP (Toko/HO) benar.');
  return await repository.processBulkSP(allData);
};

// === 2. SERVICE UNTUK IMPORT FRAUD ===
const importBulkFraud = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = [];

  // Saring sheet untuk Fraud
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return (lower.includes('fraud') || lower.includes('bakb')) && !lower.includes('demografi') && !lower.includes('turnover');
  });

  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      return !lower.includes('demografi') && !lower.includes('turnover') && !lower.includes('kehadiran') &&
             !lower.includes('sales') && !lower.includes('sp') && !lower.includes('kasus') &&
             !lower.includes('phase') && !lower.includes('critical') && !lower.includes('visual') && !lower.includes('wlkp');
    });
  }

  if (targetSheets.length === 0) {
    targetSheets = [workbook.SheetNames[0]];
  }

  for (const sheetName of targetSheets) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let dataStartRow = 0;

    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if (cell.includes('EMPLOYEENO')) col.empNo = c;
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell.includes('DISCIPLINESNAME')) { col.discName = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('STARTDATE')) { col.startDate = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('PENYEBABFRAUD')) col.fraudCause = c;
        else if (cell.includes('TGLAUDIT')) col.auditDate = c;
        else if (cell.includes('SELISIHQTY')) col.selisihQty = c;
        else if (cell.includes('NILAIBAKB')) col.bakb = c;
        else if (cell === 'TARGET') col.target = c;
        else if (cell.includes('PENCAPAIANSALES')) col.actual = c;
        else if (cell === 'REMARK' || cell === 'KETERANGAN') col.remark = c;
        else if (cell === 'PERIODE') col.periode = c;
      }
    }

    if (col.name === undefined || col.bakb === undefined) continue;

    for (let r = dataStartRow; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      const parsedStartDate = parseFlexibleDate(row[col.startDate]) || parseFlexibleDate(row[col.periode]);
      const parsedAuditDate = parseFlexibleDate(row[col.auditDate]) || parsedStartDate;

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        disciplineName: col.discName !== undefined ? row[col.discName] : 'Kasus Fraud',
        startDate: parsedStartDate || parsedAuditDate,
        remark: col.remark !== undefined ? row[col.remark] : null,
        fraudCategory: col.fraudCause !== undefined ? row[col.fraudCause] : 'Lainnya',
        auditDate: parsedAuditDate,
        selisihQty: col.selisihQty !== undefined ? parseDecimal(row[col.selisihQty]) : 0,
        bakbAmount: col.bakb !== undefined ? parseDecimal(row[col.bakb]) : 0,
        salesTarget: col.target !== undefined ? parseDecimal(row[col.target]) : 0,
        salesActual: col.actual !== undefined ? parseDecimal(row[col.actual]) : 0
      });
    }
  }
  if (allData.length === 0) throw new Error('Gagal. Pastikan file mengandung kolom Fraud (BAKB, Selisih, dll).');
  return await repository.processBulkFraud(allData);
};

// === 3. SERVICE UNTUK IMPORT BIPARTIT (KASUS.XLSX) ===
const importBulkBipartit = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = [];

  // Saring sheet untuk Bipartit / Mediasi
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return (lower.includes('kasus') || lower.includes('bipartit') || lower.includes('mediasi') || lower.includes('disnaker')) && !lower.includes('demografi') && !lower.includes('turnover');
  });

  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      return !lower.includes('demografi') && !lower.includes('turnover') && !lower.includes('kehadiran') &&
             !lower.includes('sales') && !lower.includes('fraud') && !lower.includes('sp') &&
             !lower.includes('phase') && !lower.includes('critical') && !lower.includes('visual') && !lower.includes('wlkp');
    });
  }

  if (targetSheets.length === 0) {
    targetSheets = [workbook.SheetNames[0]];
  }

  for (const sheetName of targetSheets) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let dataStartRow = 0;

    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if (cell.includes('EMPLOYEENO') && col.empNo === undefined) col.empNo = c;
        else if ((cell.includes('STORENAME') || cell.includes('SHOWROOM')) && col.store === undefined) col.store = c;
        else if (cell.includes('BIPARTIT') && col.bipartit === undefined) { col.bipartit = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('MEDIASI') && col.mediasi === undefined) col.mediasi = c;
        else if ((cell.includes('PIHAKKE3') || cell.includes('PIHAKKETIGA')) && col.pihak3 === undefined) col.pihak3 = c;
        else if (cell.includes('KETERANGAN') && col.ket === undefined) col.ket = c;
        else if (cell.includes('PERIODEAWAL') && col.startDate === undefined) col.startDate = c;
        else if (cell.includes('PERIODESELESAI') && col.endDate === undefined) col.endDate = c;
      }
    }

    if (col.name === undefined) continue;

    for (let r = dataStartRow; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      const ketText = col.ket !== undefined && row[col.ket] ? String(row[col.ket]).trim() : null;
      const ketUpper = String(ketText || '').toUpperCase();

      // PERBAIKAN: Cek checklist kolom dulu; jika kosong semua (seperti di kasus.xlsx), baca dari teks Keterangan!
      let category = 'Bipartit';
      if (col.bipartit !== undefined && row[col.bipartit]) category = 'Bipartit';
      else if (col.mediasi !== undefined && row[col.mediasi]) category = 'Mediasi';
      else if (col.pihak3 !== undefined && row[col.pihak3]) category = 'Pihak ke 3';
      else if (ketUpper.includes('MEDIASI') || ketUpper.includes('DISNAKER')) category = 'Mediasi';
      else if (ketUpper.includes('PIHAK')) category = 'Pihak ke 3';

      const parsedStart = parseFlexibleDate(row[col.startDate]);
      const parsedEnd = parseFlexibleDate(row[col.endDate]);

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        category: category,
        keterangan: ketText,
        startDate: parsedStart || parsedEnd, // Fallback jika Periode Awal kosong
        endDate: parsedEnd
      });
    }
  }
  if (allData.length === 0) throw new Error('Gagal. Pastikan file mengandung kolom Bipartit/Mediasi.');
  return await repository.processBulkBipartit(allData);
};

// === 4. SERVICE UNTUK IMPORT & GET REKAP SP TOKO (SPTokoRekap.xlsx) ===
const importSpTokoRekap = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let importedCount = 0;

  // Saring sheet untuk Rekap SP Toko
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return (lower.includes('sptoko') || lower.includes('rekap')) && !lower.includes('demografi') && !lower.includes('turnover');
  });

  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      return !lower.includes('demografi') && !lower.includes('turnover') && !lower.includes('kehadiran') &&
             !lower.includes('sales') && !lower.includes('fraud') && !lower.includes('kasus') &&
             !lower.includes('phase') && !lower.includes('critical') && !lower.includes('visual') && !lower.includes('wlkp');
    });
  }

  if (targetSheets.length === 0) {
    targetSheets = [workbook.SheetNames[0]];
  }

  for (const sheetName of targetSheets) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let currentYear = null;
    let hasTengahCol = false;

    for (let r = 0; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const rowStr = row.map(v => String(v || '').toUpperCase()).join(' ');

      // 1. Deteksi Judul Tahun (2024 / 2025 / 2026)
      const yearMatch = rowStr.match(/TAHUN\s*(202\d)/);
      if (yearMatch) {
        currentYear = parseInt(yearMatch[1], 10);
        continue;
      }

      // 2. Deteksi Header Tabel & Cek keberadaan kolom Regional 'Tengah' (2024 punya Tengah, 2025/2026 tidak)
      if (rowStr.includes('TAHUN') && rowStr.includes('BULAN') && rowStr.includes('KATEGORI')) {
        const subHeaderRow = (rawMatrix[r + 2] || []).map(v => String(v || '').toUpperCase().trim());
        hasTengahCol = subHeaderRow.includes('TENGAH');
        r += 2;
        continue;
      }

      // 3. Cek jika kolom A berisi angka tahun (misal pada baris Januari)
      if (row[0] && /^202\d$/.test(String(row[0]).trim())) {
        currentYear = parseInt(String(row[0]).trim(), 10);
      }

      // 4. Cek Nama Bulan pada kolom B
      const rawMonthName = String(row[1] || '').trim().toUpperCase();
      const monthNum = MONTH_MAP_INDO[rawMonthName];
      if (!monthNum || !currentYear) continue;

      const shift = hasTengahCol ? 1 : 0;
      const totalEmployees = toIntSafe(row[2]);

      const ttSp1 = toIntSafe(row[3]);
      const ttSp2 = toIntSafe(row[4]);
      const ttSp3 = toIntSafe(row[5]);
      const ttPhk = toIntSafe(row[6]);
      const tataTertibCount = toIntSafe(row[7]) || (ttSp1 + ttSp2 + ttSp3 + ttPhk);

      const nttSp1 = toIntSafe(row[9]);
      const nttSp2 = toIntSafe(row[10]);
      const nttSp3 = toIntSafe(row[11]);
      const nttPhk = toIntSafe(row[12]);
      const nonTataTertibCount = toIntSafe(row[13]) || (nttSp1 + nttSp2 + nttSp3 + nttPhk);

      const totalSpIssued = toIntSafe(row[32 + shift]) || (tataTertibCount + nonTataTertibCount);

      // Pengaman upload bulanan: lewati jika bulan tersebut belum ada data sama sekali
      if (totalEmployees === 0 && totalSpIssued === 0) continue;

      const breakdown = {
        tataTertib: { sp1: ttSp1, sp2: ttSp2, sp3: ttSp3, phk: ttPhk },
        nonTataTertib: { sp1: nttSp1, sp2: nttSp2, sp3: nttSp3, phk: nttPhk },
        bySpLevel: {
          sp1: toIntSafe(row[27 + shift]) || (ttSp1 + nttSp1),
          sp2: toIntSafe(row[28 + shift]) || (ttSp2 + nttSp2),
          sp3: toIntSafe(row[29 + shift]) || (ttSp3 + nttSp3),
          skorsing: toIntSafe(row[30 + shift]),
          phk: toIntSafe(row[31 + shift]) || (ttPhk + nttPhk)
        },
        byRegion: {
          barat: toIntSafe(row[15]),
          tengah: hasTengahCol ? toIntSafe(row[16]) : 0,
          timur: toIntSafe(row[16 + shift])
        },
        byStoreType: {
          familyStore: toIntSafe(row[17 + shift]),
          doubleRuko: toIntSafe(row[18 + shift]),
          ruko: toIntSafe(row[19 + shift]),
          showroom: toIntSafe(row[20 + shift]),
          counter: toIntSafe(row[21 + shift])
        },
        byJobLevel: {
          storeLeader: toIntSafe(row[22 + shift]),
          asstStoreLeader: toIntSafe(row[23 + shift]),
          cashier: toIntSafe(row[24 + shift]),
          vmStore: toIntSafe(row[25 + shift]),
          salesAdvisor: toIntSafe(row[26 + shift])
        },
        monthlyDiff: toIntSafe(row[34 + shift]),
        monthlyGrowthPct: hasTengahCol ? 0 : toFloatSafe(row[35])
      };

      const period = await repository.findOrCreatePeriod(currentYear, monthNum, rawMonthName);

      await repository.upsertSpTokoAggregate(period.id, {
        totalEmployees,
        tataTertibCount,
        nonTataTertibCount,
        totalSpIssued,
        breakdown
      });

      importedCount++;
    }
  }

  if (importedCount === 0) {
    throw new Error('Gagal membaca data. Pastikan format Excel sesuai Rekap SP Toko.');
  }

  return { imported: importedCount };
};

const getSpTokoRekap = async (year) => {
  return await repository.getSpTokoAggregateByYear(year);
};

// CRUD GET & DELETE
const getAllCases = async (filters) => await repository.getAllCases(filters);
const getCaseById = async (id) => await repository.getCaseById(id);
const deleteCase = async (id) => await repository.deleteCase(id);
const getDashboardData = async () => await repository.getDashboardData();

module.exports = {
  importBulkSP, importBulkFraud, getAllCases,
  getCaseById, deleteCase, getDashboardData,
  importBulkBipartit, importSpTokoRekap, getSpTokoRekap
};