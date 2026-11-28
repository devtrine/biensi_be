const prisma = require('../config/database');
const {
  readWorkbookSafe,
  peekSheetMatrix,
  sheetToMatrix,
  sheetToObjects
} = require('./excelReader');
const {
  IMPORT_MODULES,
  enforcePeriodPolicy,
  summarizeDetectedPeriods,
  findDuplicateFileImports
} = require('./importBatch');

const VALIDATOR_TO_BATCH_MODULES = {
  employees: [IMPORT_MODULES.DEMOGRAFI_HO, IMPORT_MODULES.DEMOGRAFI_STORE],
  movement: [IMPORT_MODULES.MOVEMENT],
  compliance: [IMPORT_MODULES.COMPLIANCE],
  sp: [IMPORT_MODULES.SP],
  'sp-rekap': [IMPORT_MODULES.SP_REKAP],
  fraud: [IMPORT_MODULES.FRAUD],
  bipartit: [IMPORT_MODULES.BIPARTIT],
  attendance: [IMPORT_MODULES.ATTENDANCE],
  sales: [IMPORT_MODULES.SALES],
  production: [IMPORT_MODULES.PRODUCTION]
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

const INDO_MONTH_TO_EN = {
  januari: 'January', jan: 'Jan',
  februari: 'February', feb: 'Feb', peb: 'Feb',
  maret: 'March', mar: 'Mar',
  april: 'April', apr: 'Apr',
  mei: 'May',
  juni: 'June', jun: 'Jun',
  juli: 'July', jul: 'Jul',
  agustus: 'August', agu: 'Aug', agt: 'Aug',
  september: 'September', sep: 'Sep', sept: 'Sep',
  oktober: 'October', okt: 'Oct',
  november: 'November', nov: 'Nov', nop: 'Nov',
  desember: 'December', des: 'Dec'
};

const EXCEL_ERR_TOKENS = ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#N/A', '#NUM!', '#NULL!'];

const normKey = (v) => String(v || '').replace(/\u00A0/g, ' ').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const cleanStr = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\u00A0/g, ' ').trim();
  return s !== '' ? s : null;
};

const isFormulaError = (v) => {
  if (typeof v !== 'string') return false;
  const u = v.trim().toUpperCase();
  return EXCEL_ERR_TOKENS.some(tok => u.includes(tok));
};

const levenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
};

const findHeaderTypoHint = (actualHeaders, expectedAliases) => {
  let best = null;
  for (const rawH of actualHeaders) {
    const h = normKey(rawH);
    if (!h || h.length < 3) continue;
    for (const alias of expectedAliases) {
      const a = normKey(alias);
      if (!a || a.length < 3) continue;
      const dist = levenshtein(h, a);
      const maxLen = Math.max(h.length, a.length);
      const sim = 1 - dist / maxLen;
      if ((dist <= 2 || sim >= 0.72) && (!best || dist < best.dist)) {
        best = { actual: String(rawH).trim(), dist };
      }
    }
  }
  return best ? best.actual : null;
};

const parseStrictDate = (val, allowMonthOnlyYear = null) => {
  if (val === undefined || val === null || val === '') return { valid: true, date: null };
  if (isFormulaError(val)) return { valid: false, raw: String(val) };
  if (val instanceof Date) {
    const ok = !isNaN(val.getTime()) && val.getFullYear() >= 1940 && val.getFullYear() <= 2100;
    return ok ? { valid: true, date: val } : { valid: false, raw: String(val) };
  }
  if (typeof val === 'number') {
    if (val < 15000 || val > 80000) return { valid: false, raw: String(val) };
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    const ok = !isNaN(d.getTime()) && d.getUTCFullYear() >= 1940 && d.getUTCFullYear() <= 2100;
    return ok ? { valid: true, date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0)) } : { valid: false, raw: String(val) };
  }

  let str = String(val).replace(/\u00A0/g, ' ').trim();
  if (!str || str === '-' || str === '0') return { valid: true, date: null };

  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1940 || year > 2100) {
      return { valid: false, raw: str };
    }
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return { valid: false, raw: str };
    return { valid: true, date: d };
  }

  let converted = str;
  for (const [indo, en] of Object.entries(INDO_MONTH_TO_EN)) {
    converted = converted.replace(new RegExp(`\\b${indo}\\b`, 'ig'), en);
  }
  converted = converted.replace(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2})$/, '$1 $2 20$3');
  if (allowMonthOnlyYear && !/\d{4}/.test(converted)) {
    converted = `${converted} ${allowMonthOnlyYear}`;
  }

  const parsed = new Date(converted);
  if (isNaN(parsed.getTime()) || parsed.getFullYear() < 1940 || parsed.getFullYear() > 2100) {
    return { valid: false, raw: str };
  }
  return { valid: true, date: new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0)) };
};

const parseStrictNumber = (val, { allowNegative = true, zeroTokens = [] } = {}) => {
  if (val === undefined || val === null || val === '') return { valid: true, num: null };
  if (isFormulaError(val)) return { valid: false, raw: String(val) };
  if (typeof val === 'number') {
    if (isNaN(val) || (!allowNegative && val < 0)) return { valid: false, raw: String(val) };
    return { valid: true, num: val };
  }
  const s = String(val).replace(/\u00A0/g, ' ').trim();
  if (!s || s === '-') return { valid: true, num: null };
  if (zeroTokens.length > 0 && zeroTokens.includes(s.toUpperCase())) {
    return { valid: true, num: 0 };
  }
  const cleaned = s.replace(/^rp\.?\s*/i, '').replace(/%/g, '').replace(/\s+/g, '');
  if (!cleaned || cleaned === '-') return { valid: true, num: 0 };
  if (!/^-?[\d.,]+$/.test(cleaned)) return { valid: false, raw: s };
  // Tangani pemisah ribuan/desimal umum
  const normalized = cleaned.includes(',') && !cleaned.includes('.')
    ? cleaned.replace(',', '.')
    : cleaned.replace(/,/g, '');
  const num = parseFloat(normalized);
  if (isNaN(num) || (!allowNegative && num < 0)) return { valid: false, raw: s };
  return { valid: true, num };
};

const isoDateKey = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

const rowNormMapCache = new WeakMap();

const getRowNormMap = (row) => {
  let map = rowNormMapCache.get(row);
  if (!map) {
    map = new Map();
    for (const k of Object.keys(row)) {
      const nk = normKey(k);
      const val = row[k];
      const isNonEmpty = val !== undefined && val !== null && String(val).trim() !== '';
      const existing = map.get(nk);
      if (!existing) {
        map.set(nk, isNonEmpty ? { hasNonEmpty: true, val } : { hasNonEmpty: false, val });
      } else if (!existing.hasNonEmpty && isNonEmpty) {
        existing.hasNonEmpty = true;
        existing.val = val;
      }
    }
    rowNormMapCache.set(row, map);
  }
  return map;
};

const getRowVal = (row, ...keys) => {
  if (!row || typeof row !== 'object') return undefined;
  const map = getRowNormMap(row);
  for (const targetKey of keys) {
    const entry = map.get(normKey(targetKey));
    if (entry && entry.hasNonEmpty) {
      return entry.val;
    }
  }
  return undefined;
};

const cleanStoreName = (val) => {
  if (!val) return null;
  const s = String(val).replace(/\u00A0/g, ' ').trim().toUpperCase();
  const ignore = ['-', 'TOTAL', 'HO', 'PUSAT', 'KANTOR PUSAT', 'HEAD OFFICE', 'N/A', 'NA', '0', 'NONE', 'NULL'];
  if (ignore.includes(s) || s.startsWith('HO ') || s.startsWith('HO-') || s.includes('HEAD OFFICE') || s.includes('KANTOR PUSAT')) {
    return null;
  }
  return s.replace(/\s+/g, ' ');
};

const isValidGender = (val) => {
  if (val === undefined || val === null || String(val).trim() === '' || String(val).trim() === '-') return true;
  const clean = String(val).replace(/[^a-zA-Z]/g, '').toUpperCase();
  const VALID_GENDERS = new Set([
    'LAKILAKI', 'LAKI', 'PRIA', 'MALE', 'L', 'LK', 'M',
    'PEREMPUAN', 'WANITA', 'FEMALE', 'P', 'PR', 'W', 'F'
  ]);
  return VALID_GENDERS.has(clean);
};

const detectMonthYearFromText = (text = '') => {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  let year = null;
  const matchYear = lower.match(/\b(20[2-3]\d)\b/) || lower.match(/\b(20\d{2})\b/);
  if (matchYear) year = parseInt(matchYear[1], 10);

  let month = null;
  const sorted = Object.entries(MONTH_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [mName, mNum] of sorted) {
    if (new RegExp(`(?<![a-z])${mName}(?![a-z])`).test(lower)) {
      month = mNum;
      break;
    }
  }
  return (!month && !year) ? null : { year, month };
};

