const xlsx = require('xlsx');
const prisma = require('../../config/database');
const repository = require('./repository');
const { readWorkbookSafe, sheetToMatrix } = require('../../utils/excelReader');
const { MONTH_NAMES, resolvePeriodId } = require('../../utils/importBatch');

const MONTH_MAP = {
  jan: 1, januari: 1, january: 1,
  feb: 2, peb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agust: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nop: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12
};

const EXCEL_ERR_TOKENS = ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#N/A', '#NUM!', '#NULL!'];

const normHeader = (val) => String(val || '').replace(/\u00A0/g, ' ').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const isGuideOrOtherModuleSheet = (sheetName) => {
  const l = String(sheetName || '').toLowerCase();
  const skipKeywords = [
    'panduan', 'aturan', 'ketentuan', 'petunjuk', 'instruksi', 'readme',
    'demografi', 'karyawan', 'pegawai', 'turnover', 'kehadiran', 'absensi',
    'sales', 'omset', 'fraud', 'sp', 'kasus', 'wlkp', 'phase', 'critical', 'visual'
  ];
  return skipKeywords.some(k => l.includes(k));
};

const selectProductionSheets = (workbook) => {
  const allSheets = workbook.SheetNames || [];
  let targets = allSheets.filter(name => {
    const l = name.toLowerCase();
    if (['panduan', 'aturan', 'ketentuan', 'petunjuk', 'instruksi', 'readme'].some(k => l.includes(k))) {
      return false;
    }
    return l.includes('produksi') || l.includes('production') || l.includes('supply') || l.includes('output');
  });

  if (targets.length === 0) {
    targets = allSheets.filter(name => !isGuideOrOtherModuleSheet(name));
  }
  if (targets.length === 0 && allSheets.length > 0) {
    targets = [allSheets[0]];
  }
  return targets;
};

const parseMonthToken = (rawVal) => {
  if (rawVal === undefined || rawVal === null || rawVal === '') return null;

  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return {
      month: rawVal.getMonth() + 1,
      embeddedYear: rawVal.getFullYear() >= 2020 && rawVal.getFullYear() <= 2100 ? rawVal.getFullYear() : null
    };
  }

  if (typeof rawVal === 'number') {
    if (Number.isInteger(rawVal) && rawVal >= 1 && rawVal <= 12) {
      return { month: rawVal, embeddedYear: null };
    }
    if (rawVal >= 30000 && rawVal <= 80000) {
      const d = new Date(Math.round((rawVal - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        return { month: d.getUTCMonth() + 1, embeddedYear: y >= 2020 && y <= 2100 ? y : null };
      }
    }
    return null;
  }

  const s = String(rawVal).replace(/\u00A0/g, ' ').trim().toLowerCase();
  if (!s || s === '-') return null;

  let embeddedYear = null;
  const yrMatch = s.match(/\b(20\d{2})\b/);
  if (yrMatch) embeddedYear = parseInt(yrMatch[1], 10);

  // Format YYYY-MM atau MM/YYYY
  const isoYm = s.match(/^(20\d{2})[-/](\d{1,2})$/);
  if (isoYm) {
    const m = parseInt(isoYm[2], 10);
    if (m >= 1 && m <= 12) return { month: m, embeddedYear: parseInt(isoYm[1], 10) };
  }
  const myMatch = s.match(/^(\d{1,2})[-/](20\d{2})$/);
  if (myMatch) {
    const m = parseInt(myMatch[1], 10);
    if (m >= 1 && m <= 12) return { month: m, embeddedYear: parseInt(myMatch[2], 10) };
  }

  const sortedMonths = Object.entries(MONTH_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [mName, mNum] of sortedMonths) {
    if (new RegExp(`(?<![a-z])${mName}(?![a-z])`).test(s)) {
      return { month: mNum, embeddedYear };
    }
  }

  if (/^\d{1,2}$/.test(s)) {
    const m = parseInt(s, 10);
    if (m >= 1 && m <= 12) return { month: m, embeddedYear: null };
  }

  return null;
};

const parseYearToken = (rawVal) => {
  if (rawVal === undefined || rawVal === null || rawVal === '') return { empty: true, valid: true, year: null };
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    const y = rawVal.getFullYear();
    return (y >= 2020 && y <= 2100)
      ? { empty: false, valid: true, year: y }
      : { empty: false, valid: false, raw: String(rawVal) };
  }

  const s = String(rawVal).replace(/\u00A0/g, ' ').trim();
  if (!s || s === '-') return { empty: true, valid: true, year: null };

  const exact4 = s.match(/^(20\d{2})$/);
  if (exact4) {
    const y = parseInt(exact4[1], 10);
    return { empty: false, valid: y >= 2020 && y <= 2100, year: y, raw: s };
  }

  const bannerMatch = s.match(/^(?:tahun|periode|thn|year)\s*(20\d{2})$/i);
  if (bannerMatch) {
    const y = parseInt(bannerMatch[1], 10);
    return { empty: false, valid: y >= 2020 && y <= 2100, year: y, raw: s };
  }

  if (/^\d{2}$/.test(s)) {
    const y = 2000 + parseInt(s, 10);
    return { empty: false, valid: y >= 2020 && y <= 2100, year: y, raw: s };
  }

  return { empty: false, valid: false, year: null, raw: s };
};

