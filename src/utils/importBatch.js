// utils/importBatchHelper.js
const prisma = require('../config/database');

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// Tambahkan modul baru di sini kapan pun ada fitur import baru
const IMPORT_MODULES = {
  DEMOGRAFI_HO: 'DEMOGRAFI_HO',
  DEMOGRAFI_STORE: 'DEMOGRAFI_STORE',
  MOVEMENT: 'MOVEMENT',
  COMPLIANCE: 'COMPLIANCE',
  SP: 'SP',
  SP_REKAP: 'SP_REKAP',
  FRAUD: 'FRAUD',
  BIPARTIT: 'BIPARTIT',
  ATTENDANCE: 'ATTENDANCE',
  SALES: 'SALES',
  PRODUCTION: 'PRODUCTION'
};

/**
 * Cari atau buat ReportingPeriod agar setiap log ImportBatch terikat langsung ke periodId (Audit Trail)
 */
const resolvePeriodId = async (year, month) => {
  const numYear = parseInt(year, 10);
  const numMonth = parseInt(month, 10);
  if (!numYear || !numMonth || numMonth < 1 || numMonth > 12) return null;

  const existing = await prisma.reportingPeriod.findFirst({
    where: { year: numYear, month: numMonth },
    select: { id: true }
  });
  if (existing) return existing.id;

  try {
    const periodStart = new Date(Date.UTC(numYear, numMonth - 1, 1));
    const periodEnd = new Date(Date.UTC(numYear, numMonth, 0));
    const created = await prisma.reportingPeriod.create({
      data: { year: numYear, month: numMonth, periodStart, periodEnd },
      select: { id: true }
    });
    return created.id;
  } catch (err) {
    // Pengaman jika terjadi race condition saat create bersamaan
    const fallback = await prisma.reportingPeriod.findFirst({
      where: { year: numYear, month: numMonth },
      select: { id: true }
    });
    return fallback ? fallback.id : null;
  }
};

/**
 * Normalisasi Set/Array 'YYYY-MM' dan parsedRows menjadi daftar periode terurut
 */
const summarizeDetectedPeriods = (detectedPeriods, parsedRows = []) => {
  const periodMap = new Map();

  Array.from(detectedPeriods || []).forEach(key => {
    const [yStr, mStr] = String(key).split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    if (!year || !month || month < 1 || month > 12) return;

    periodMap.set(key, {
      key,
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      count: 0,
      sampleRows: []
    });
  });

  if (Array.isArray(parsedRows) && parsedRows.length > 0) {
    parsedRows.forEach(r => {
      const key = r.periodKey || (r.year && r.month ? `${r.year}-${String(r.month).padStart(2, '0')}` : null);
      if (!key) return;

      if (!periodMap.has(key)) {
        const [yStr, mStr] = key.split('-');
        const year = parseInt(yStr, 10);
        const month = parseInt(mStr, 10);
        if (!year || !month || month < 1 || month > 12) return;
        periodMap.set(key, {
          key,
          year,
          month,
          label: `${MONTH_NAMES[month - 1]} ${year}`,
          count: 0,
          sampleRows: []
        });
      }

      const entry = periodMap.get(key);
      entry.count += 1;
      if (entry.sampleRows.length < 5) {
        entry.sampleRows.push(r.label || (r.rowNum ? `Baris ${r.rowNum}` : null));
      }
    });
  }

  return Array.from(periodMap.values())
    .map(p => ({ ...p, sampleRows: p.sampleRows.filter(Boolean) }))
    .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key));
};

/**
 * Penjaga Aturan Periode (In-Memory):
 * - 'STRICT_SINGLE': Demografi (tolak keras jika lebih dari 1 sheet atau lebih dari 1 bulan)
 * - 'MULTI_CONFIRM': Modul umum (tahan dengan verifikasi 2 tahap jika beda bulan)
 */
