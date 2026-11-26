const repository = require('./repository');
const { readWorkbookSafe, sheetToMatrix } = require('../../utils/excelReader');

// Helper Tanggal Excel & Teks Bulan Indonesia ("Mei 2025", "januari 2022", "APRIL 2026")
const parseFlexibleDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate(), 12, 0, 0));
  }
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
  }

  let str = String(val).trim();
  if (!str || str === '-') return null;

  const monthMap = {
    januari: 'January', februari: 'February', maret: 'March', april: 'April',
    mei: 'May', juni: 'June', juli: 'July', agustus: 'August',
    september: 'September', oktober: 'October', november: 'November', desember: 'December'
  };

  Object.keys(monthMap).forEach(indo => {
    const regex = new RegExp(`\\b${indo}\\b`, 'ig');
    str = str.replace(regex, monthMap[indo]);
  });

  // Jika format DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(Date.UTC(year, month, day, 12, 0, 0));
  }

  // Jika hanya tertulis nama bulan tanpa tahun (seperti "Januari" di spToko.xlsx), tambahkan 2026
  if (!/\d{4}/.test(str)) {
    str = `${str} 2026`;
  }

  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0));
};

const parseDecimal = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let s = String(val).trim();
  if (!s) return 0;
  const upper = s.toUpperCase();
  if (['KLOP', 'CLOSING', 'NIHIL', 'NONE', 'CLEAR', 'AMAN', '-'].includes(upper)) return 0;
  s = s.replace(/^(RP\.?|IDR)\s*/i, '').replace(/\s+/g, '');
  if (!s || s === '-' || s === '0') return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (/^-?\d+,\d+$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/[^0-9.-]+/g, '');
  }
  return parseFloat(s) || 0;
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
const importBulkSP = async (filePathOrWorkbook) => {
  const workbook = readWorkbookSafe(filePathOrWorkbook);
  let allData = [];

  // [FIX] Helper pembersih teks (konversi aman ke String & bersihkan non-breaking space \u00A0)
  const cleanStr = (val) => {
    if (val === undefined || val === null) return null;
    const cleaned = String(val).replace(/\u00A0/g, ' ').trim();
    return cleaned !== '' ? cleaned : null;
  };

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

  let hasSpRekapSheet = false;

  for (const sheetName of targetSheets) {
    const rawMatrix = sheetToMatrix(workbook.Sheets[sheetName]);
    if (rawMatrix.length === 0) continue;

    // Lewati sheet Rekap SP Toko (TAHUN | BULAN | KATEGORI) saat memindai detail SP, dan tandai agar diimpor juga ke spAggregateMonthly
    const isRekapSheet = rawMatrix.slice(0, 12).some(row => {
      const rowStr = (row || []).map(v => String(v || '').toUpperCase()).join(' ');
      return rowStr.includes('TAHUN') && rowStr.includes('BULAN') && rowStr.includes('KATEGORI');
    });
    if (isRekapSheet) {
      hasSpRekapSheet = true;
      continue;
    }

    let col = {};
    let headerRow = -1;
    let dataStartRow = 0;

    // [FIX] Matrix Scanner: berhenti maksimal 1 baris setelah baris header utama (untuk sub-header),
    // sehingga baris data (misal "Store Leader Area 5") tidak pernah ikut terpindai sebagai header
    const maxScanRow = Math.min(10, rawMatrix.length);
    for (let r = 0; r < maxScanRow; r++) {
      if (headerRow !== -1 && r > headerRow + 1) break;

      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').replace(/\u00A0/g, ' ').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c;
          headerRow = r;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if ((cell.includes('EMPLOYEENO') || cell.includes('NIK')) && col.empNo === undefined) col.empNo = c;
        else if ((cell.includes('REFERENCENO') || cell.includes('NOREF')) && col.refNo === undefined) {
          col.refNo = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if ((cell.includes('STORENAME') || cell.includes('SHOWROOM') || cell.includes('NAMATOKO') || cell.includes('TOKO')) && col.store === undefined) col.store = c;
        else if ((cell.includes('AREAREGIONAL') || cell.includes('REGIONAL') || cell === 'AREA') && col.area === undefined) col.area = c;
        else if (cell === 'DIVISI' && col.divisi === undefined) col.divisi = c;
        else if ((cell.includes('DEPARTEMENT') || cell.includes('DEPARTMENT')) && col.dept === undefined) col.dept = c;
        // [FIX] Kecualikan LEVELJABATAN agar tidak menimpa kolom Position
        else if ((cell === 'POSITION' || (cell.includes('JABATAN') && !cell.includes('LEVEL'))) && col.position === undefined) col.position = c;
        else if ((cell.includes('DISCIPLINESNAME') || cell.includes('JENISSP')) && col.discName === undefined) {
          col.discName = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if ((cell.includes('STARTDATE') || cell.includes('TANGGALMULAI')) && col.startDate === undefined) col.startDate = c;
        else if ((cell.includes('ENDDATE') || cell.includes('TANGGALSELESAI') || cell.includes('TANGGALBERAKHIR')) && col.endDate === undefined) col.endDate = c;
        else if (cell.includes('NONTATATERTIB') && col.nonTataTertib === undefined) col.nonTataTertib = c;
        else if (cell.includes('TATATERTIB') && !cell.includes('NONTATATERTIB') && col.tataTertib === undefined) col.tataTertib = c;
        else if (cell === 'PERIODE' && col.periode === undefined) col.periode = c;
        else if ((cell === 'KETERANGAN' || cell === 'REMARK') && col.remark === undefined) col.remark = c;
      }
    }

    const hasSpIdentifier = col.refNo !== undefined || col.discName !== undefined || col.tataTertib !== undefined || col.nonTataTertib !== undefined;
    if (col.name === undefined || !hasSpIdentifier) continue;

    for (let r = dataStartRow; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = cleanStr(row[col.name]);
      if (!empName || empName.toUpperCase().includes('NAME')) continue;

      // [FIX] Tangani angka 0 maupun teks '0' agar tidak salah masuk Non Tata Tertib
      const rawNonTt = col.nonTataTertib !== undefined ? row[col.nonTataTertib] : null;
      const nonTtStr = rawNonTt !== null && rawNonTt !== undefined ? String(rawNonTt).trim().toLowerCase() : '';
      const isNonTataTertib = nonTtStr !== '' && nonTtStr !== '0' && nonTtStr !== 'false' && nonTtStr !== '-';
      const category = isNonTataTertib ? 'Non Tata Tertib' : 'Tata Tertib';

      const startDate = parseFlexibleDate(row[col.startDate]) || parseFlexibleDate(row[col.periode]);
      const endDate = parseFlexibleDate(row[col.endDate]);

      // [FIX] Pastikan seluruh field teks (terutama referenceNo) dikonversi aman ke String atau null
      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? cleanStr(row[col.empNo]) : null,
        storeName: col.store !== undefined ? cleanStr(row[col.store]) : null,
        region: col.area !== undefined ? cleanStr(row[col.area]) : null,
        divisionName: col.divisi !== undefined ? cleanStr(row[col.divisi]) : null,
        departmentName: col.dept !== undefined ? cleanStr(row[col.dept]) : null,
        positionName: col.position !== undefined ? cleanStr(row[col.position]) : null,
        referenceNo: col.refNo !== undefined ? cleanStr(row[col.refNo]) : null,
        disciplineName: (col.discName !== undefined ? cleanStr(row[col.discName]) : null) || 'Surat Peringatan',
        startDate,
        endDate,
        category,
        remark: col.remark !== undefined ? cleanStr(row[col.remark]) : null
      });
    }
  }
  if (allData.length === 0) throw new Error('Gagal. Pastikan format SP (Toko/HO) benar.');
  const spResult = await repository.processBulkSP(allData);
  if (hasSpRekapSheet) {
    await importSpTokoRekap(workbook).catch(() => null);
  }
  return spResult;
};