const parseProductionQty = (rawVal) => {
  if (rawVal === undefined || rawVal === null || rawVal === '') {
    return { empty: true, valid: false, qty: null, raw: '' };
  }
  if (typeof rawVal === 'string') {
    const upper = rawVal.trim().toUpperCase();
    if (EXCEL_ERR_TOKENS.some(tok => upper.includes(tok))) {
      return { empty: false, valid: false, qty: null, raw: rawVal };
    }
  }
  if (typeof rawVal === 'number') {
    if (isNaN(rawVal) || rawVal < 0) return { empty: false, valid: false, qty: null, raw: String(rawVal) };
    return { empty: false, valid: true, qty: Number(rawVal.toFixed(2)) };
  }

  const s = String(rawVal).replace(/\u00A0/g, ' ').trim();
  if (!s || s === '-') return { empty: true, valid: false, qty: null, raw: s };

  // Tolak jika ada teks satuan (misal "42500 pcs") sesuai aturan template klien
  if (!/^-?[\d.,\s]+$/.test(s)) {
    return { empty: false, valid: false, qty: null, raw: s };
  }

  let cleaned = s.replace(/\s+/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (/^\d+,\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) {
    return { empty: false, valid: false, qty: null, raw: s };
  }
  return { empty: false, valid: true, qty: Number(num.toFixed(2)) };
};

const detectHeaderColumns = (row = []) => {
  let monthCol = -1;
  let yearCol = -1;
  let qtyCol = -1;
  let notesCol = -1;

  row.forEach((cell, idx) => {
    const n = normHeader(cell);
    if (!n) return;
    if (monthCol === -1 && ['bulan', 'month', 'namabulan', 'periodebulan', 'periode'].includes(n)) {
      monthCol = idx;
    } else if (yearCol === -1 && ['tahun', 'year', 'periodetahun', 'thn'].includes(n)) {
      yearCol = idx;
    } else if (
      qtyCol === -1 &&
      (
        n === 'jumlahproduksi' ||
        n === 'jmlproduksi' ||
        n === 'realisasiproduksi' ||
        n === 'realisasijumlahproduksi' ||
        n === 'totalproduksi' ||
        n === 'outputproduksi' ||
        n === 'productionqty' ||
        n === 'qtyproduksi' ||
        n === 'produksi'
      )
    ) {
      qtyCol = idx;
    } else if (notesCol === -1 && ['keterangan', 'catatan', 'notes', 'remark', 'deskripsi'].includes(n)) {
      notesCol = idx;
    }
  });

  const isValidHeader = monthCol !== -1 && qtyCol !== -1;
  return { isValidHeader, monthCol, yearCol, qtyCol, notesCol };
};

/**
 * Parser terpadu untuk Excel Realisasi Produksi (Mendukung Multi-Tahun, Multi-Sheet,
 * Baris Pemisah Tahun seperti "TAHUN 2026", Baris TOTAL, dan Tabel Panduan/Aturan di bawah data).
 */
const parseProductionWorkbook = (filePathOrWorkbook) => {
  const workbook = readWorkbookSafe(filePathOrWorkbook);
  const targetSheets = selectProductionSheets(workbook);

  const headerErrors = [];
  const rowErrors = [];
  const parsedRows = [];

  for (const sheetName of targetSheets) {
    const matrix = sheetToMatrix(workbook.Sheets[sheetName]);
    if (matrix.length === 0) continue;

    // Cari apakah sheet ini adalah murni tabel panduan ("Kolom / Aturan | Keterangan")
    const firstNonEmpty = matrix.find(r => Array.isArray(r) && r.some(c => String(c || '').trim() !== ''));
    if (firstNonEmpty) {
      const firstJoined = firstNonEmpty.map(normHeader).join(' ');
      if (firstJoined.includes('kolomaturan') && targetSheets.length > 1) {
        continue;
      }
    }

    let headerInfo = null;
    let headerRowIdx = -1;

    for (let r = 0; r < Math.min(15, matrix.length); r++) {
      const candidate = detectHeaderColumns(matrix[r] || []);
      if (candidate.isValidHeader) {
        headerInfo = candidate;
        headerRowIdx = r;
        break;
      }
    }

    if (!headerInfo) {
      headerErrors.push(
        `Sheet '${sheetName}': Header kolom wajib ('Bulan', 'Tahun', dan 'Jumlah Produksi') tidak ditemukan.`
      );
      continue;
    }

    // Cek konteks tahun dari nama sheet jika ada (misal sheet "Produksi 2025")
    const sheetYearMatch = String(sheetName).match(/\b(20\d{2})\b/);
    let activeYearBanner = sheetYearMatch ? parseInt(sheetYearMatch[1], 10) : null;
    let insideRulesBlock = false;

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const nonEmptyCells = row
        .map(c => (c === undefined || c === null ? '' : String(c).replace(/\u00A0/g, ' ').trim()))
        .filter(Boolean);

      // 1. Abaikan baris kosong (pemisah antar tahun/blok)
      if (nonEmptyCells.length === 0) continue;

      // 2. Jika menemukan header tabel baru di tengah sheet (misal blok tahun berikutnya), perbarui posisi kolom & lanjut
      const repeatedHeader = detectHeaderColumns(row);
      if (repeatedHeader.isValidHeader) {
        headerInfo = repeatedHeader;
        insideRulesBlock = false;
        continue;
      }

      const normRowText = nonEmptyCells.map(normHeader).join(' ');
      const firstCellNorm = normHeader(row[0] ?? nonEmptyCells[0]);

      // 3. Abaikan blok "Kolom / Aturan | Keterangan" jika diletakkan di bagian bawah sheet yang sama
      if (firstCellNorm === 'kolomaturan' || normRowText.includes('kolomaturan')) {
        insideRulesBlock = true;
        continue;
      }
      if (insideRulesBlock) continue;

      // 4. Abaikan baris rekapitulasi seperti TOTAL / SUBTOTAL / RATA-RATA
      if (
        firstCellNorm.startsWith('total') ||
        firstCellNorm.startsWith('subtotal') ||
        firstCellNorm.startsWith('grandtotal') ||
        firstCellNorm.startsWith('ratarata') ||
        firstCellNorm === 'jumlah'
      ) {
        continue;
      }

      const rawMonth = row[headerInfo.monthCol];
      const rawYear = headerInfo.yearCol !== -1 ? row[headerInfo.yearCol] : null;
      const rawQty = row[headerInfo.qtyCol];
      const rawNotes = headerInfo.notesCol !== -1 ? row[headerInfo.notesCol] : null;

      const monthInfo = parseMonthToken(rawMonth);
      const yearInfo = parseYearToken(rawYear);
      const qtyInfo = parseProductionQty(rawQty);

      // 5. Deteksi Baris Pemisah Tahun ("TAHUN 2025", "2026", "PERIODE 2026") tanpa nilai produksi
      if (!monthInfo && qtyInfo.empty && nonEmptyCells.length <= 2) {
        const joined = nonEmptyCells.join(' ');
        const separatorYear = joined.match(/^(?:tahun|periode|thn|year)?\s*(20\d{2})$/i);
        if (separatorYear) {
          activeYearBanner = parseInt(separatorYear[1], 10);
          continue;
        }
      }

      const label = `Sheet '${sheetName}' Baris ${r + 1}`;

      // Validasi Bulan
      if (!monthInfo) {
        rowErrors.push(
          `${label}: Nilai Bulan "${rawMonth ?? ''}" tidak valid (gunakan Januari s/d Desember).`
        );
        continue;
      }

      // Resolusi Tahun: Kolom Tahun -> Tahun di dalam sel Bulan ("Januari 2026") -> Banner Pemisah Tahun di atasnya
      let resolvedYear = null;
      if (!yearInfo.empty) {
        if (!yearInfo.valid) {
          rowErrors.push(
            `${label}: Nilai Tahun "${yearInfo.raw}" tidak valid (gunakan 4 digit angka, contoh: 2026).`
          );
          continue;
        }
        resolvedYear = yearInfo.year;
        activeYearBanner = resolvedYear;
      } else if (monthInfo.embeddedYear) {
        resolvedYear = monthInfo.embeddedYear;
        activeYearBanner = resolvedYear;
      } else if (activeYearBanner) {
        resolvedYear = activeYearBanner;
      }

      if (!resolvedYear || resolvedYear < 2020 || resolvedYear > 2100) {
        rowErrors.push(
          `${label} (${MONTH_NAMES[monthInfo.month - 1]}): Kolom 'Tahun' wajib diisi dengan 4 digit tahun valid (contoh: 2026).`
        );
        continue;
      }

      // Validasi Jumlah Produksi
      if (qtyInfo.empty || !qtyInfo.valid) {
        rowErrors.push(
          `${label} (${MONTH_NAMES[monthInfo.month - 1]} ${resolvedYear}): Jumlah Produksi "${qtyInfo.raw}" tidak valid (masukkan angka >= 0 tanpa teks satuan).`
        );
        continue;
      }

      const periodKey = `${resolvedYear}-${String(monthInfo.month).padStart(2, '0')}`;
      const cleanNotes = rawNotes !== undefined && rawNotes !== null && String(rawNotes).trim() !== ''
        ? String(rawNotes).trim()
        : null;

      parsedRows.push({
        label,
        rowNum: r + 1,
        sheetName,
        year: resolvedYear,
        month: monthInfo.month,
        monthName: MONTH_NAMES[monthInfo.month - 1],
        periodKey,
        productionQty: qtyInfo.qty,
        notes: cleanNotes
      });
    }
  }

  return {
    targetSheets,
    headerErrors,
    rowErrors,
    parsedRows
  };
};