const enforcePeriodPolicy = ({
  mode = 'STRICT_SINGLE',
  sheets = [],
  detectedPeriods = [],
  parsedRows = [],
  confirmStep = 0
}) => {
  const periods = summarizeDetectedPeriods(detectedPeriods, parsedRows);

  if (mode === 'STRICT_SINGLE' && Array.isArray(sheets) && sheets.length > 1) {
    return {
      allowed: false,
      httpStatus: 400,
      requiresConfirmation: false,
      code: 'MULTI_SHEET_NOT_ALLOWED',
      message: `Upload ditolak: Module Demografi hanya mengizinkan 1 sheet data per file. Ditemukan ${sheets.length} sheet (${sheets.join(', ')}).`,
      periods
    };
  }

  if (periods.length <= 1) {
    return {
      allowed: true,
      httpStatus: 200,
      requiresConfirmation: false,
      isMultiMonth: false,
      primaryPeriod: periods[0] || null,
      periods
    };
  }

  if (mode === 'STRICT_SINGLE') {
    const primary = periods[0];
    const outliers = periods.slice(1).map(p => {
      const rowInfo = p.sampleRows.length > 0 ? `, contoh: ${p.sampleRows.join(', ')}` : '';
      const countInfo = p.count > 0 ? `${p.count} baris` : 'terdeteksi';
      return `${p.label} (${countInfo}${rowInfo})`;
    }).join('; ');

    const primaryInfo = primary.count > 0 ? `${primary.label} (${primary.count} baris)` : primary.label;

    return {
      allowed: false,
      httpStatus: 400,
      requiresConfirmation: false,
      code: 'DEMOGRAPHY_MULTI_MONTH_REJECTED',
      message: `Upload ditolak: Module Demografi wajib 1 bulan per file. Mayoritas data adalah ${primaryInfo}, namun ditemukan bulan berbeda: ${outliers}.`,
      primaryPeriod: primary,
      periods
    };
  }

  // Mode MULTI_CONFIRM (Verifikasi 2 Tahap)
  const step = Number(confirmStep) || 0;
  const summaryText = periods
    .map(p => (p.count > 0 ? `${p.label} (${p.count} baris)` : p.label))
    .join(', ');

  if (step < 2) {
    const nextStep = step + 1;
    return {
      allowed: false,
      httpStatus: 200,
      requiresConfirmation: true,
      confirmStep: nextStep,
      totalConfirmSteps: 2,
      code: `MULTI_MONTH_CONFIRM_STEP_${nextStep}`,
      message: nextStep === 1
        ? `Ditemukan perbedaan bulan pada data yang diinput (${summaryText}). Apakah yakin ingin melanjutkan proses import meskipun terdapat perbedaan bulan pada data yang diinput?`
        : `Konfirmasi Tahap 2/2: Data lintas ${periods.length} bulan (${summaryText}) akan disimpan sekaligus ke database. Yakin ingin melanjutkan?`,
      primaryPeriod: periods[0],
      periods
    };
  }

  return {
    allowed: true,
    httpStatus: 200,
    requiresConfirmation: false,
    isMultiMonth: true,
    primaryPeriod: periods[0],
    periods
  };
};

/**
 * Catat log aktivitas upload ke tabel ImportBatch (terikat langsung ke ReportingPeriod)
 * Multi-bulan otomatis dipecah menjadi 1 log per bulan agar audit & status Jan-Des akurat.
 */
const logImportBatch = async ({
  module,
  periodYear = null,
  periodMonth = null,
  periods = [],
  fileName = 'unknown.xlsx',
  totalRows = 0,
  successRows = 0,
  failedRows = 0,
  startedAt = new Date()
}) => {
  const completedAt = new Date();
  const safeFileName = String(fileName || 'unknown.xlsx').slice(0, 255);
  const status = failedRows > 0 && successRows === 0
    ? 'FAILED'
    : (failedRows > 0 ? 'PARTIAL' : 'SUCCESS');

  // Kasus Multi-Bulan: catat 1 baris log per bulan terdampak dengan periodId masing-masing
  if (Array.isArray(periods) && periods.length > 1) {
    const entries = await Promise.all(
      periods.map(async (p) => {
        const periodId = await resolvePeriodId(p.year, p.month);
        return {
          module,
          periodId,
          periodYear: p.year,
          periodMonth: p.month,
          fileName: safeFileName,
          sourceType: 'MULTI_MONTH',
          status,
          totalRows: p.count || totalRows,
          successRows: p.count || successRows,
          failedRows: 0,
          startedAt,
          completedAt
        };
      })
    );

    return await prisma.$transaction(
      entries.map(data => prisma.importBatch.create({ data }))
    );
  }

  // Kasus Single-Bulan (atau log gagal tanpa periode)
  const targetYear = periodYear || periods[0]?.year || null;
  const targetMonth = periodMonth || periods[0]?.month || null;
  const periodId = await resolvePeriodId(targetYear, targetMonth);

  return await prisma.importBatch.create({
    data: {
      module,
      periodId,
      periodYear: targetYear,
      periodMonth: targetMonth,
      fileName: safeFileName,
      sourceType: periodId ? 'SINGLE_MONTH' : 'GENERAL',
      status,
      totalRows,
      successRows,
      failedRows,
      startedAt,
      completedAt
    }
  });
};