// === 2. SERVICE UNTUK IMPORT FRAUD ===
const importBulkFraud = async (filePathOrWorkbook) => {
  const workbook = readWorkbookSafe(filePathOrWorkbook);
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
    const rawMatrix = sheetToMatrix(workbook.Sheets[sheetName]);
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
const importBulkBipartit = async (filePathOrWorkbook) => {
  const workbook = readWorkbookSafe(filePathOrWorkbook);
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
    const rawMatrix = sheetToMatrix(workbook.Sheets[sheetName]);
    if (rawMatrix.length === 0) continue;

    let col = {}; let dataStartRow = 0;

    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell === 'NAMA' || cell.includes('NAMAKARYAWAN') || cell.includes('NAMAPEGAWAI')) && col.name === undefined) {
          col.name = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if ((cell.includes('EMPLOYEENO') || cell.includes('NIK') || cell.includes('NOINDUK') || cell.includes('NIP')) && col.empNo === undefined) col.empNo = c;
        else if ((cell.includes('STORENAME') || cell.includes('SHOWROOM') || cell.includes('NAMATOKO') || cell.includes('TOKO') || cell.includes('UNITKERJA') || cell.includes('CABANG')) && col.store === undefined) col.store = c;
        else if ((cell === 'KATEGORI' || cell === 'CATEGORY' || cell.includes('JENISKASUS') || cell.includes('TAHAPAN') || cell.includes('JALUR')) && col.categoryCol === undefined) col.categoryCol = c;
        else if (cell.includes('BIPARTIT') && col.bipartit === undefined) { col.bipartit = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if ((cell.includes('MEDIASI') || cell.includes('DISNAKER')) && col.mediasi === undefined) col.mediasi = c;
        else if ((cell.includes('PIHAKKE3') || cell.includes('PIHAKKETIGA') || cell.includes('PIHAK3')) && col.pihak3 === undefined) col.pihak3 = c;
        else if ((cell === 'STATUS' || cell.includes('STATUSKASUS') || cell.includes('KONDISI')) && col.status === undefined) col.status = c;
        else if ((cell.includes('KETERANGAN') || cell.includes('REMARK') || cell.includes('DESKRIPSI') || cell.includes('DETAIL')) && col.ket === undefined) col.ket = c;
        else if ((cell.includes('PERIODEAWAL') || cell.includes('STARTDATE') || cell.includes('TGLAWAL') || cell.includes('TANGGALMULAI') || cell.includes('BULANAWAL')) && col.startDate === undefined) col.startDate = c;
        else if ((cell.includes('PERIODESELESAI') || cell.includes('ENDDATE') || cell.includes('TGLAKHIR') || cell.includes('TANGGALSELESAI') || cell.includes('BULANSELESAI')) && col.endDate === undefined) col.endDate = c;
      }
    }

    const hasBipartitSignal = col.bipartit !== undefined || col.mediasi !== undefined || col.pihak3 !== undefined || col.categoryCol !== undefined;
    if (col.name === undefined || !hasBipartitSignal) continue;

    for (let r = dataStartRow; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME') || String(empName).toUpperCase().includes('NAMA')) continue;

      const ketText = col.ket !== undefined && row[col.ket] ? String(row[col.ket]).trim() : null;
      const ketUpper = String(ketText || '').toUpperCase();

      // Cek kategori: checklist kolom, single kolom Kategori, atau teks keterangan
      let category = 'Bipartit';
      if (col.bipartit !== undefined && row[col.bipartit]) category = 'Bipartit';
      else if (col.mediasi !== undefined && row[col.mediasi]) category = 'Mediasi';
      else if (col.pihak3 !== undefined && row[col.pihak3]) category = 'Pihak ke 3';
      else if (col.categoryCol !== undefined && row[col.categoryCol]) {
        const catVal = String(row[col.categoryCol]).trim().toUpperCase();
        if (catVal.includes('MEDIASI') || catVal.includes('DISNAKER')) category = 'Mediasi';
        else if (catVal.includes('PIHAK')) category = 'Pihak ke 3';
        else if (catVal.includes('PHI')) category = 'PHI';
        else if (catVal.includes('BIPARTIT')) category = 'Bipartit';
        else if (catVal.includes('SELESAI') || catVal.includes('CLOSE')) category = 'Selesai';
      }
      else if (ketUpper.includes('MEDIASI') || ketUpper.includes('DISNAKER')) category = 'Mediasi';
      else if (ketUpper.includes('PIHAK')) category = 'Pihak ke 3';
      else if (ketUpper.includes('PHI')) category = 'PHI';
      else if (ketUpper.includes('BIPARTIT')) category = 'Bipartit';
      else if (ketUpper.includes('SELESAI') || ketUpper.includes('CLOSE')) category = 'Selesai';

      const rawStatus = col.status !== undefined && row[col.status] ? String(row[col.status]).trim() : null;
      const parsedStart = parseFlexibleDate(row[col.startDate]);
      const parsedEnd = parseFlexibleDate(row[col.endDate]);

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        category: category,
        status: rawStatus,
        keterangan: ketText,
        hasStartDate: Boolean(parsedStart),
        startDate: parsedStart || parsedEnd, // Fallback jika Periode Awal kosong
        endDate: parsedEnd
      });
    }
  }
  if (allData.length === 0) throw new Error('Gagal. Pastikan file mengandung kolom Bipartit/Mediasi.');
  return await repository.processBulkBipartit(allData);
};

// === 4. SERVICE UNTUK IMPORT & GET REKAP SP TOKO (SPTokoRekap.xlsx) ===
const importSpTokoRekap = async (filePathOrWorkbook) => {
  const workbook = readWorkbookSafe(filePathOrWorkbook);
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
    const rawMatrix = sheetToMatrix(workbook.Sheets[sheetName]);
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

      // Pengaman upload bulanan: lewati jika bulan tersebut belum ada data karyawan toko sama sekali
      if (totalEmployees === 0) continue;

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