const formatRecord = (record) => ({
  id: record.id,
  periodId: record.periodId,
  year: record.period?.year ?? null,
  month: record.period?.month ?? null,
  monthName: record.period?.month ? MONTH_NAMES[record.period.month - 1] : null,
  productionQty: Number(record.productionQty || 0),
  notes: record.notes || null,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

// === CRUD SERVICES ===

const getAllProduction = async (filters = {}) => {
  const rows = await repository.findAllProduction({ year: filters.year });
  const formatted = rows.map(formatRecord);

  // Ringkasan total per tahun untuk memudahkan FE menampilkan rekap multi-tahun
  const byYearSummary = {};
  formatted.forEach(item => {
    if (!item.year) return;
    if (!byYearSummary[item.year]) {
      byYearSummary[item.year] = { year: item.year, monthsCount: 0, totalProductionQty: 0 };
    }
    byYearSummary[item.year].monthsCount += 1;
    byYearSummary[item.year].totalProductionQty += item.productionQty;
  });

  return {
    items: formatted,
    yearlySummary: Object.values(byYearSummary).sort((a, b) => b.year - a.year)
  };
};

const getProductionById = async (id) => {
  const record = await repository.findProductionById(id);
  if (!record) {
    const err = new Error('Data realisasi produksi tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }
  return formatRecord(record);
};

const createOrUpsertProduction = async (payload = {}) => {
  const monthInfo = parseMonthToken(payload.month ?? payload.bulan);
  const yearInfo = parseYearToken(payload.year ?? payload.tahun);
  const qtyInfo = parseProductionQty(payload.productionQty ?? payload.jumlahProduksi);

  if (!monthInfo) {
    throw new Error('Bulan tidak valid (gunakan angka 1-12 atau nama bulan Januari-Desember).');
  }
  const year = !yearInfo.empty && yearInfo.valid ? yearInfo.year : monthInfo.embeddedYear;
  if (!year) {
    throw new Error('Tahun wajib diisi dalam format 4 digit (contoh: 2026).');
  }
  if (qtyInfo.empty || !qtyInfo.valid) {
    throw new Error('Jumlah Produksi wajib berupa angka >= 0 tanpa teks satuan.');
  }

  const periodId = await resolvePeriodId(year, monthInfo.month);
  if (!periodId) {
    throw new Error('Gagal membuat atau menemukan periode pelaporan.');
  }

  const notes = payload.notes !== undefined
    ? (payload.notes ? String(payload.notes).trim() : null)
    : undefined;

  const saved = await repository.upsertProductionByPeriod(periodId, {
    productionQty: qtyInfo.qty,
    notes
  });
  return formatRecord(saved);
};

const updateProduction = async (id, payload = {}) => {
  const existing = await repository.findProductionById(id);
  if (!existing) {
    const err = new Error('Data realisasi produksi tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }

  const updateData = {};

  if (payload.productionQty !== undefined || payload.jumlahProduksi !== undefined) {
    const qtyInfo = parseProductionQty(payload.productionQty ?? payload.jumlahProduksi);
    if (qtyInfo.empty || !qtyInfo.valid) {
      throw new Error('Jumlah Produksi wajib berupa angka >= 0 tanpa teks satuan.');
    }
    updateData.productionQty = qtyInfo.qty;
  }

  if (payload.notes !== undefined) {
    updateData.notes = payload.notes ? String(payload.notes).trim() : null;
  }

  if (payload.year !== undefined || payload.month !== undefined || payload.tahun !== undefined || payload.bulan !== undefined) {
    const targetMonth = payload.month !== undefined || payload.bulan !== undefined
      ? parseMonthToken(payload.month ?? payload.bulan)?.month
      : existing.period?.month;
    const targetYearRes = payload.year !== undefined || payload.tahun !== undefined
      ? parseYearToken(payload.year ?? payload.tahun)
      : { valid: true, empty: false, year: existing.period?.year };

    if (!targetMonth || !targetYearRes.valid || !targetYearRes.year) {
      throw new Error('Kombinasi Bulan dan Tahun baru tidak valid.');
    }
    const newPeriodId = await resolvePeriodId(targetYearRes.year, targetMonth);
    if (newPeriodId && newPeriodId !== existing.periodId) {
      const collision = await repository.findProductionByPeriodId(newPeriodId);
      if (collision && collision.id !== id) {
        throw new Error(`Data produksi untuk periode ${MONTH_NAMES[targetMonth - 1]} ${targetYearRes.year} sudah terdaftar.`);
      }
      updateData.periodId = newPeriodId;
    }
  }

  const updated = await repository.updateProductionById(id, updateData);
  return formatRecord(updated);
};

const deleteProduction = async (id) => {
  const existing = await repository.findProductionById(id);
  if (!existing) {
    const err = new Error('Data realisasi produksi tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }
  await repository.deleteProductionById(id);
  return { id };
};

// === BULK IMPORT SERVICE (MULTI-TAHUN & MULTI-BULAN) ===

const importProductionExcel = async (filePathOrWorkbook) => {
  const parsed = parseProductionWorkbook(filePathOrWorkbook);
  if (parsed.headerErrors.length > 0) {
    const err = new Error(parsed.headerErrors[0]);
    err.statusCode = 400;
    throw err;
  }
  if (parsed.rowErrors.length > 0) {
    const err = new Error(parsed.rowErrors[0]);
    err.statusCode = 400;
    err.details = parsed.rowErrors;
    throw err;
  }
  if (parsed.parsedRows.length === 0) {
    const err = new Error('Tidak ada baris data produksi valid yang dapat diimpor.');
    err.statusCode = 400;
    throw err;
  }

  // Pastikan seluruh ReportingPeriod tersedia terlebih dahulu
  const periodIdByKey = new Map();
  for (const row of parsed.parsedRows) {
    if (!periodIdByKey.has(row.periodKey)) {
      const pid = await resolvePeriodId(row.year, row.month);
      periodIdByKey.set(row.periodKey, pid);
    }
  }

  // Simpan secara atomik dengan transaksi database
  const savedRecords = await prisma.$transaction(
    parsed.parsedRows.map(row => {
      const periodId = periodIdByKey.get(row.periodKey);
      return prisma.productionMonthly.upsert({
        where: { periodId },
        update: {
          productionQty: row.productionQty,
          ...(row.notes !== null ? { notes: row.notes } : {})
        },
        create: {
          periodId,
          productionQty: row.productionQty,
          notes: row.notes
        },
        include: {
          period: { select: { id: true, year: true, month: true } }
        }
      });
    })
  );

  return {
    imported: savedRecords.length,
    parsedRows: parsed.parsedRows,
    items: savedRecords.map(formatRecord)
  };
};

// === TEMPLATE EXCEL GENERATOR (SESUAI KONTEKS KLIEN) ===

const generateTemplateWorkbookBuffer = () => {
  const wb = xlsx.utils.book_new();
  const currentYear = new Date().getFullYear();

  const sampleData = [
    ['Bulan', 'Tahun', 'Jumlah Produksi'],
    ['Januari', currentYear, 42500],
    ['Februari', currentYear, 44100],
    ['Maret', currentYear, 46800],
    ['April', currentYear, 43900],
    ['Mei', currentYear, 47200],
    ['Juni', currentYear, 48500]
  ];
  const wsData = xlsx.utils.aoa_to_sheet(sampleData);
  wsData['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 22 }];
  xlsx.utils.book_append_sheet(wb, wsData, 'Data Produksi');

  const rulesData = [
    ['Kolom / Aturan', 'Keterangan'],
    ['Bulan', 'Nama bulan periode laporan (contoh: Januari, Februari, ..., Desember).'],
    ['Tahun', `Tahun periode laporan dalam format 4 digit angka (contoh: ${currentYear}). Mendukung input lintas tahun (multi-tahun) dalam satu sheet.`],
    ['Jumlah Produksi', 'Total realisasi jumlah produksi pada bulan dan tahun tersebut (angka tanpa teks satuan).'],
    ['Pemisah Tahun (Opsional)', 'Anda dapat langsung menulis tahun berbeda pada kolom Tahun, atau menyisipkan baris kosong / judul tahun (misal: "TAHUN 2025") sebagai pemisah.']
  ];
  const wsRules = xlsx.utils.aoa_to_sheet(rulesData);
  wsRules['!cols'] = [{ wch: 26 }, { wch: 95 }];
  xlsx.utils.book_append_sheet(wb, wsRules, 'Panduan & Aturan');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  parseProductionWorkbook,
  getAllProduction,
  getProductionById,
  createOrUpsertProduction,
  updateProduction,
  deleteProduction,
  importProductionExcel,
  generateTemplateWorkbookBuffer
};