/**
 * Ambil status input Jan-Des per modul (Sudah/Belum Diinput + Nama File + periodId)
 */
const getImportStatusByYear = async ({ module, year }) => {
  const numYear = parseInt(year, 10) || new Date().getFullYear();

  const batches = await prisma.importBatch.findMany({
    where: {
      module,
      periodYear: numYear,
      status: { in: ['SUCCESS', 'PARTIAL'] }
    },
    include: { period: { select: { id: true, year: true, month: true } } },
    orderBy: { completedAt: 'desc' }
  });

  const latestByMonth = {};
  const filesByMonth = {};
  batches.forEach(b => {
    const m = b.periodMonth || b.period?.month;
    if (m >= 1 && m <= 12) {
      if (!latestByMonth[m]) latestByMonth[m] = b;
      if (b.fileName) {
        if (!filesByMonth[m]) filesByMonth[m] = [];
        if (!filesByMonth[m].includes(b.fileName)) {
          filesByMonth[m].push(b.fileName);
        }
      }
    }
  });

  // Fallback data lama di DB (sebelum ImportBatch aktif) agar status tetap akurat
  const legacyByMonth = {};
  const yearStart = new Date(Date.UTC(numYear, 0, 1));
  const yearEnd = new Date(Date.UTC(numYear, 11, 31, 23, 59, 59, 999));
  const addLegacyCount = (m, count = 1, periodId = null) => {
    if (m < 1 || m > 12) return;
    if (!legacyByMonth[m]) legacyByMonth[m] = { periodId, count: 0 };
    legacyByMonth[m].count += count;
    if (!legacyByMonth[m].periodId && periodId) legacyByMonth[m].periodId = periodId;
  };

  if (module === IMPORT_MODULES.DEMOGRAFI_HO || module === IMPORT_MODULES.DEMOGRAFI_STORE) {
    const periodsInYear = await prisma.reportingPeriod.findMany({
      where: { year: numYear },
      select: { id: true, month: true }
    });

    if (periodsInYear.length > 0) {
      const grouped = await prisma.employeeMonthlySnapshot.groupBy({
        by: ['periodId'],
        where: {
          periodId: { in: periodsInYear.map(p => p.id) },
          storeId: module === IMPORT_MODULES.DEMOGRAFI_STORE ? { not: null } : null
        },
        _count: { id: true }
      });

      const periodMap = new Map(periodsInYear.map(p => [p.id, p]));
      grouped.forEach(g => {
        const p = periodMap.get(g.periodId);
        if (p) legacyByMonth[p.month] = { periodId: p.id, count: g._count.id };
      });
    }
  } else if (
    module === IMPORT_MODULES.ATTENDANCE ||
    module === IMPORT_MODULES.SALES ||
    module === IMPORT_MODULES.SP_REKAP ||
    module === IMPORT_MODULES.PRODUCTION
  ) {
    const periodsInYear = await prisma.reportingPeriod.findMany({
      where: { year: numYear },
      select: { id: true, month: true }
    });
    if (periodsInYear.length > 0) {
      const model = module === IMPORT_MODULES.ATTENDANCE
        ? prisma.attendanceAggregateMonthly
        : module === IMPORT_MODULES.SALES
          ? prisma.salesMonthly
          : module === IMPORT_MODULES.PRODUCTION
            ? prisma.productionMonthly
            : prisma.spAggregateMonthly;
      const grouped = await model.groupBy({
        by: ['periodId'],
        where: { periodId: { in: periodsInYear.map(p => p.id) } },
        _count: { id: true }
      });
      const periodMap = new Map(periodsInYear.map(p => [p.id, p]));
      grouped.forEach(g => {
        const p = periodMap.get(g.periodId);
        if (p) addLegacyCount(p.month, g._count.id, p.id);
      });
    }
  } else if (module === IMPORT_MODULES.MOVEMENT) {
    const rows = await prisma.employeeMovement.findMany({
      where: { movementDate: { gte: yearStart, lte: yearEnd } },
      select: { movementDate: true }
    });
    rows.forEach(r => addLegacyCount(new Date(r.movementDate).getUTCMonth() + 1));
  } else if (module === IMPORT_MODULES.SP) {
    const rows = await prisma.disciplinaryCase.findMany({
      where: { category: { not: 'Fraud & Audit' }, startDate: { gte: yearStart, lte: yearEnd } },
      select: { startDate: true }
    });
    rows.forEach(r => { if (r.startDate) addLegacyCount(new Date(r.startDate).getUTCMonth() + 1); });
  } else if (module === IMPORT_MODULES.FRAUD) {
    const rows = await prisma.fraudCase.findMany({
      where: {
        OR: [
          { caseDate: { gte: yearStart, lte: yearEnd } },
          { auditDate: { gte: yearStart, lte: yearEnd } }
        ]
      },
      select: { caseDate: true, auditDate: true }
    });
    rows.forEach(r => {
      const d = r.caseDate || r.auditDate;
      if (d) addLegacyCount(new Date(d).getUTCMonth() + 1);
    });
  } else if (module === IMPORT_MODULES.BIPARTIT) {
    const rows = await prisma.industrialRelationCase.findMany({
      where: {
        OR: [
          { startDate: { gte: yearStart, lte: yearEnd } },
          { endDate: { gte: yearStart, lte: yearEnd } }
        ]
      },
      select: { startDate: true, endDate: true }
    });
    rows.forEach(r => {
      const d = r.startDate || r.endDate;
      if (d) addLegacyCount(new Date(d).getUTCMonth() + 1);
    });
  }

  return MONTH_NAMES.map((monthName, idx) => {
    const month = idx + 1;
    const batch = latestByMonth[month];
    const legacy = legacyByMonth[month];
    const isInputted = Boolean(batch) || Boolean(legacy);

    return {
      year: numYear,
      month,
      monthName,
      periodId: batch?.periodId || legacy?.periodId || null,
      status: isInputted ? 'SUDAH_DIINPUT' : 'BELUM_DIINPUT',
      isInputted,
      fileName: batch?.fileName || (legacy ? 'Data tersimpan (nama file belum tercatat)' : null),
      files: filesByMonth[month] || (batch?.fileName ? [batch.fileName] : []),
      totalRecords: batch?.successRows ?? legacy?.count ?? 0,
      lastBatchId: batch?.id || null,
      uploadedAt: batch?.completedAt || null
    };
  });
};