const parseMonthYearStrict = (rawMonth, rawYear, fallback) => {
  let month = null;
  let year = null;

  if (rawMonth instanceof Date && !isNaN(rawMonth.getTime()) && rawMonth.getFullYear() >= 2020) {
    return { valid: true, year: rawMonth.getFullYear(), month: rawMonth.getMonth() + 1 };
  }
  if (typeof rawMonth === 'number' && rawMonth >= 30000 && rawMonth <= 100000) {
    const d = new Date(Math.round((rawMonth - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime()) && d.getUTCFullYear() >= 2020) {
      return { valid: true, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    }
  }

  if (rawYear !== undefined && rawYear !== null && String(rawYear).trim() !== '') {
    const yrStr = String(rawYear).trim();
    const yrMatch = yrStr.match(/\b(20\d{2})\b/);
    if (yrMatch) {
      year = parseInt(yrMatch[1], 10);
    } else {
      const yrNum = parseInt(yrStr, 10);
      if (!isNaN(yrNum)) year = yrNum < 100 ? 2000 + yrNum : yrNum;
      else return { valid: false, raw: yrStr };
    }
  }

  if (rawMonth !== undefined && rawMonth !== null && String(rawMonth).trim() !== '') {
    const mStr = String(rawMonth).trim().toLowerCase();
    if (!year) {
      const yrIn = mStr.match(/\b(20\d{2})\b/);
      if (yrIn) year = parseInt(yrIn[1], 10);
    }
    const sorted = Object.entries(MONTH_MAP).sort((a, b) => b[0].length - a[0].length);
    for (const [mName, mNum] of sorted) {
      if (new RegExp(`(?<![a-z])${mName}(?![a-z])`).test(mStr)) {
        month = mNum;
        break;
      }
    }
    if (!month) {
      const iso = mStr.match(/^20\d{2}[-/](\d{1,2})$/);
      if (iso) month = parseInt(iso[1], 10);
      else if (/^\d{1,2}$/.test(mStr)) {
        const mNum = parseInt(mStr, 10);
        if (mNum >= 1 && mNum <= 12) month = mNum;
      }
    }
    if (!month) return { valid: false, raw: String(rawMonth) };
  }

  const finalYear = year || fallback.year;
  const finalMonth = month || fallback.month;
  if (!finalYear || finalYear < 2020 || finalYear > 2100 || !finalMonth || finalMonth < 1 || finalMonth > 12) {
    return { valid: false, raw: `${rawMonth || ''} ${rawYear || ''}`.trim() };
  }
  return { valid: true, year: finalYear, month: finalMonth };
};

const parseAttendanceMonthYear = (monthStr) => {
  if (!monthStr) return null;
  const str = String(monthStr).toUpperCase().trim();
  const months = {
    JAN: 1, JANUARI: 1, JANUARY: 1,
    FEB: 2, PEB: 2, FEBRUARI: 2, FEBRUARY: 2,
    MAR: 3, MARET: 3, MARCH: 3,
    APR: 4, APRIL: 4,
    MEI: 5, MAY: 5,
    JUN: 6, JUNI: 6, JUNE: 6,
    JUL: 7, JULI: 7, JULY: 7,
    AGU: 8, AGT: 8, AGUST: 8, AGUSTUS: 8, AUG: 8, AUGUST: 8,
    SEP: 9, SEPT: 9, SEPTEMBER: 9,
    OKT: 10, OKTOBER: 10, OCT: 10, OCTOBER: 10,
    NOV: 11, NOP: 11, NOVEMBER: 11,
    DES: 12, DESEMBER: 12, DEC: 12, DECEMBER: 12
  };
  const parts = str.split(/[\s/\\-]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const monthName = parts[parts.length - 2].replace(/[^A-Z]/g, '');
  const year = parseInt(parts[parts.length - 1], 10);
  const month = months[monthName];
  if (!month || isNaN(year) || year < 2020 || year > 2100) return null;
  return { year, month };
};

const buildReport = ({ moduleKey, fileName, sheets, detectedPeriods, totalRows, invalidRowsCount, headerErrors, rowErrors, fileDuplicates, dbDuplicates }) => {
  const errorCount = headerErrors.length + rowErrors.length;
  const fileDuplicateCount = fileDuplicates.length;
  const dbDuplicateCount = dbDuplicates.length;
  const invalidCount = Math.min(
    totalRows,
    invalidRowsCount !== undefined ? invalidRowsCount : (rowErrors.length + fileDuplicateCount + dbDuplicateCount)
  );
  const validRows = Math.max(0, totalRows - invalidCount);
  const canProceed =
    totalRows > 0 &&
    errorCount === 0 &&
    fileDuplicateCount === 0 &&
    dbDuplicateCount === 0;

  let message;
  if (canProceed) {
    message = `Validasi lolos 100%! ${totalRows} baris valid siap diimpor tanpa typo atau duplikat.`;
  } else if (totalRows === 0 && errorCount === 0) {
    message = 'Tidak ada baris data valid yang dapat dibaca dari berkas Excel.';
  } else {
    const parts = [];
    if (errorCount > 0) parts.push(`${errorCount} error/typo`);
    if (fileDuplicateCount > 0) parts.push(`${fileDuplicateCount} duplikat di file`);
    if (dbDuplicateCount > 0) parts.push(`${dbDuplicateCount} duplikat di database`);
    message = `Validasi gagal: ditemukan ${parts.join(', ')}. Perbaiki berkas terlebih dahulu sebelum mengimpor.`;
  }

  return {
    success: true,
    dryRun: true,
    canProceed,
    summary: {
      module: moduleKey,
      fileName,
      sheets,
      detectedPeriods: Array.from(detectedPeriods).sort(),
      totalRows,
      validRows,
      errorCount,
      fileDuplicateCount,
      dbDuplicateCount
    },
    issues: {
      headerErrors,
      rowErrors,
      fileDuplicates,
      dbDuplicates
    },
    // Flat errors array agar kompatibel dengan consumer lama jika dibutuhkan
    errors: [...headerErrors, ...rowErrors, ...fileDuplicates, ...dbDuplicates],
    message
  };
};

// =========================
// 1. VALIDATOR: EMPLOYEES
// =========================
const validateEmployees = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(name => {
    const l = name.toLowerCase();
    return l.includes('demografi') || l.includes('karyawan') || l.includes('pegawai');
  });
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const l = name.toLowerCase();
      if (['turnover', 'kehadiran', 'sales', 'fraud', 'kasus', 'phase', 'wlkp', 'critical', 'visual', 'panduan'].some(k => l.includes(k))) {
        return false;
      }
      const preview = peekSheetMatrix(workbook.Sheets[name], 6);
      const flat = preview.flat().map(c => normKey(c)).join(' ');
      return flat.includes('employeeno') || flat.includes('namakaryawan') || flat.includes('nik');
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const parsedRows = [];
  let totalDataRows = 0;
  const invalidRowLabels = new Set();
  const now = new Date();
  const filePeriodHint = detectMonthYearFromText(fileName);

  for (const sheetName of targetSheets) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = sheetToMatrix(sheet);
    if (matrix.length === 0) continue;

    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const rowNorm = (matrix[r] || []).map(normKey);
      if (rowNorm.some(c => ['employeeno', 'nik', 'idkaryawan', 'namakaryawan'].includes(c))) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx === -1) {
      const sampleHeaders = (matrix[0] || []).concat(matrix[1] || []).filter(Boolean);
      const nikHint = findHeaderTypoHint(sampleHeaders, ['employeeno', 'nik', 'idkaryawan']);
      const nameHint = findHeaderTypoHint(sampleHeaders, ['namakaryawan', 'nama']);
      let msg = `Sheet '${sheetName}': Baris header tidak ditemukan (wajib ada kolom Employee No / NIK dan Nama Karyawan).`;
      if (nikHint || nameHint) {
        msg += ` Kemungkinan typo pada kolom: ${[nikHint, nameHint].filter(Boolean).map(x => `"${x}"`).join(', ')}.`;
      }
      headerErrors.push(msg);
      continue;
    }

    const headerCells = (matrix[headerRowIdx] || []).filter(Boolean);
    const normHeaders = headerCells.map(normKey);
    const hasNik = normHeaders.some(h => ['employeeno', 'nik', 'idkaryawan'].includes(h));
    const hasName = normHeaders.some(h => ['namakaryawan', 'nama', 'name'].includes(h));

    if (!hasNik) {
      const hint = findHeaderTypoHint(headerCells, ['employeeno', 'nik', 'idkaryawan']);
      headerErrors.push(`Sheet '${sheetName}': Kolom wajib 'Employee No / NIK' tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
    }
    if (!hasName) {
      const hint = findHeaderTypoHint(headerCells, ['namakaryawan', 'nama', 'name']);
      headerErrors.push(`Sheet '${sheetName}': Kolom wajib 'Nama Karyawan' tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
    }
    if (!hasNik || !hasName) continue;

    const titleHint = detectMonthYearFromText(matrix.slice(0, Math.min(6, matrix.length)).flat().join(' '));
    const sheetHint = detectMonthYearFromText(sheetName);
    const fallbackPeriod = {
      year: sheetHint?.year || titleHint?.year || filePeriodHint?.year || now.getFullYear(),
      month: sheetHint?.month || titleHint?.month || filePeriodHint?.month || (now.getMonth() + 1)
    };

    const rows = sheetToObjects(sheet, headerRowIdx);
    rows.forEach((row, idx) => {
      const rowNum = typeof row.__rowNum__ === 'number' ? row.__rowNum__ + 1 : headerRowIdx + 2 + idx;
      const rawEmpNo = getRowVal(row, 'employeeno', 'nik', 'idkaryawan');
      const rawName = getRowVal(row, 'namakaryawan', 'nama', 'name');
      const empNoClean = String(rawEmpNo || '').trim().replace(/^['"`\s]+/, '').toUpperCase();
      const nameClean = cleanStr(rawName);

      // Lewati baris kosong total atau footer ringkasan / baris penomoran indeks
      if (!empNoClean && !nameClean) return;
      if (['TOTAL', 'SUM', 'SUBTOTAL', 'RATA-RATA', '1'].includes(empNoClean) && (!nameClean || nameClean.toUpperCase() === 'TOTAL' || /^\d+$/.test(nameClean))) return;
      if (/^\d+$/.test(empNoClean) && /^\d+$/.test(nameClean || '')) return;

      totalDataRows++;
      const label = `Sheet '${sheetName}' Baris ${rowNum}`;
      const pushRowErr = (msg) => {
        rowErrors.push(msg);
        invalidRowLabels.add(label);
      };

      if (isFormulaError(rawEmpNo) || isFormulaError(rawName)) {
        pushRowErr(`${label}: Terdapat error formula Excel pada NIK atau Nama Karyawan.`);
        return;
      }
      if (!empNoClean || empNoClean.length < 3) {
        pushRowErr(`${label} (${nameClean || '-'}): NIK "${empNoClean || '(kosong)'}" tidak valid / kurang dari 3 karakter.`);
        return;
      }
      if (empNoClean.length > 50) {
        pushRowErr(`${label} (NIK: ${empNoClean}): Panjang NIK melebihi 50 karakter.`);
      }
      if (!nameClean) {
        pushRowErr(`${label} (NIK: ${empNoClean}): Nama Karyawan kosong.`);
      }

      const rawGender = getRowVal(row, 'jeniskelamin', 'jeniskelamin4', 'gender', 'jk', 'kelamin', 'sex', 'lp');
      if (!isValidGender(rawGender)) {
        pushRowErr(`${label} (NIK: ${empNoClean}): Nilai Jenis Kelamin "${rawGender}" tidak dikenali (kemungkinan typo; gunakan Laki-laki / Perempuan / L / P).`);
      }

      const rawBirth = getRowVal(row, 'tanggallahir', 'tanggallahir5', 'tgllahir', 'birthdate');
      const birthRes = parseStrictDate(rawBirth);
      if (!birthRes.valid) {
        pushRowErr(`${label} (NIK: ${empNoClean}): Format Tanggal Lahir tidak valid ("${birthRes.raw}").`);
      }

      const rawJoin = getRowVal(row, 'tglmskkrj', 'tanggalmasukkerja', 'joindate');
      const joinRes = parseStrictDate(rawJoin);
      if (!joinRes.valid) {
        pushRowErr(`${label} (NIK: ${empNoClean}): Format Tanggal Masuk Kerja tidak valid ("${joinRes.raw}").`);
      }

      const rawEnd = getRowVal(row, 'tglhabiskontrak', 'tanggalhabiskontrak', 'enddate');
      const endRes = parseStrictDate(rawEnd);
      if (!endRes.valid) {
        pushRowErr(`${label} (NIK: ${empNoClean}): Format Tanggal Habis Kontrak tidak valid ("${endRes.raw}").`);
      }

      const rawSalary = getRowVal(row, 'labourcostperemployee', 'basesalary', 'gajipokok', 'labourcost');
      const salRes = parseStrictNumber(rawSalary, { allowNegative: false });
      if (!salRes.valid) {
        pushRowErr(`${label} (NIK: ${empNoClean}): Nilai Gaji / Labour Cost bukan angka valid ("${salRes.raw}").`);
      }

      const rawBulan = getRowVal(row, 'bulan', 'month', 'periode', 'period', 'bulantahun', 'cutoff', 'tanggal');
      const rawTahun = getRowVal(row, 'tahun', 'year', 'periode', 'period', 'bulantahun');
      const periodRes = parseMonthYearStrict(rawBulan, rawTahun, fallbackPeriod);
      if (!periodRes.valid) {
        pushRowErr(`${label} (NIK: ${empNoClean}): Format Bulan/Tahun periode tidak valid ("${periodRes.raw}").`);
        return;
      }

      const periodKey = `${periodRes.year}-${String(periodRes.month).padStart(2, '0')}`;
      detectedPeriods.add(periodKey);

      const store = cleanStoreName(getRowVal(row, 'namatoko', 'store', 'storename', 'showroom', 'toko'));
      const scopeTag = store ? 'STORE' : 'HO';
      const normUpper = (v, maxLen = 95) => (cleanStr(v) || '').replace(/\s+/g, ' ').toUpperCase().substring(0, maxLen);
      const posName = normUpper(getRowVal(row, 'jabatan', 'posisi', 'position'), 95);
      const levelName = normUpper(getRowVal(row, 'leveljabatan', 'employeelevel', 'level'), 50) || 'STAFF';
      const divName = normUpper(getRowVal(row, 'divisinewsyfa', 'divisinew', 'divisi', 'division'), 95);
      const deptName = normUpper(getRowVal(row, 'departemennewbyhrbp', 'departemen', 'department'), 95);
      const salaryNum = salRes.valid && salRes.num !== null ? Math.round(salRes.num) : null;

      parsedRows.push({
        label,
        sheetName,
        rowNum,
        empNo: empNoClean,
        fullName: (nameClean || '').replace(/\s+/g, ' ').toUpperCase().substring(0, 190),
        posName,
        levelName,
        divName,
        deptName,
        store: store || '',
        salaryNum,
        scopeTag,
        year: periodRes.year,
        month: periodRes.month,
        periodKey
      });
    });
  }

  // Cek duplikat internal file (NIK + Scope + Toko + Periode sama; beda toko diizinkan untuk kasus mutasi)
  const seenFile = new Map();
  const nonDupFileRows = [];
  for (const r of parsedRows) {
    const key = `${r.empNo}|${r.scopeTag}|${r.store}|${r.periodKey}`;
    if (seenFile.has(key)) {
      const first = seenFile.get(key);
      fileDuplicates.push(`${r.label} (NIK: ${r.empNo}, Toko: ${r.store || 'HO'}, Periode: ${r.periodKey}): Duplikat di dalam file dengan ${first.label}.`);
      invalidRowLabels.add(r.label);
    } else {
      seenFile.set(key, r);
      nonDupFileRows.push(r);
    }
  }

  // Bangun ringkasan mutasi lintas toko (1 NIK muncul di >1 toko dalam bulan yang sama)
  const groupedByEmpPeriod = new Map();
  for (const r of nonDupFileRows) {
    const k = `${r.empNo}|${r.periodKey}`;
    if (!groupedByEmpPeriod.has(k)) groupedByEmpPeriod.set(k, []);
    groupedByEmpPeriod.get(k).push(r);
  }
  const mutationItems = [];
  let extraRowCount = 0;
  for (const group of groupedByEmpPeriod.values()) {
    if (group.length < 2) continue;
    const distinctStores = new Set(group.map(g => g.store || 'HO'));
    if (distinctStores.size < 2) continue;
    const finalRow = group[group.length - 1];
    const occurrences = group.map(g => ({
      rowNum: g.rowNum,
      sheetName: g.sheetName,
      storeLabel: g.store || 'HO (Kantor Pusat)'
    }));
    extraRowCount += group.length - 1;
    mutationItems.push({
      employeeNo: finalRow.empNo,
      fullName: finalRow.fullName,
      periodKey: finalRow.periodKey,
      occurrences,
      originStores: occurrences.slice(0, -1).map(o => o.storeLabel),
      finalStore: finalRow.store || 'HO (Kantor Pusat)',
      finalRowNum: finalRow.rowNum
    });
  }
  const mutationSummary = mutationItems.length > 0
    ? {
        totalValidRows: nonDupFileRows.length,
        uniqueHeadcount: groupedByEmpPeriod.size,
        mutatedEmployeeCount: mutationItems.length,
        extraRowCount,
        items: mutationItems
      }
    : null;

  const normOrgName = (v) => {
    const c = (v || '').replace(/\s+/g, ' ').trim().toUpperCase();
    return (c === 'COMERCIAL BUSSINESS' || c === 'COMERCIAL BUSINESS') ? 'COMMERCIAL BUSINESS' : c;
  };

  // Cek duplikat terhadap database (snapshot efektif periode + employee identik sudah ada di DB)
  if (parsedRows.length > 0) {
    const periodPairs = Array.from(new Set(parsedRows.map(r => `${r.year}-${r.month}`))).map(s => {
      const [y, m] = s.split('-').map(Number);
      return { year: y, month: m };
    });
    const dbPeriods = await prisma.reportingPeriod.findMany({
      where: { OR: periodPairs }
    });

    if (dbPeriods.length > 0) {
      const periodIdByKey = new Map(dbPeriods.map(p => [`${p.year}-${String(p.month).padStart(2, '0')}`, p.id]));
      const candidateNos = Array.from(new Set(parsedRows.flatMap(r => [r.empNo, `${r.empNo}-STR`, `${r.empNo}-HO`])));
      const existingSnaps = await prisma.employeeMonthlySnapshot.findMany({
        where: {
          periodId: { in: dbPeriods.map(p => p.id) },
          employee: { employeeNo: { in: candidateNos } }
        },
        select: {
          periodId: true,
          storeId: true,
          employeeLevel: true,
          budgetLabourCost: true,
          position: { select: { name: true, employeeLevel: true } },
          division: { select: { name: true } },
          department: { select: { name: true } },
          store: { select: { storeName: true } },
          employee: { select: { employeeNo: true, fullName: true } }
        }
      });

      const snapLookup = new Map();
      for (const s of existingSnaps) {
        const no = s.employee.employeeNo.toUpperCase();
        const baseNo = no.replace(/-(STR|HO)$/, '');
        const sc = s.storeId !== null ? 'STORE' : 'HO';
        snapLookup.set(`${s.periodId}|${no}|${sc}`, s);
        snapLookup.set(`${s.periodId}|${baseNo}|${sc}`, s);
      }

      // Gunakan baris terakhir per NIK + Scope + Periode (mengikuti aturan snapshot mutasi)
      const effectiveRowsMap = new Map();
      for (const r of parsedRows) {
        effectiveRowsMap.set(`${r.empNo}|${r.scopeTag}|${r.periodKey}`, r);
      }
      const effectiveRows = Array.from(effectiveRowsMap.values());

      const matchedDbItems = [];
      for (const r of effectiveRows) {
        const pId = periodIdByKey.get(r.periodKey);
        if (!pId) continue;
        const existing = snapLookup.get(`${pId}|${r.empNo}|${r.scopeTag}`);
        if (!existing) continue;

        const dbName = (existing.employee?.fullName || '').replace(/\s+/g, ' ').trim().toUpperCase();
        const dbStore = (existing.store?.storeName || '').replace(/\s+/g, ' ').trim().toUpperCase();
        const dbDiv = normOrgName(existing.division?.name);
        const dbDept = normOrgName(existing.department?.name);
        const dbPos = normOrgName(existing.position?.name);
        const dbLevel = normOrgName(existing.employeeLevel || existing.position?.employeeLevel || 'STAFF');
        const dbSalary = existing.budgetLabourCost !== null && existing.budgetLabourCost !== undefined
          ? Math.round(Number(existing.budgetLabourCost))
          : null;

        const isSameName = dbName === r.fullName;
        const isSameStore = dbStore === (r.store || '');
        const isSameDiv = !r.divName || dbDiv === normOrgName(r.divName);
        const isSameDept = !r.deptName || dbDept === normOrgName(r.deptName);
        const isSamePos = !r.posName || dbPos === normOrgName(r.posName);
        const isSameLevel = !r.levelName || dbLevel === normOrgName(r.levelName);
        const isSameSalary = r.salaryNum === null || dbSalary === r.salaryNum;

        if (isSameName && isSameStore && isSameDiv && isSameDept && isSamePos && isSameLevel && isSameSalary) {
          matchedDbItems.push({
            label: r.label,
            msg: `${r.label} (NIK: ${r.empNo}, Nama: ${r.fullName}, Toko: ${r.store || 'HO'}, Periode: ${r.periodKey}): Data karyawan periode ini sudah ada di database.`
          });
        }
      }

      // Blokir sebagai duplikat DB jika seluruh baris efektif di file memang sudah ada identik di database
      if (effectiveRows.length > 0 && matchedDbItems.length === effectiveRows.length) {
        for (const item of matchedDbItems) {
          dbDuplicates.push(item.msg);
          invalidRowLabels.add(item.label);
        }
      }
    }
  }

  const activeSheets = Array.from(new Set(parsedRows.map(r => r.sheetName).filter(Boolean)));
  const periodPolicy = enforcePeriodPolicy({
    mode: 'STRICT_SINGLE',
    sheets: activeSheets.length > 0 ? activeSheets : targetSheets,
    detectedPeriods,
    parsedRows
  });

  if (!periodPolicy.allowed) {
    headerErrors.push(periodPolicy.message);
  }

  const report = buildReport({
    moduleKey: 'employees',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: totalDataRows,
    invalidRowsCount: invalidRowLabels.size,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });

  return {
    ...report,
    periodPolicy,
    mutationSummary
  };
};

// =========================
// 2. VALIDATOR: MOVEMENT (TURNOVER)
// =========================
const validateMovement = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(n => {
    const l = n.toLowerCase();
    return l.includes('turnover') || l.includes('turn over') || l.includes('movement');
  });
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(n => {
      const l = n.toLowerCase();
      return !['demografi', 'karyawan', 'pegawai', 'kehadiran', 'absensi', 'sales', 'wlkp', 'kasus', 'fraud', 'sp', 'phase', 'critical', 'visual', 'panduan'].some(k => l.includes(k));
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const parsedRows = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    if (matrix.length === 0) continue;

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, matrix.length); i++) {
      const s = (matrix[i] || []).join('').toUpperCase().replace(/\s+/g, '');
      if (s.includes('NAMAKARYAWAN') || s.includes('NAMA')) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) {
      const hint = findHeaderTypoHint((matrix[0] || []).concat(matrix[1] || []), ['namakaryawan', 'nama']);
      headerErrors.push(`Sheet '${sheetName}': Header 'NAMA KARYAWAN' tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
      continue;
    }

    const h1 = matrix[headerRowIdx] || [];
    const h2 = matrix[headerRowIdx + 1] || [];
    const combinedH = (h1.join('') + h2.join('')).toUpperCase().replace(/\s+/g, '');
    const isDemografiSheet = combinedH.includes('TANGGALLAHIR') || combinedH.includes('TGLLAHIR') || combinedH.includes('PENDIDIKANTERAKHIR');
    const hasMoveDateHeader = !isDemografiSheet && (
      combinedH.includes('RESIGN') ||
      combinedH.includes('KELUAR') ||
      combinedH.includes('TURNOVER') ||
      (combinedH.includes('HABISKONTRAK') && (combinedH.includes('ALASAN') || combinedH.includes('KATEGORIPHK') || combinedH.includes('PHK')))
    );
    if (!hasMoveDateHeader) {
      const hint = findHeaderTypoHint([...h1, ...h2], ['tanggalresignhabiskontrak', 'tglresignhabiskontrak', 'tanggalresign']);
      headerErrors.push(`Sheet '${sheetName}': Kolom tanggal keluar/resign tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
      continue;
    }

    const rows = sheetToObjects(workbook.Sheets[sheetName], headerRowIdx);
    rows.forEach((row, idx) => {
      const rowNum = typeof row.__rowNum__ === 'number' ? row.__rowNum__ + 1 : headerRowIdx + 2 + idx;
      const rawName = getRowVal(row, 'namakaryawan', 'nama');
      const nameClean = cleanStr(rawName);
      if (!nameClean || /^\d+$/.test(nameClean) || nameClean.toUpperCase() === 'TOTAL') return;

      const label = `Sheet '${sheetName}' Baris ${rowNum}`;
      const rawEmpNo = getRowVal(row, 'nikkaryawan', 'nik', 'employeeno');
      const empNoClean = rawEmpNo ? String(rawEmpNo).trim().toUpperCase() : null;

      const rawMoveDate = getRowVal(row, 'tanggalresign/habiskontrak', 'tglresign/habiskontrak', 'tanggalresign', 'tglresign', 'tanggalkeluar', 'tglkeluar');
      const moveDateRes = parseStrictDate(rawMoveDate);
      if (!rawMoveDate || !moveDateRes.valid || !moveDateRes.date) {
        rowErrors.push(`${label} (${nameClean}): Tanggal Resign/Habis Kontrak kosong atau tidak valid ("${rawMoveDate || ''}").`);
        return;
      }

      const rawJoinDate = getRowVal(row, 'tanggalmasukkerja', 'tglmasukkerja');
      const joinRes = parseStrictDate(rawJoinDate);
      if (!joinRes.valid) {
        rowErrors.push(`${label} (${nameClean}): Tanggal Masuk Kerja tidak valid ("${joinRes.raw}").`);
      }

      const rawTipe = getRowVal(row, 'tipeturnover', 'jeniskaryawankeluar', 'jenispemisahankaryawan');
      if (rawTipe) {
        const t = String(rawTipe).trim().toUpperCase();
        if (!['VOLUNTARY', 'INVOLUNTARY', 'NON', 'PHK', 'KONTRAK'].some(k => t.includes(k))) {
          rowErrors.push(`${label} (${nameClean}): Tipe Turnover "${rawTipe}" tidak dikenali (kemungkinan typo; gunakan Voluntary / Involuntary).`);
        }
      }

      const pKey = `${moveDateRes.date.getUTCFullYear()}-${String(moveDateRes.date.getUTCMonth() + 1).padStart(2, '0')}`;
      detectedPeriods.add(pKey);

      const rawBulan = getRowVal(row, 'bulan', 'month', 'periode');
      const rawTahun = getRowVal(row, 'tahun', 'year');
      if (rawBulan) {
        const colPeriod = parseMonthYearStrict(rawBulan, rawTahun, {
          year: moveDateRes.date.getUTCFullYear(),
          month: moveDateRes.date.getUTCMonth() + 1,
        });
        if (colPeriod.valid && colPeriod.year && colPeriod.month) {
          detectedPeriods.add(`${colPeriod.year}-${String(colPeriod.month).padStart(2, '0')}`);
        }
      }

      parsedRows.push({
        label,
        empNo: empNoClean,
        fullName: nameClean.toUpperCase(),
        joinDateKey: isoDateKey(joinRes.date),
        dateKey: isoDateKey(moveDateRes.date),
        movementDate: moveDateRes.date
      });
    });
  }

  const seenFile = new Map();
  for (const r of parsedRows) {
    const identityKey = r.empNo || `${r.fullName}|${r.joinDateKey || ''}`;
    const key = `${identityKey}|${r.dateKey}`;
    if (seenFile.has(key)) {
      fileDuplicates.push(`${r.label} (${r.fullName}, Tgl: ${r.dateKey}): Duplikat di dalam file dengan ${seenFile.get(key).label}.`);
    } else {
      seenFile.set(key, r);
    }
  }

  if (parsedRows.length > 0) {
    const empNos = Array.from(new Set(parsedRows.map(r => r.empNo).filter(Boolean)));
    const names = Array.from(new Set(parsedRows.map(r => r.fullName)));
    const dbEmps = await prisma.employee.findMany({
      where: {
        OR: [
          ...(empNos.length > 0 ? [{ employeeNo: { in: empNos, mode: 'insensitive' } }] : []),
          { fullName: { in: names, mode: 'insensitive' } }
        ]
      },
      select: { id: true, employeeNo: true, fullName: true, joinDate: true }
    });

    if (dbEmps.length > 0) {
      const empIdByNo = new Map(dbEmps.map(e => [e.employeeNo.toUpperCase(), e.id]));
      const empIdsByName = new Map();
      for (const e of dbEmps) {
        const k = e.fullName.toUpperCase();
        if (!empIdsByName.has(k)) empIdsByName.set(k, []);
        empIdsByName.get(k).push(e);
      }

      const existingMovs = await prisma.employeeMovement.findMany({
        where: { employeeId: { in: dbEmps.map(e => e.id) } },
        select: { employeeId: true, movementDate: true }
      });
      const movSet = new Set(existingMovs.map(m => `${m.employeeId}|${isoDateKey(m.movementDate)}`));

      const matchedDbMsgs = [];
      for (const r of parsedRows) {
        let matched = false;
        if (r.empNo && empIdByNo.has(r.empNo)) {
          matched = movSet.has(`${empIdByNo.get(r.empNo)}|${r.dateKey}`);
        } else if (empIdsByName.has(r.fullName)) {
          const candidates = empIdsByName.get(r.fullName);
          matched = candidates.some(c => {
            if (!movSet.has(`${c.id}|${r.dateKey}`)) return false;
            if (r.joinDateKey && c.joinDate) {
              return isoDateKey(c.joinDate) === r.joinDateKey;
            }
            return true;
          });
        }
        if (matched) {
          matchedDbMsgs.push(`${r.label} (${r.fullName}, Tgl: ${r.dateKey}): Catatan turnover ini sudah ada di database.`);
        }
      }
      if (matchedDbMsgs.length === parsedRows.length) {
        dbDuplicates.push(...matchedDbMsgs);
      }
    }
  }

  return buildReport({
    moduleKey: 'movement',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: parsedRows.length + rowErrors.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });
};

// =========================
// 3. VALIDATOR: COMPLIANCE
// =========================
const COMPLIANCE_ALIASES = {
  entityName: ['PERUSAHAAN', 'ENTITAS', 'COMPANY', 'ENTITY'],
  permitType: ['JENISPERIJINAN', 'JENISPERIZINAN', 'JENISDOKUMEN', 'PERMITTYPE', 'DOCUMENTTYPE'],
  storeName: ['NAMATOKO', 'STORENAME', 'SHOWROOM', 'CABANG', 'BRANCH', 'UNITKERJA'],
  documentName: ['DOKUMEN/PERIZINAN', 'DOKUMEN/PERIJINAN', 'NAMADOKUMEN', 'DOCUMENTNAME', 'INSTRUMEN', 'DOKUMEN', 'PERIZINAN'],
  location: ['LOKASI', 'LOCATION', 'WILAYAH', 'TEMPAT', 'SITE'],
  validFrom: ['TANGGALTERBIT', 'TGLTERBIT', 'TGLAWAL', 'PERIODEAWAL', 'ISSUEDATE', 'STARTDATE', 'VALIDFROM', 'EFFECTIVE'],
  validUntil: ['TANGGALBERAKHIR', 'TGLBERAKHIR', 'TGLAKHIR', 'PERIODEAKHIR', 'EXPIRYDATE', 'EXPIREDDATE', 'ENDDATE', 'VALIDUNTIL', 'JATUHTEMPO'],
  pic: ['PIC', 'PERSONINCHARGE', 'PENANGGUNGJAWAB'],
  status: ['STATUS', 'STATE', 'KONDISI'],
  remainingDays: ['SISAHARI', 'REMAININGDAYS', 'DAYSLEFT', 'SISAWAKTU'],
  notes: ['KETERANGAN', 'NOTES', 'REMARKS', 'CATATAN', 'DESKRIPSI']
};

const matchComplianceHeader = (normCell) => {
  for (const [field, aliases] of Object.entries(COMPLIANCE_ALIASES)) {
    if (aliases.some(a => normCell === a || normCell.includes(a))) return field;
  }
  return null;
};

const validateCompliance = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(n => {
    const l = n.toLowerCase();
    return l.includes('wlkp') || l.includes('compliance') || l.includes('kepatuhan') || l.includes('perizinan') || l.includes('perijinan');
  });
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(n => {
      const l = n.toLowerCase();
      return !['demografi', 'karyawan', 'pegawai', 'turnover', 'kehadiran', 'absensi', 'sales', 'fraud', 'kasus', 'sp', 'phase', 'recruitment', 'critical', 'visual', 'panduan'].some(k => l.includes(k));
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const parsedRows = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    if (matrix.length === 0) continue;

    let headerRow = -1;
    const colMap = {};
    for (let r = 0; r < Math.min(15, matrix.length); r++) {
      const row = matrix[r] || [];
      const tempMap = {};
      for (let c = 0; c < row.length; c++) {
        const cellTop = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cellTop) continue;
        const matched = matchComplianceHeader(cellTop);
        if (matched && tempMap[matched] === undefined) tempMap[matched] = c;
      }
      if (tempMap.permitType !== undefined || tempMap.documentName !== undefined) {
        headerRow = r;
        Object.assign(colMap, tempMap);
        break;
      }
    }

    // Fallback: Format Matriks Toko (STORE NAME + PP / WLKP / GENSET) seperti pada HR_Monitoring_Dashboard v2.0.xlsx
    if (headerRow === -1) {
      let matrixStoreCol = -1;
      let matrixHeaderRow = -1;
      const mCols = {};
      for (let r = 0; r < Math.min(10, matrix.length); r++) {
        const row = matrix[r] || [];
        for (let c = 0; c < row.length; c++) {
          const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
          if (!cell) continue;
          if ((cell.includes('STORENAME') || cell === 'NAMATOKO') && matrixStoreCol === -1) {
            matrixStoreCol = c;
            matrixHeaderRow = r;
          }
          if (cell.includes('PPTGLAWAL')) mCols.ppAwal = c;
          else if (cell.includes('PPTGLAKHIR')) mCols.ppAkhir = c;
          else if (cell.includes('WLKPTGLAWAL')) mCols.wlkpAwal = c;
          else if (cell.includes('WLKPTGLAKHIR')) mCols.wlkpAkhir = c;
          else if ((cell.includes('PERATURANPERUSAHAAN') || cell === 'PP') && mCols.ppFlag === undefined) mCols.ppFlag = c;
          else if (cell === 'WLKP' && mCols.wlkpFlag === undefined) mCols.wlkpFlag = c;
          else if (cell === 'PERIODE' && mCols.periodeAwal === undefined) { mCols.periodeAwal = c; mCols.periodeAkhir = c + 1; }
          else if (cell === 'GENSET' && mCols.gensetFlag === undefined) { mCols.gensetFlag = c; mCols.gensetAwal = c + 1; }
        }
      }

      const hasMatrixCompliance = mCols.ppAwal !== undefined || mCols.wlkpAwal !== undefined || mCols.ppFlag !== undefined || mCols.wlkpFlag !== undefined;
      if (matrixStoreCol !== -1 && hasMatrixCompliance) {
        for (let r = matrixHeaderRow + 1; r < matrix.length; r++) {
          const row = matrix[r] || [];
          const storeClean = cleanStoreName(row[matrixStoreCol]);
          if (!storeClean || storeClean.includes('STORE NAME') || storeClean.includes('TGL')) continue;
          const label = `Sheet '${sheetName}' Baris ${r + 1}`;
          const locClean = storeClean.toUpperCase();

          // Ekstrak dokumen PP, WLKP, K3 dari baris matriks toko
          const docs = [];
          if (mCols.ppAwal !== undefined || mCols.ppAkhir !== undefined) {
            const vf = parseStrictDate(row[mCols.ppAwal]);
            const vu = parseStrictDate(row[mCols.ppAkhir]);
            if (vf.date || vu.date) docs.push({ docType: 'PP', descClean: 'PERATURAN PERUSAHAAN (PP)', vf: vf.date, vu: vu.date });
          } else if (mCols.ppFlag !== undefined && Number(row[mCols.ppFlag]) === 1) {
            docs.push({ docType: 'PP', descClean: 'PERATURAN PERUSAHAAN (PP)', vf: null, vu: null });
          }

          if (mCols.wlkpAwal !== undefined || mCols.wlkpAkhir !== undefined) {
            const vf = parseStrictDate(row[mCols.wlkpAwal]);
            const vu = parseStrictDate(row[mCols.wlkpAkhir]);
            if (vf.date || vu.date) docs.push({ docType: 'WLKP', descClean: 'WLKP KEMNAKER', vf: vf.date, vu: vu.date });
          } else if (mCols.wlkpFlag !== undefined && (Number(row[mCols.wlkpFlag]) === 1 || row[mCols.periodeAwal] || row[mCols.periodeAkhir])) {
            const vf = parseStrictDate(row[mCols.periodeAwal]);
            const vu = parseStrictDate(row[mCols.periodeAkhir]);
            docs.push({ docType: 'WLKP', descClean: 'WLKP KEMNAKER', vf: vf.date, vu: vu.date });
          }

          if (mCols.gensetFlag !== undefined && Number(row[mCols.gensetFlag]) === 1) {
            const vf = parseStrictDate(row[mCols.gensetAwal]);
            docs.push({ docType: 'K3', descClean: 'SERTIFIKASI K3 / GENSET', vf: vf.date, vu: null });
          }

          for (const d of docs) {
            if (d.vu) {
              detectedPeriods.add(`${d.vu.getUTCFullYear()}-${String(d.vu.getUTCMonth() + 1).padStart(2, '0')}`);
            }
            parsedRows.push({
              label,
              storeClean,
              locClean,
              docType: d.docType,
              descClean: d.descClean,
              validFromKey: isoDateKey(d.vf),
              validUntilKey: isoDateKey(d.vu)
            });
          }
        }
        continue;
      }

      const hint = findHeaderTypoHint((matrix[0] || []).concat(matrix[1] || []), ['jenisperijinan', 'jenisperizinan', 'dokumenperizinan']);
      headerErrors.push(`Sheet '${sheetName}': Header kolom 'Jenis Perijinan' / 'Dokumen / Perizinan' tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
      continue;
    }

    for (let r = headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const rawType = colMap.permitType !== undefined ? row[colMap.permitType] : null;
      const rawDoc = colMap.documentName !== undefined ? row[colMap.documentName] : null;
      const rawStore = colMap.storeName !== undefined ? row[colMap.storeName] : null;
      const rawLoc = colMap.location !== undefined ? row[colMap.location] : null;
      if (!rawType && !rawDoc && !rawStore) continue;

      const permitType = cleanStr(rawType) || cleanStr(rawDoc) || 'Perijinan';
      if (permitType.toUpperCase().includes('JENIS PERIJINAN')) continue;

      const label = `Sheet '${sheetName}' Baris ${r + 1}`;
      if (isFormulaError(rawType) || isFormulaError(rawDoc) || isFormulaError(rawStore)) {
        rowErrors.push(`${label}: Terdapat error formula Excel pada kolom dokumen/toko.`);
        continue;
      }

      const vfRes = parseStrictDate(colMap.validFrom !== undefined ? row[colMap.validFrom] : null);
      if (!vfRes.valid) rowErrors.push(`${label} (${permitType}): Tanggal Terbit tidak valid ("${vfRes.raw}").`);
      const vuRes = parseStrictDate(colMap.validUntil !== undefined ? row[colMap.validUntil] : null);
      if (!vuRes.valid) rowErrors.push(`${label} (${permitType}): Tanggal Berakhir tidak valid ("${vuRes.raw}").`);
      if (vfRes.date && vuRes.date && vuRes.date < vfRes.date) {
        rowErrors.push(`${label} (${permitType}): Tanggal Berakhir lebih awal dari Tanggal Terbit.`);
      }

      const storeClean = cleanStoreName(rawStore);
      const locClean = (cleanStr(rawLoc) || storeClean || 'HO').toUpperCase();
      const descClean = (cleanStr(rawDoc) || permitType).toUpperCase();
      if (vuRes.date) {
        detectedPeriods.add(`${vuRes.date.getUTCFullYear()}-${String(vuRes.date.getUTCMonth() + 1).padStart(2, '0')}`);
      }

      parsedRows.push({
        label,
        storeClean,
        locClean,
        docType: permitType.toUpperCase(),
        descClean,
        validFromKey: isoDateKey(vfRes.date),
        validUntilKey: isoDateKey(vuRes.date)
      });
    }
  }

  const seenFile = new Map();
  for (const r of parsedRows) {
    const key = `${r.storeClean || ''}|${r.locClean}|${r.docType}|${r.descClean}|${r.validFromKey}|${r.validUntilKey}`;
    if (seenFile.has(key)) {
      fileDuplicates.push(`${r.label} (${r.docType} - ${r.locClean}): Duplikat di dalam file dengan ${seenFile.get(key).label}.`);
    } else {
      seenFile.set(key, r);
    }
  }

  if (parsedRows.length > 0) {
    const existingDocs = await prisma.storeCompliance.findMany({
      include: { store: { select: { storeName: true } } }
    });
    const dbSet = new Set(existingDocs.map(d => {
      const sName = cleanStoreName(d.store?.storeName);
      const loc = (cleanStr(d.location) || sName || 'HO').toUpperCase();
      const dt = (cleanStr(d.documentType) || '').toUpperCase();
      const desc = (cleanStr(d.description) || dt).toUpperCase();
      return `${sName || ''}|${loc}|${dt}|${desc}|${isoDateKey(d.validFrom)}|${isoDateKey(d.validUntil)}`;
    }));

    const matchedDbMsgs = [];
    for (const r of parsedRows) {
      const key = `${r.storeClean || ''}|${r.locClean}|${r.docType}|${r.descClean}|${r.validFromKey}|${r.validUntilKey}`;
      if (dbSet.has(key)) {
        matchedDbMsgs.push(`${r.label} (${r.docType} - ${r.locClean}): Dokumen perijinan ini sudah ada di database.`);
      }
    }
    if (matchedDbMsgs.length === parsedRows.length) {
      dbDuplicates.push(...matchedDbMsgs);
    }
  }

  return buildReport({
    moduleKey: 'compliance',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: parsedRows.length + rowErrors.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });
};

// =========================
// 4. VALIDATOR: SP DETAIL
// =========================
const isSpRekapSheetMatrix = (matrix) => {
  if (!matrix || matrix.length === 0) return false;
  const topText = matrix.slice(0, Math.min(8, matrix.length)).flat().map(v => String(v || '').toUpperCase().replace(/\s+/g, ' ').trim()).join(' ');
  const hasRekapHeader = topText.includes('REKAPAN DATA SURAT PERINGATAN') || (topText.includes('TOTAL KARYAWAN') && topText.includes('KATEGORI SP'));
  const hasDetailName = topText.includes('EMPLOYEE NO') || topText.includes('REFERENCE NO') || topText.includes('DISCIPLINES NAME');
  return hasRekapHeader && !hasDetailName;
};

const validateSp = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(n => {
    const l = n.toLowerCase();
    if (!((l.includes('sp') || l.includes('disiplin')) && !l.includes('demografi') && !l.includes('turnover'))) return false;
    const mat = peekSheetMatrix(workbook.Sheets[n], 10);
    return !isSpRekapSheetMatrix(mat);
  });
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(n => {
      const l = n.toLowerCase();
      if (['demografi', 'karyawan', 'pegawai', 'turnover', 'kehadiran', 'absensi', 'sales', 'fraud', 'kasus', 'phase', 'critical', 'visual', 'wlkp', 'panduan'].some(k => l.includes(k))) return false;
      const mat = peekSheetMatrix(workbook.Sheets[n], 10);
      return !isSpRekapSheetMatrix(mat);
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const parsedRows = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    if (matrix.length === 0) continue;

    const col = {};
    let headerRow = -1;
    let dataStartRow = 0;

    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      if (headerRow !== -1 && r > headerRow + 1) break;
      const row = matrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').replace(/\u00A0/g, ' ').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;
        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c; headerRow = r; dataStartRow = Math.max(dataStartRow, r + 1);
        } else if ((cell.includes('EMPLOYEENO') || cell.includes('NIK')) && col.empNo === undefined) col.empNo = c;
        else if ((cell.includes('REFERENCENO') || cell.includes('NOREF')) && col.refNo === undefined) { col.refNo = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if ((cell.includes('DISCIPLINESNAME') || cell.includes('JENISSP')) && col.discName === undefined) { col.discName = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if ((cell.includes('STARTDATE') || cell.includes('TANGGALMULAI')) && col.startDate === undefined) col.startDate = c;
        else if ((cell.includes('ENDDATE') || cell.includes('TANGGALSELESAI') || cell.includes('TANGGALBERAKHIR')) && col.endDate === undefined) col.endDate = c;
        else if (cell.includes('NONTATATERTIB') && col.nonTataTertib === undefined) col.nonTataTertib = c;
        else if (cell.includes('TATATERTIB') && !cell.includes('NONTATATERTIB') && col.tataTertib === undefined) col.tataTertib = c;
        else if (cell === 'PERIODE' && col.periode === undefined) col.periode = c;
      }
    }

    const hasSpId = col.refNo !== undefined || col.discName !== undefined || col.tataTertib !== undefined || col.nonTataTertib !== undefined;
    if (col.name === undefined || !hasSpId) {
      const sample = matrix.slice(0, Math.min(6, matrix.length)).flat().filter(Boolean);
      const hint = findHeaderTypoHint(sample, ['namakaryawan', 'referenceno', 'disciplinesname', 'tatatertib']);
      headerErrors.push(`Sheet '${sheetName}': Header SP wajib (Name + Reference No / Disciplines Name / Tata Tertib) tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
      continue;
    }

    for (let r = dataStartRow; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const empName = cleanStr(row[col.name]);
      if (!empName || empName.toUpperCase().includes('NAME')) continue;

      const label = `Sheet '${sheetName}' Baris ${r + 1}`;
      const empNo = col.empNo !== undefined ? cleanStr(row[col.empNo]) : null;
      const refNo = col.refNo !== undefined ? cleanStr(row[col.refNo]) : null;
      const discName = (col.discName !== undefined ? cleanStr(row[col.discName]) : null) || 'Surat Peringatan';

      if (isFormulaError(empName) || isFormulaError(refNo) || isFormulaError(discName)) {
        rowErrors.push(`${label} (${empName}): Terdapat error formula Excel.`);
        continue;
      }
      if (refNo && refNo.length > 100) {
        rowErrors.push(`${label} (${empName}): Reference No melebihi 100 karakter.`);
      }

      const rawStart = col.startDate !== undefined ? row[col.startDate] : null;
      const rawPeriode = col.periode !== undefined ? row[col.periode] : null;
      const fallbackYear = new Date().getFullYear();
      const startRes = rawStart ? parseStrictDate(rawStart, fallbackYear) : { valid: true, date: null };
      const periodeRes = rawPeriode ? parseStrictDate(rawPeriode, fallbackYear) : { valid: true, date: null };
      if (!rawStart && !rawPeriode) {
        rowErrors.push(`${label} (${empName}): Start Date / Periode kosong.`);
      } else {
        if (rawStart && !startRes.valid) rowErrors.push(`${label} (${empName}): Format Start Date tidak valid ("${startRes.raw}").`);
        if (rawPeriode && !periodeRes.valid) rowErrors.push(`${label} (${empName}): Format Periode tidak valid ("${periodeRes.raw}").`);
      }

      const endRes = parseStrictDate(col.endDate !== undefined ? row[col.endDate] : null, fallbackYear);
      if (!endRes.valid) {
        rowErrors.push(`${label} (${empName}): Format End Date tidak valid ("${endRes.raw}").`);
      }
      const effStart = startRes.date || periodeRes.date;
      if (effStart && endRes.date && endRes.date < effStart) {
        rowErrors.push(`${label} (${empName}): End Date lebih awal dari Start Date.`);
      }

      if (periodeRes.date) {
        detectedPeriods.add(`${periodeRes.date.getUTCFullYear()}-${String(periodeRes.date.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      if (startRes.date) {
        detectedPeriods.add(`${startRes.date.getUTCFullYear()}-${String(startRes.date.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      if (!periodeRes.date && !startRes.date && endRes.date) {
        detectedPeriods.add(`${endRes.date.getUTCFullYear()}-${String(endRes.date.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      const effDate = startRes.date || periodeRes.date || endRes.date;

      parsedRows.push({
        label,
        empNo: empNo ? empNo.replace(/^['"`\s]+/, '').toUpperCase() : null,
        empName: empName.toUpperCase(),
        refNo: refNo ? refNo.toUpperCase() : null,
        discType: discName.toUpperCase(),
        dateKey: isoDateKey(effDate)
      });
    }
  }

  const seenRef = new Map();
  const seenKey = new Map();
  for (const r of parsedRows) {
    if (r.refNo && seenRef.has(r.refNo)) {
      fileDuplicates.push(`${r.label} (${r.empName}, Ref: ${r.refNo}): Nomor Referensi SP duplikat di dalam file dengan ${seenRef.get(r.refNo).label}.`);
      continue;
    }
    const compKey = `${r.empNo || r.empName}|${r.discType}|${r.dateKey}`;
    if (seenKey.has(compKey)) {
      fileDuplicates.push(`${r.label} (${r.empName}, ${r.discType}, Tgl: ${r.dateKey || '-'}): Data SP duplikat di dalam file dengan ${seenKey.get(compKey).label}.`);
    } else {
      if (r.refNo) seenRef.set(r.refNo, r);
      seenKey.set(compKey, r);
    }
  }

  if (parsedRows.length > 0) {
    const existingCases = await prisma.disciplinaryCase.findMany({
      where: { category: { not: 'Fraud & Audit' } },
      select: {
        referenceNo: true,
        disciplineType: true,
        startDate: true,
        employee: { select: { employeeNo: true, fullName: true } }
      }
    });

    const dbRefs = new Set();
    const dbKeys = new Set();
    for (const c of existingCases) {
      if (c.referenceNo) dbRefs.add(String(c.referenceNo).trim().toUpperCase());
      const dt = String(c.disciplineType || '').trim().toUpperCase();
      const dk = isoDateKey(c.startDate);
      if (c.employee?.employeeNo) {
        const no = c.employee.employeeNo.toUpperCase();
        dbKeys.add(`${no}|${dt}|${dk}`);
        dbKeys.add(`${no.replace(/-(STR|HO)$/, '')}|${dt}|${dk}`);
      }
      if (c.employee?.fullName) {
        dbKeys.add(`${c.employee.fullName.toUpperCase()}|${dt}|${dk}`);
      }
    }

    const matchedDbMsgs = [];
    for (const r of parsedRows) {
      if (r.refNo && dbRefs.has(r.refNo)) {
        matchedDbMsgs.push(`${r.label} (${r.empName}, Ref: ${r.refNo}): Nomor Referensi SP sudah ada di database.`);
      } else if (
        (r.empNo && dbKeys.has(`${r.empNo}|${r.discType}|${r.dateKey}`)) ||
        dbKeys.has(`${r.empName}|${r.discType}|${r.dateKey}`)
      ) {
        matchedDbMsgs.push(`${r.label} (${r.empName}, ${r.discType}, Tgl: ${r.dateKey || '-'}): Data SP ini sudah ada di database.`);
      }
    }
    if (matchedDbMsgs.length === parsedRows.length) {
      dbDuplicates.push(...matchedDbMsgs);
    }
  }

  return buildReport({
    moduleKey: 'sp',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: parsedRows.length + rowErrors.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });
};

// =========================
// 5. VALIDATOR: SP REKAP TOKO
// =========================
const validateSpRekap = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(n => {
    const l = n.toLowerCase();
    return (l.includes('sptoko') || l.includes('rekap')) && !l.includes('demografi') && !l.includes('turnover');
  });
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const MONTH_INDO = {
    JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4, MEI: 5, JUNI: 6,
    JULI: 7, AGUSTUS: 8, SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12
  };
  const parsedRows = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    let currentYear = null;
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const rowStr = row.map(v => String(v || '').toUpperCase()).join(' ');
      const ym = rowStr.match(/TAHUN\s*(202\d)/);
      if (ym) { currentYear = parseInt(ym[1], 10); continue; }
      if (row[0] && /^202\d$/.test(String(row[0]).trim())) currentYear = parseInt(String(row[0]).trim(), 10);
      const mNum = MONTH_INDO[String(row[1] || '').trim().toUpperCase()];
      if (!mNum || !currentYear) continue;
      const totalEmp = parseInt(String(row[2] || '0').replace(/[^0-9-]/g, ''), 10) || 0;
      if (totalEmp === 0) continue;
      const pKey = `${currentYear}-${String(mNum).padStart(2, '0')}`;
      detectedPeriods.add(pKey);
      parsedRows.push({ label: `Sheet '${sheetName}' Baris ${r + 1}`, year: currentYear, month: mNum, pKey, totalEmp });
    }
  }

  if (parsedRows.length === 0) {
    headerErrors.push('Format Rekap SP Toko tidak ditemukan pada berkas Excel.');
  }

  const seenFile = new Map();
  for (const r of parsedRows) {
    if (seenFile.has(r.pKey)) {
      fileDuplicates.push(`${r.label} (${r.pKey}): Periode Rekap SP duplikat di dalam file dengan ${seenFile.get(r.pKey).label}.`);
    } else seenFile.set(r.pKey, r);
  }

  if (parsedRows.length > 0) {
    const existing = await prisma.spAggregateMonthly.findMany({
      where: { scope: 'STORE' },
      include: { period: true }
    });
    const dbMap = new Map(existing.map(e => [`${e.period.year}-${String(e.period.month).padStart(2, '0')}`, e]));
    const matchedDbMsgs = [];
    for (const r of parsedRows) {
      const ex = dbMap.get(r.pKey);
      if (ex && ex.totalEmployees === r.totalEmp) {
        matchedDbMsgs.push(`${r.label} (Periode: ${r.pKey}): Rekap SP Toko periode ini sudah ada di database.`);
      }
    }
    if (matchedDbMsgs.length === parsedRows.length) {
      dbDuplicates.push(...matchedDbMsgs);
    }
  }

  return buildReport({
    moduleKey: 'sp-rekap',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: parsedRows.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });
};

// =========================
// 6. VALIDATOR: FRAUD
// =========================
const FRAUD_ZERO_TOKENS = ['KLOP', 'CLOSING', 'NIHIL', 'NONE', 'N/A', 'NA'];

const validateFraud = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(n => {
    const l = n.toLowerCase();
    return (l.includes('fraud') || l.includes('bakb')) && !l.includes('demografi') && !l.includes('turnover');
  });
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(n => {
      const l = n.toLowerCase();
      return !['demografi', 'karyawan', 'pegawai', 'turnover', 'kehadiran', 'absensi', 'sales', 'sp', 'kasus', 'phase', 'critical', 'visual', 'wlkp', 'panduan'].some(k => l.includes(k));
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const parsedRows = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    if (matrix.length === 0) continue;

    const col = {};
    let dataStartRow = 0;
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const row = matrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;
        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) { col.name = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('EMPLOYEENO') || cell.includes('NIK')) col.empNo = c;
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell.includes('STARTDATE')) { col.startDate = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('TGLAUDIT')) col.auditDate = c;
        else if (cell.includes('SELISIHQTY')) col.selisihQty = c;
        else if (cell.includes('NILAIBAKB')) col.bakb = c;
        else if (cell === 'TARGET') col.target = c;
        else if (cell.includes('PENCAPAIANSALES')) col.actual = c;
        else if (cell === 'PERIODE') col.periode = c;
      }
    }

    if (col.name === undefined || col.bakb === undefined) {
      const sample = matrix.slice(0, Math.min(6, matrix.length)).flat().filter(Boolean);
      const hint = findHeaderTypoHint(sample, ['namakaryawan', 'nilaibakb', 'selisihqty']);
      headerErrors.push(`Sheet '${sheetName}': Kolom wajib Fraud ('Name' dan 'Nilai BAKB') tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
      continue;
    }

    for (let r = dataStartRow; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const empName = cleanStr(row[col.name]);
      if (!empName || empName.toUpperCase().includes('NAME')) continue;

      const label = `Sheet '${sheetName}' Baris ${r + 1}`;
      const empNo = col.empNo !== undefined ? cleanStr(row[col.empNo]) : null;
      const storeClean = col.store !== undefined ? cleanStoreName(row[col.store]) : null;

      const rawStart = col.startDate !== undefined ? row[col.startDate] : null;
      const rawPeriode = col.periode !== undefined ? row[col.periode] : null;
      const fallbackYear = new Date().getFullYear();
      const startRes = rawStart ? parseStrictDate(rawStart, fallbackYear) : { valid: true, date: null };
      const periodeRes = rawPeriode ? parseStrictDate(rawPeriode, fallbackYear) : { valid: true, date: null };
      const auditRes = parseStrictDate(col.auditDate !== undefined ? row[col.auditDate] : null, fallbackYear);
      if (!rawStart && !rawPeriode) {
        rowErrors.push(`${label} (${empName}): Start Date / Periode kosong.`);
      } else {
        if (rawStart && !startRes.valid) rowErrors.push(`${label} (${empName}): Format Start Date tidak valid ("${startRes.raw}").`);
        if (rawPeriode && !periodeRes.valid) rowErrors.push(`${label} (${empName}): Format Periode tidak valid ("${periodeRes.raw}").`);
      }
      if (!auditRes.valid) rowErrors.push(`${label} (${empName}): Format Tgl Audit tidak valid ("${auditRes.raw}").`);

      const bakbRes = parseStrictNumber(row[col.bakb], { zeroTokens: FRAUD_ZERO_TOKENS });
      if (!bakbRes.valid) rowErrors.push(`${label} (${empName}): Nilai BAKB bukan angka valid ("${bakbRes.raw}").`);
      const qtyRes = col.selisihQty !== undefined ? parseStrictNumber(row[col.selisihQty], { zeroTokens: FRAUD_ZERO_TOKENS }) : { valid: true, num: 0 };
      if (!qtyRes.valid) rowErrors.push(`${label} (${empName}): Selisih Qty bukan angka valid ("${qtyRes.raw}").`);

      if (periodeRes.date) detectedPeriods.add(`${periodeRes.date.getUTCFullYear()}-${String(periodeRes.date.getUTCMonth() + 1).padStart(2, '0')}`);
      if (startRes.date) detectedPeriods.add(`${startRes.date.getUTCFullYear()}-${String(startRes.date.getUTCMonth() + 1).padStart(2, '0')}`);
      if (!periodeRes.date && !startRes.date && auditRes.date) detectedPeriods.add(`${auditRes.date.getUTCFullYear()}-${String(auditRes.date.getUTCMonth() + 1).padStart(2, '0')}`);
      const effDate = startRes.date || periodeRes.date || auditRes.date;

      parsedRows.push({
        label,
        empNo: empNo ? empNo.toUpperCase() : null,
        empName: empName.toUpperCase(),
        storeClean: storeClean || '',
        dateKey: isoDateKey(effDate),
        bakb: Number(bakbRes.num || 0),
        qty: Number(qtyRes.num || 0)
      });
    }
  }

  const seenFile = new Map();
  for (const r of parsedRows) {
    const key = `${r.empNo || r.empName}|${r.storeClean}|${r.dateKey}|${r.bakb}|${r.qty}`;
    if (seenFile.has(key)) {
      fileDuplicates.push(`${r.label} (${r.empName}, BAKB: ${r.bakb}): Kasus Fraud duplikat di dalam file dengan ${seenFile.get(key).label}.`);
    } else seenFile.set(key, r);
  }

  if (parsedRows.length > 0) {
    const existingFrauds = await prisma.fraudCase.findMany({
      include: {
        employee: { select: { employeeNo: true, fullName: true } },
        store: { select: { storeName: true } }
      }
    });
    const dbKeys = new Set();
    for (const f of existingFrauds) {
      const st = cleanStoreName(f.store?.storeName) || '';
      const dk = isoDateKey(f.caseDate);
      const b = Number(f.bakbAmount || 0);
      const q = Number(f.discrepancyQty || 0);
      if (f.employee?.employeeNo) dbKeys.add(`${f.employee.employeeNo.toUpperCase()}|${st}|${dk}|${b}|${q}`);
      if (f.employee?.fullName) dbKeys.add(`${f.employee.fullName.toUpperCase()}|${st}|${dk}|${b}|${q}`);
    }
    const matchedDbMsgs = [];
    for (const r of parsedRows) {
      if (
        (r.empNo && dbKeys.has(`${r.empNo}|${r.storeClean}|${r.dateKey}|${r.bakb}|${r.qty}`)) ||
        dbKeys.has(`${r.empName}|${r.storeClean}|${r.dateKey}|${r.bakb}|${r.qty}`)
      ) {
        matchedDbMsgs.push(`${r.label} (${r.empName}, Tgl: ${r.dateKey || '-'}, BAKB: ${r.bakb}): Kasus Fraud ini sudah ada di database.`);
      }
    }
    if (matchedDbMsgs.length === parsedRows.length) {
      dbDuplicates.push(...matchedDbMsgs);
    }
  }

  return buildReport({
    moduleKey: 'fraud',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: parsedRows.length + rowErrors.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });
};

// =========================
// 7. VALIDATOR: BIPARTIT
// =========================
const validateBipartit = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(n => {
    const l = n.toLowerCase();
    return ['kasus', 'bipartit', 'mediasi', 'disnaker'].some(k => l.includes(k)) && !l.includes('demografi') && !l.includes('turnover');
  });
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(n => {
      const l = n.toLowerCase();
      return !['demografi', 'karyawan', 'pegawai', 'turnover', 'kehadiran', 'absensi', 'sales', 'fraud', 'sp', 'phase', 'critical', 'visual', 'wlkp', 'panduan'].some(k => l.includes(k));
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const parsedRows = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    if (matrix.length === 0) continue;

    const col = {};
    let dataStartRow = 0;
    for (let r = 0; r < Math.min(10, matrix.length); r++) {
      const row = matrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;
        if ((cell === 'NAME' || cell === 'NAMA' || cell.includes('NAMAKARYAWAN') || cell.includes('NAMAPEGAWAI')) && col.name === undefined) {
          col.name = c; dataStartRow = Math.max(dataStartRow, r + 1);
        } else if ((cell.includes('EMPLOYEENO') || cell.includes('NIK') || cell.includes('NOINDUK') || cell.includes('NIP')) && col.empNo === undefined) col.empNo = c;
        else if ((cell.includes('STORENAME') || cell.includes('SHOWROOM') || cell.includes('NAMATOKO') || cell.includes('TOKO')) && col.store === undefined) col.store = c;
        else if ((cell === 'KATEGORI' || cell === 'CATEGORY' || cell.includes('JENISKASUS') || cell.includes('TAHAPAN') || cell.includes('JALUR')) && col.categoryCol === undefined) col.categoryCol = c;
        else if (cell.includes('BIPARTIT') && col.bipartit === undefined) { col.bipartit = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if ((cell.includes('MEDIASI') || cell.includes('DISNAKER')) && col.mediasi === undefined) { col.mediasi = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if ((cell.includes('PIHAKKE3') || cell.includes('PIHAKKETIGA') || cell.includes('PIHAK3')) && col.pihak3 === undefined) { col.pihak3 = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if ((cell.includes('KETERANGAN') || cell.includes('REMARK') || cell.includes('DESKRIPSI') || cell.includes('DETAIL')) && col.ket === undefined) col.ket = c;
        else if ((cell.includes('PERIODEAWAL') || cell.includes('STARTDATE') || cell.includes('TGLAWAL') || cell.includes('TANGGALMULAI') || cell.includes('BULANAWAL')) && col.startDate === undefined) col.startDate = c;
        else if ((cell.includes('PERIODESELESAI') || cell.includes('ENDDATE') || cell.includes('TGLAKHIR') || cell.includes('TANGGALSELESAI') || cell.includes('BULANSELESAI')) && col.endDate === undefined) col.endDate = c;
      }
    }

    const hasBipartitCols = col.bipartit !== undefined || col.mediasi !== undefined || col.pihak3 !== undefined || col.categoryCol !== undefined;
    if (col.name === undefined || !hasBipartitCols) {
      const sample = matrix.slice(0, Math.min(6, matrix.length)).flat().filter(Boolean);
      const hint = findHeaderTypoHint(sample, ['name', 'nama', 'bipartit', 'mediasi', 'kategori']);
      headerErrors.push(`Sheet '${sheetName}': Kolom wajib Hubungan Industrial ('Name / Nama' & 'Kategori / Bipartit / Mediasi') tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
      continue;
    }

    for (let r = dataStartRow; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const empName = cleanStr(row[col.name]);
      if (!empName || empName.toUpperCase().includes('NAME') || empName.toUpperCase().includes('NAMA')) continue;

      const label = `Sheet '${sheetName}' Baris ${r + 1}`;
      const empNo = col.empNo !== undefined ? cleanStr(row[col.empNo]) : null;
      const ket = col.ket !== undefined ? cleanStr(row[col.ket]) : null;
      const storeClean = col.store !== undefined ? cleanStoreName(row[col.store]) : null;

      if (isFormulaError(empName) || isFormulaError(ket)) {
        rowErrors.push(`${label} (${empName}): Terdapat error formula Excel.`);
        continue;
      }

      const startRes = parseStrictDate(col.startDate !== undefined ? row[col.startDate] : null, new Date().getFullYear());
      const endRes = parseStrictDate(col.endDate !== undefined ? row[col.endDate] : null, new Date().getFullYear());
      if (!startRes.valid) rowErrors.push(`${label} (${empName}): Format Periode Awal tidak valid ("${startRes.raw}").`);
      if (!endRes.valid) rowErrors.push(`${label} (${empName}): Format Periode Selesai tidak valid ("${endRes.raw}").`);

      const effDate = startRes.date || endRes.date;
      if (effDate) detectedPeriods.add(`${effDate.getUTCFullYear()}-${String(effDate.getUTCMonth() + 1).padStart(2, '0')}`);

      parsedRows.push({
        label,
        empNo: empNo ? empNo.toUpperCase() : null,
        empName: empName.toUpperCase(),
        storeClean: storeClean || '',
        ketKey: (ket || '').toUpperCase(),
        startDateKey: isoDateKey(startRes.date),
        endDateKey: isoDateKey(endRes.date)
      });
    }
  }

  const seenFile = new Map();
  for (const r of parsedRows) {
    const key = `${r.empNo || r.empName}|${r.storeClean}|${r.ketKey}|${r.startDateKey}|${r.endDateKey}`;
    if (seenFile.has(key)) {
      fileDuplicates.push(`${r.label} (${r.empName}): Kasus Bipartit/Mediasi duplikat di dalam file dengan ${seenFile.get(key).label}.`);
    } else seenFile.set(key, r);
  }

  if (parsedRows.length > 0) {
    const existingCases = await prisma.industrialRelationCase.findMany({
      include: { employee: { select: { employeeNo: true, fullName: true } } }
    });
    const dbKeys = new Set();
    for (const c of existingCases) {
      const desc = (cleanStr(c.description) || '').toUpperCase();
      if (c.employee?.employeeNo) dbKeys.add(`${c.employee.employeeNo.toUpperCase()}|${desc}`);
      if (c.employee?.fullName) dbKeys.add(`${c.employee.fullName.toUpperCase()}|${desc}`);
    }
    const matchedDbMsgs = [];
    for (const r of parsedRows) {
      if (
        (r.empNo && dbKeys.has(`${r.empNo}|${r.ketKey}`)) ||
        dbKeys.has(`${r.empName}|${r.ketKey}`)
      ) {
        matchedDbMsgs.push(`${r.label} (${r.empName}): Kasus Bipartit/Mediasi ini sudah ada di database.`);
      }
    }
    if (matchedDbMsgs.length === parsedRows.length) {
      dbDuplicates.push(...matchedDbMsgs);
    }
  }

  return buildReport({
    moduleKey: 'bipartit',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: parsedRows.length + rowErrors.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });
};