/**
 * Cek apakah file dengan nama yang sama sudah pernah diimport pada bulan yang sama
 */
const findDuplicateFileImports = async ({ moduleKeys = [], fileName = '', periods = [] }) => {
  const safeFileName = String(fileName || '').trim();
  if (!safeFileName || !Array.isArray(moduleKeys) || moduleKeys.length === 0) {
    return { isDuplicateFile: false, fileName: safeFileName, matchedPeriods: [], message: null };
  }

  const periodFilters = (Array.isArray(periods) ? periods : [])
    .filter(p => p && p.year && p.month)
    .map(p => ({ periodYear: Number(p.year), periodMonth: Number(p.month) }));

  const existingBatches = await prisma.importBatch.findMany({
    where: {
      module: { in: moduleKeys },
      status: { in: ['SUCCESS', 'PARTIAL'] },
      fileName: { equals: safeFileName, mode: 'insensitive' },
      ...(periodFilters.length > 0 ? { OR: periodFilters } : {})
    },
    orderBy: { completedAt: 'desc' }
  });

  const matchedMap = new Map();
  for (const b of existingBatches) {
    if (!b.periodYear || !b.periodMonth) continue;
    const key = `${b.periodYear}-${String(b.periodMonth).padStart(2, '0')}`;
    if (!matchedMap.has(key)) {
      matchedMap.set(key, {
        key,
        year: b.periodYear,
        month: b.periodMonth,
        label: `${MONTH_NAMES[b.periodMonth - 1]} ${b.periodYear}`,
        fileName: b.fileName,
        uploadedAt: b.completedAt || b.createdAt || null,
        totalRecords: b.successRows ?? b.totalRows ?? 0
      });
    }
  }

  const matchedPeriods = Array.from(matchedMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const isDuplicateFile = matchedPeriods.length > 0;
  const labels = matchedPeriods.map(p => p.label).join(', ');

  return {
    isDuplicateFile,
    fileName: safeFileName,
    matchedPeriods,
    message: isDuplicateFile
      ? `File "${safeFileName}" sudah pernah dimasukkan pada bulan ${labels}. Apakah Anda yakin ingin memasukkan lagi file yang sama?`
      : null
  };
};

module.exports = {
  MONTH_NAMES,
  IMPORT_MODULES,
  resolvePeriodId,
  summarizeDetectedPeriods,
  enforcePeriodPolicy,
  logImportBatch,
  getImportStatusByYear,
  findDuplicateFileImports
};