// =========================
// 8. VALIDATOR: ATTENDANCE
// =========================
const validateAttendance = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(n => {
    const l = n.toLowerCase();
    return l.includes('kehadiran') || l.includes('absensi') || l.includes('attendance');
  });
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(n => {
      const l = n.toLowerCase();
      return !['demografi', 'karyawan', 'pegawai', 'turnover', 'sales', 'fraud', 'sp', 'kasus', 'phase', 'critical', 'visual', 'wlkp', 'panduan'].some(k => l.includes(k));
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const parsedRows = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    let currentScope = 'HQ';
    let currentHeaders = [];
    let foundHeader = false;

    for (let i = 0; i < matrix.length; i++) {
      const row = matrix[i] || [];
      const rowStr = row.join(' ').toUpperCase();

      if (rowStr.includes('BULAN') && (rowStr.includes('SAKIT') || rowStr.includes('ALPHA') || rowStr.includes('HARI KERJA'))) {
        foundHeader = true;
        currentHeaders = row.map(h => typeof h === 'string' ? h.toUpperCase().replace(/\s+/g, ' ').trim() : h);
        if (rowStr.includes('HEAD OFFICE') || rowStr.includes('HO')) currentScope = 'HQ';
        else if (rowStr.includes('STORE') || rowStr.includes('TOKO')) currentScope = 'STORE';
        continue;
      }
      if (currentHeaders.length === 0) continue;

      const rowData = {};
      currentHeaders.forEach((h, idx) => { if (h) rowData[h] = row[idx]; });
      const rawBulan = cleanStr(rowData['BULAN']);
      if (!rawBulan || rawBulan.toUpperCase().includes('TOTAL') || rawBulan.toUpperCase().includes('RATA')) continue;

      const label = `Sheet '${sheetName}' Baris ${i + 1}`;
      const parsedDate = parseAttendanceMonthYear(rawBulan);
      if (!parsedDate) {
        rowErrors.push(`${label}: Format Bulan "${rawBulan}" tidak valid (gunakan format "BULAN TAHUN", misal "JANUARI 2026").`);
        continue;
      }

      const totalEmpKey = Object.keys(rowData).find(k => k.includes('KARY') && (k.includes('HEAD OFFICE') || k.includes('STORE') || k.includes('HO') || k.includes('JUMLAH')));
      const numChecks = [
        ['Jumlah Karyawan', rowData[totalEmpKey] ?? rowData['JUMLAH KARYWAN'] ?? rowData['JUMLAH KARYAWAN']],
        ['Sakit', rowData['JML KARYAWAN SAKIT']],
        ['Izin', rowData['JML KARYAWAN IJIN'] ?? rowData['JML KARYAWAN IZIN']],
        ['Cuti', rowData['CUTI TAHUNAN']],
        ['Alpha', rowData['ALPHA'] ?? rowData['ALPA']],
        ['Hari Kerja', rowData['HARI KERJA']],
        ['% Kehadiran', rowData['%TASE KEHADIRAN'] ?? rowData['% KEHADIRAN']]
      ];

      let hasRowErr = false;
      for (const [colLabel, rawVal] of numChecks) {
        const res = parseStrictNumber(rawVal, { allowNegative: false });
        if (!res.valid) {
          rowErrors.push(`${label} (${rawBulan}, ${currentScope}): Kolom '${colLabel}' bukan angka valid ("${res.raw}").`);
          hasRowErr = true;
        }
      }
      if (hasRowErr) continue;

      const totalEmp = parseInt(rowData[totalEmpKey] || rowData['JUMLAH KARYWAN'] || rowData['JUMLAH KARYAWAN'] || 0, 10) || 0;
      const sick = parseInt(rowData['JML KARYAWAN SAKIT'] || 0, 10) || 0;
      const perm = parseInt(rowData['JML KARYAWAN IJIN'] || rowData['JML KARYAWAN IZIN'] || 0, 10) || 0;
      const leave = parseInt(rowData['CUTI TAHUNAN'] || 0, 10) || 0;
      const alpha = parseInt(rowData['ALPHA'] || rowData['ALPA'] || 0, 10) || 0;
      const rate = parseFloat(String(rowData['%TASE KEHADIRAN'] ?? rowData['% KEHADIRAN'] ?? 0).replace(',', '.')) || 0;
      if (totalEmp === 0 || (sick === 0 && perm === 0 && leave === 0 && alpha === 0 && rate === 0)) continue;

      const pKey = `${parsedDate.year}-${String(parsedDate.month).padStart(2, '0')}`;
      detectedPeriods.add(pKey);
      parsedRows.push({ label, scope: currentScope, pKey, year: parsedDate.year, month: parsedDate.month, totalEmp, sick, perm, leave, alpha });
    }

    if (!foundHeader) {
      const sample = matrix.slice(0, Math.min(5, matrix.length)).flat().filter(Boolean);
      const hint = findHeaderTypoHint(sample, ['bulan', 'jmlkaryawansakit', 'alpha', 'harikerja']);
      headerErrors.push(`Sheet '${sheetName}': Header Absensi ('BULAN' & kolom Sakit/Alpha/Hari Kerja) tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
    }
  }

  const seenFile = new Map();
  for (const r of parsedRows) {
    const key = `${r.pKey}|${r.scope}`;
    if (seenFile.has(key)) {
      fileDuplicates.push(`${r.label} (${r.pKey}, ${r.scope}): Data absensi duplikat di dalam file dengan ${seenFile.get(key).label}.`);
    } else seenFile.set(key, r);
  }

  if (parsedRows.length > 0) {
    const existing = await prisma.attendanceAggregateMonthly.findMany({ include: { period: true } });
    const dbMap = new Map(existing.map(a => [`${a.period.year}-${String(a.period.month).padStart(2, '0')}|${String(a.scope || 'HQ').toUpperCase()}`, a]));
    const matchedDbMsgs = [];
    for (const r of parsedRows) {
      const ex = dbMap.get(`${r.pKey}|${r.scope}`);
      if (ex && ex.totalEmployees === r.totalEmp && ex.sickCount === r.sick && ex.permissionCount === r.perm && ex.annualLeaveCount === r.leave && ex.absentCount === r.alpha) {
        matchedDbMsgs.push(`${r.label} (Periode: ${r.pKey}, Scope: ${r.scope}): Data absensi periode ini sudah ada di database.`);
      }
    }
    if (matchedDbMsgs.length === parsedRows.length) {
      dbDuplicates.push(...matchedDbMsgs);
    }
  }

  return buildReport({
    moduleKey: 'attendance',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: parsedRows.length + rowErrors.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });
};

// =========================
// 9. VALIDATOR: SALES
// =========================
const validateSales = async (workbook, fileName) => {
  const headerErrors = [];
  const rowErrors = [];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  let targetSheets = workbook.SheetNames.filter(n => {
    const l = n.toLowerCase();
    return l.includes('sales') || l.includes('omset') || l.includes('target');
  });
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(n => {
      const l = n.toLowerCase();
      return !['demografi', 'karyawan', 'pegawai', 'turnover', 'kehadiran', 'absensi', 'fraud', 'sp', 'kasus', 'phase', 'critical', 'visual', 'wlkp', 'panduan'].some(k => l.includes(k));
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  const parsedEntries = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    let header1Index = -1;
    for (let i = 0; i < Math.min(10, matrix.length); i++) {
      if ((matrix[i] || []).some(c => typeof c === 'string' && c.replace(/\s+/g, '').toUpperCase().includes('NAMATOKO'))) {
        header1Index = i;
        break;
      }
    }
    if (header1Index === -1) {
      const sample = matrix.slice(0, Math.min(5, matrix.length)).flat().filter(Boolean);
      const hint = findHeaderTypoHint(sample, ['namatoko', 'actualjan2026']);
      headerErrors.push(`Sheet '${sheetName}': Kolom wajib 'NAMA TOKO' tidak ditemukan${hint ? ` (kemungkinan typo pada "${hint}")` : ''}.`);
      continue;
    }

    const headerMonths = matrix[header1Index] || [];
    const storeNameIdx = headerMonths.findIndex(h => typeof h === 'string' && h.replace(/\s+/g, '').toUpperCase().includes('NAMATOKO'));

    const monthCols = [];
    for (let c = 0; c < headerMonths.length; c++) {
      const txt = headerMonths[c];
      if (typeof txt !== 'string') continue;
      const u = txt.toUpperCase().trim();
      // Abaikan kolom rekapitulasi TOTAL atau rekonsiliasi keuangan ("By Keu")
      if (u.includes('TOTAL') || u.includes('BY KEU')) continue;
      const isActual = u.includes('ACTUAL');
      const isTarget = u.includes('TARGET');
      if (!isActual && !isTarget) continue;
      const parsed = parseAttendanceMonthYear(txt);
      if (!parsed) {
        headerErrors.push(`Sheet '${sheetName}': Header periode sales "${txt}" tidak valid (gunakan format "Actual BULAN TAHUN").`);
        continue;
      }
      monthCols.push({ colIndex: c, isActual, isTarget, year: parsed.year, month: parsed.month, label: txt });
    }

    if (monthCols.filter(m => m.isActual).length === 0) {
      headerErrors.push(`Sheet '${sheetName}': Tidak ditemukan kolom 'Actual [Bulan Tahun]' pada header sales.`);
      continue;
    }

    for (let r = header1Index + 2; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const rawStore = row[storeNameIdx];
      const storeClean = cleanStoreName(rawStore);
      if (!storeClean) continue;

      const label = `Sheet '${sheetName}' Baris ${r + 1}`;
      const monthMap = new Map();

      for (const mc of monthCols) {
        const pKey = `${mc.year}-${String(mc.month).padStart(2, '0')}`;
        const entry = monthMap.get(pKey) || { pKey, qty: 0, val: 0, target: 0, hasErr: false };

        if (mc.isTarget) {
          const tRes = parseStrictNumber(row[mc.colIndex + 1], { allowNegative: false });
          if (!tRes.valid) {
            rowErrors.push(`${label} (${storeClean}, ${mc.label}): Nilai Target bukan angka valid ("${tRes.raw}").`);
            entry.hasErr = true;
          } else {
            entry.target = tRes.num || 0;
          }
        } else if (mc.isActual) {
          const qRes = parseStrictNumber(row[mc.colIndex], { allowNegative: false });
          const vRes = parseStrictNumber(row[mc.colIndex + 1], { allowNegative: false });
          if (!qRes.valid) {
            rowErrors.push(`${label} (${storeClean}, ${mc.label}): Qty bukan angka valid ("${qRes.raw}").`);
            entry.hasErr = true;
          }
          if (!vRes.valid) {
            rowErrors.push(`${label} (${storeClean}, ${mc.label}): Value Sales bukan angka valid ("${vRes.raw}").`);
            entry.hasErr = true;
          }
          if (qRes.valid && vRes.valid) {
            entry.qty = qRes.num || 0;
            entry.val = vRes.num || 0;
          }
        }
        monthMap.set(pKey, entry);
      }

      for (const entry of monthMap.values()) {
        if (!entry.hasErr && (entry.qty > 0 || entry.val > 0)) {
          detectedPeriods.add(entry.pKey);
          parsedEntries.push({ label, storeClean, pKey: entry.pKey, qty: entry.qty, val: entry.val });
        }
      }
    }
  }

  const seenFile = new Map();
  for (const e of parsedEntries) {
    const key = `${e.storeClean}|${e.pKey}`;
    if (seenFile.has(key)) {
      fileDuplicates.push(`${e.label} (${e.storeClean}, ${e.pKey}): Data sales duplikat di dalam file dengan ${seenFile.get(key).label}.`);
    } else seenFile.set(key, e);
  }

  if (parsedEntries.length > 0) {
    const existing = await prisma.salesMonthly.findMany({
      include: { period: true, store: { select: { storeName: true } } }
    });
    const dbMap = new Map(existing.map(s => {
      const st = cleanStoreName(s.store?.storeName);
      return [`${st || ''}|${s.period.year}-${String(s.period.month).padStart(2, '0')}`, s];
    }));
    const matchedDbMsgs = [];
    for (const e of parsedEntries) {
      const ex = dbMap.get(`${e.storeClean}|${e.pKey}`);
      if (ex && Math.round(Number(ex.netSales || 0)) === Math.round(Number(e.val || 0))) {
        matchedDbMsgs.push(`${e.label} (${e.storeClean}, Periode: ${e.pKey}): Data sales toko periode ini sudah ada di database.`);
      }
    }
    if (matchedDbMsgs.length === parsedEntries.length) {
      dbDuplicates.push(...matchedDbMsgs);
    }
  }

  return buildReport({
    moduleKey: 'sales',
    fileName,
    sheets: targetSheets,
    detectedPeriods,
    totalRows: parsedEntries.length + rowErrors.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });
};

// =========================
// 10. VALIDATOR: PRODUCTION
// =========================
const validateProduction = async (workbook, fileName) => {
  const { parseProductionWorkbook } = require('../modules/production/service');
  const parsed = parseProductionWorkbook(workbook);

  const headerErrors = [...parsed.headerErrors];
  const rowErrors = [...parsed.rowErrors];
  const fileDuplicates = [];
  const dbDuplicates = [];
  const detectedPeriods = new Set();

  // Berikan petunjuk typo nama kolom jika header wajib tidak ditemukan
  if (headerErrors.length > 0 && parsed.targetSheets.length > 0) {
    const firstSheet = workbook.Sheets[parsed.targetSheets[0]];
    const sample = peekSheetMatrix(firstSheet, 5).flat().filter(Boolean);
    const hint = findHeaderTypoHint(sample, ['bulan', 'tahun', 'jumlahproduksi']);
    if (hint) {
      headerErrors[0] = `${headerErrors[0]} (kemungkinan typo pada kolom "${hint}")`;
    }
  }

  const seenInFile = new Map();
  for (const r of parsed.parsedRows) {
    detectedPeriods.add(r.periodKey);
    if (seenInFile.has(r.periodKey)) {
      fileDuplicates.push(
        `${r.label} (${r.monthName} ${r.year}): Periode duplikat di dalam file dengan ${seenInFile.get(r.periodKey).label}.`
      );
    } else {
      seenInFile.set(r.periodKey, r);
    }
  }

  if (parsed.parsedRows.length > 0) {
    const existing = await prisma.productionMonthly.findMany({
      include: { period: { select: { year: true, month: true } } }
    });
    const dbMap = new Map(
      existing
        .filter(item => item.period)
        .map(item => [`${item.period.year}-${String(item.period.month).padStart(2, '0')}`, item])
    );

    const matchedDbMsgs = [];
    for (const r of parsed.parsedRows) {
      const ex = dbMap.get(r.periodKey);
      if (ex && Math.round(Number(ex.productionQty || 0)) === Math.round(Number(r.productionQty || 0))) {
        matchedDbMsgs.push(
          `${r.label} (${r.monthName} ${r.year}): Data produksi periode ini sudah tercatat sama persis di database.`
        );
      }
    }
    if (matchedDbMsgs.length === parsed.parsedRows.length) {
      dbDuplicates.push(...matchedDbMsgs);
    }
  }

  const report = buildReport({
    moduleKey: 'production',
    fileName,
    sheets: parsed.targetSheets,
    detectedPeriods,
    totalRows: parsed.parsedRows.length + rowErrors.length,
    headerErrors,
    rowErrors,
    fileDuplicates,
    dbDuplicates
  });

  // Template Produksi memang dirancang untuk input banyak bulan / lintas tahun sekaligus
  // sehingga tidak memblokir dengan konfirmasi 2 tahap selama baris data valid.
  const periods = summarizeDetectedPeriods(detectedPeriods, parsed.parsedRows);
  report.periodPolicy = {
    allowed: true,
    httpStatus: 200,
    requiresConfirmation: false,
    isMultiMonth: periods.length > 1,
    primaryPeriod: periods[0] || null,
    periods
  };

  return report;
};

const VALIDATORS = {
  employees: validateEmployees,
  movement: validateMovement,
  compliance: validateCompliance,
  sp: validateSp,
  'sp-rekap': validateSpRekap,
  fraud: validateFraud,
  bipartit: validateBipartit,
  attendance: validateAttendance,
  sales: validateSales,
  production: validateProduction
};

const validateImportFile = async (moduleKey, filePathOrWorkbook, originalFilename = '', options = {}) => {
  const fn = VALIDATORS[moduleKey];
  if (!fn) {
    throw new Error(`Modul validasi '${moduleKey}' tidak dikenali.`);
  }
  const workbook = readWorkbookSafe(filePathOrWorkbook);
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return buildReport({
      moduleKey,
      fileName: originalFilename,
      sheets: [],
      detectedPeriods: new Set(),
      totalRows: 0,
      headerErrors: ['Berkas Excel tidak memiliki sheet yang dapat dibaca.'],
      rowErrors: [],
      fileDuplicates: [],
      dbDuplicates: []
    });
  }
  const report = await fn(workbook, originalFilename);
  if (moduleKey !== 'employees' && !report.periodPolicy) {
    report.periodPolicy = enforcePeriodPolicy({
      mode: 'MULTI_CONFIRM',
      sheets: report.summary?.sheets || [],
      detectedPeriods: report.summary?.detectedPeriods || [],
      confirmStep: options.confirmStep || 0
    });
  }

  const periods = report.periodPolicy?.periods?.length
    ? report.periodPolicy.periods
    : summarizeDetectedPeriods(report.summary?.detectedPeriods || []);
  const dupFileCheck = await findDuplicateFileImports({
    moduleKeys: VALIDATOR_TO_BATCH_MODULES[moduleKey] || [],
    fileName: originalFilename,
    periods
  });

  const hasHardErrors =
    (report.summary?.errorCount || 0) > 0 ||
    (report.summary?.fileDuplicateCount || 0) > 0 ||
    (report.summary?.totalRows || 0) === 0 ||
    (moduleKey === 'employees' && report.periodPolicy && !report.periodPolicy.allowed);
  const isDbDuplicate = (report.summary?.dbDuplicateCount || 0) > 0;

  if (!hasHardErrors && (dupFileCheck.isDuplicateFile || isDbDuplicate)) {
    const matchedPeriods = dupFileCheck.matchedPeriods.length > 0
      ? dupFileCheck.matchedPeriods
      : periods.map(p => ({
          key: p.key,
          year: p.year,
          month: p.month,
          label: p.label,
          fileName: originalFilename,
          uploadedAt: null,
          totalRecords: report.summary?.totalRows || 0
        }));
    const labels = matchedPeriods.map(p => p.label).join(', ');
    report.reimportWarning = {
      isDuplicateFile: dupFileCheck.isDuplicateFile,
      isDbDuplicate,
      canReimport: true,
      fileName: originalFilename,
      matchedPeriods,
      message: dupFileCheck.message ||
        `Data dari file "${originalFilename}" sudah pernah dimasukkan pada bulan ${labels || '-'}. Apakah Anda yakin ingin memasukkan lagi file yang sama?`
    };
  } else {
    report.reimportWarning = null;
  }

  return report;
};

const isTruthyFlag = (val) => {
  if (Array.isArray(val)) return val.some(v => String(v || '').trim().toLowerCase() === 'true');
  return String(val || '').trim().toLowerCase() === 'true';
};

// Helper controller seragam untuk ?dryRun=true, pre-commit guard, dan kebijakan multi-bulan
const runDryRunOrGuard = async (req, res, moduleKey) => {
  const isDryRun = String(req.query.dryRun || '').toLowerCase() === 'true';
  const confirmStep = Number(req.body?.confirmStep ?? req.query?.confirmStep ?? 0);
  const allowReimport = isTruthyFlag(req.body?.allowReimport) || isTruthyFlag(req.query?.allowReimport);
  const workbook = readWorkbookSafe(req.file.path);
  const validation = await validateImportFile(moduleKey, workbook, req.file.originalname, { confirmStep });
  const periodPolicy = validation.periodPolicy || null;

  if (isDryRun) {
    res.status(200).json({
      ...validation,
      periodPolicy
    });
    return { handled: true, validation, periodPolicy };
  }

  const hasHardErrors =
    (validation.summary?.errorCount || 0) > 0 ||
    (validation.summary?.fileDuplicateCount || 0) > 0 ||
    (validation.summary?.totalRows || 0) === 0 ||
    (moduleKey === 'employees' && periodPolicy && !periodPolicy.allowed);

  if (hasHardErrors || (!validation.canProceed && !validation.reimportWarning)) {
    res.status(400).json({
      ...validation,
      periodPolicy,
      success: false
    });
    return { handled: true, validation, periodPolicy };
  }

  if (validation.reimportWarning && !allowReimport) {
    res.status(200).json({
      success: false,
      dryRun: false,
      canProceed: false,
      requiresReimportConfirmation: true,
      code: 'DUPLICATE_FILE_REIMPORT_CONFIRM',
      message: validation.reimportWarning.message,
      reimportWarning: validation.reimportWarning,
      summary: validation.summary
    });
    return { handled: true, validation, periodPolicy };
  }

  // Tahan proses simpan jika modul umum terdeteksi multi-bulan dan belum lolos konfirmasi tahap 2/2
  if (periodPolicy && !periodPolicy.allowed && periodPolicy.requiresConfirmation) {
    res.status(200).json({
      success: false,
      dryRun: false,
      canProceed: false,
      requiresConfirmation: true,
      confirmStep: periodPolicy.confirmStep,
      totalConfirmSteps: periodPolicy.totalConfirmSteps,
      code: periodPolicy.code,
      message: periodPolicy.message,
      periods: periodPolicy.periods,
      summary: validation.summary
    });
    return { handled: true, validation, periodPolicy };
  }

  return { handled: false, validation, periodPolicy, workbook };
};

module.exports = {
  validateImportFile,
  runDryRunOrGuard
};
