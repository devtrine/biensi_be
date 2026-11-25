const fs = require('fs');
const xlsx = require('xlsx');
const { success } = require('zod');
const service = require('./service');
const repository = require('./repository');
const { getAttendanceAggregate } = require('./repository');
const { runDryRunOrGuard } = require('../../utils/importValidator');
const { IMPORT_MODULES, logImportBatch } = require('../../utils/importBatch');

const parseExcel = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rawSheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

  let headerRowIndex = -1;
  for (let i = 0; i < rawSheet.length; i++) {
    if (rawSheet[i].some(cell => typeof cell === 'string' && cell.toUpperCase().includes('BULAN'))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) throw new Error("Format tidak dikenali, tidak ada kolom 'BULAN'");

  const headers = rawSheet[headerRowIndex];
  const dataRows = rawSheet.slice(headerRowIndex + 1);

  const cleanData = dataRows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header && typeof header === 'string') {
        const cleanHeader = header.replace(/\s+/g, ' ').trim().toUpperCase();
        obj[cleanHeader] = row[index];
      }
    });
    return obj;
  }).filter(row => row['BULAN']);

  return cleanData;
};

const parseExcel2D = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
};

const createPeriod = async (req, res) => {
  try {
    const data = await service.openNewPeriod(req.body.year, req.body.month);
    res.status(201).json({ success: true, message: 'Periode berhasil dibuka', data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getAllPeriods = async (req, res) => {
  try {
    const data = await service.getPeriods();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllAttendance = async (req, res) => {
  try {
    const data = await service.getAttendanceAggregate();
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllSales = async (req, res) => {
  try {
    const data = await service.getAllSales();
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAttendance = async (req, res) => {
  try {
    const { periodId } = req.params;
    const data = await service.getAttendance(periodId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const getSales = async (req, res) => {
  try {
    const { periodId } = req.params;
    const data = await service.getSales(periodId);
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const generateMonthlySnapshot = async (req, res) => {
  try {
    const data = await service.generateSnapshot(req.params.periodId);
    res.status(200).json({ success: true, message: 'Snapshot berhasil di-generate', data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSummary = async (req, res) => {
  try {
    const data = await service.getDashboardSummary(req.params.periodId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- HANDLER UPLOAD LEGACY ---

const uploadAttendance = async (req, res) => {
  try {
    if (!req.file) throw new Error('File Excel absensi wajib diunggah!');
    const rawData = parseExcel(req.file.path);
    const data = await service.importAttendanceAggregate(rawData);
    res.status(201).json({ success: true, message: 'Data absensi global ter-import', data, fileName: req.file.originalname });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

const uploadActualLabourCost = async (req, res) => {
  try {
    if (!req.file) throw new Error('File Excel labour cost wajib diunggah!');
    const rawData = parseExcel(req.file.path);
    const data = await service.importActualLabourCost(req.params.periodId, rawData);
    res.status(201).json({ success: true, message: `Berhasil update gaji aktual untuk ${data.imported} karyawan`, fileName: req.file.originalname });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

const uploadSales = async (req, res) => {
  try {
    if (!req.file) throw new Error('File Excel sales wajib diunggah!');
    const rawData = parseExcel(req.file.path);
    const data = await service.importSales(req.params.periodId, rawData);

    res.status(201).json({
      success: true,
      message: `Berhasil import ${data.imported} data sales`,
      fileName: req.file.originalname
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

const getActiveStorePerformance = async (req, res) => {
  try {
    const allPeriods = await repository.getAllPeriods();
    if (allPeriods.length === 0) {
      return res.status(404).json({ success: false, message: 'Belum ada data periode.' });
    }

    const activePeriodId = allPeriods[0].id;
    const result = await service.getStorePerformanceDashboard(activePeriodId);
    result.periodId = activePeriodId;

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getStorePerformanceByPeriod = async (req, res) => {
  try {
    const { periodId } = req.params;
    const result = await service.getStorePerformanceDashboard(periodId);
    result.periodId = periodId;

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- HANDLER UPLOAD UNIVERSAL (GUARD + IMPORT BATCH LOG) ---

const uploadAttendanceUniversal = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) throw new Error('File Excel wajib diunggah!');

    const guard = await runDryRunOrGuard(req, res, 'attendance');
    if (guard.handled) return;

    const workbook = xlsx.readFile(req.file.path);

    let targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      return lower.includes('kehadiran') || lower.includes('absensi') || lower.includes('attendance');
    });

    if (targetSheets.length === 0) {
      targetSheets = workbook.SheetNames.filter(name => {
        const lower = name.toLowerCase();
        return !lower.includes('demografi') && !lower.includes('turnover') && !lower.includes('sales') &&
               !lower.includes('fraud') && !lower.includes('sp') && !lower.includes('kasus') &&
               !lower.includes('phase') && !lower.includes('critical') && !lower.includes('visual') && !lower.includes('wlkp');
      });
    }

    if (targetSheets.length === 0) {
      targetSheets = [workbook.SheetNames[0]];
    }

    let totalImported = 0;
    const errorList = [];
    for (const sheetName of targetSheets) {
      try {
        const raw2DArray = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        const data = await service.importAttendanceUniversal(raw2DArray);
        totalImported += (data.imported || 0);
      } catch (sheetErr) {
        errorList.push(`Sheet '${sheetName}': ${sheetErr.message}`);
      }
    }

    if (totalImported === 0 && errorList.length === 0) {
      errorList.push('Tidak ada data absensi valid yang ditemukan pada sheet yang diproses.');
    }

    const totalRows = guard.validation?.summary?.totalRows || totalImported;
    if (totalImported > 0) {
      await logImportBatch({
        module: IMPORT_MODULES.ATTENDANCE,
        periods: guard.periodPolicy?.periods || [],
        fileName: req.file.originalname,
        totalRows,
        successRows: totalImported,
        failedRows: errorList.length,
        startedAt
      });
    }

    res.status(201).json({
      success: totalImported > 0 || errorList.length === 0,
      message: errorList.length > 0
        ? `Import Absensi Selesai! Sukses: ${totalImported}, Gagal: ${errorList.length}`
        : `Berhasil memproses ${totalImported} data absensi!`,
      data: {
        fileName: req.file.originalname,
        periods: guard.periodPolicy?.periods || [],
        imported: totalImported
      },
      errors: errorList
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
  }
};

const uploadSalesUniversal = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) throw new Error('File Excel wajib diunggah!');

    const guard = await runDryRunOrGuard(req, res, 'sales');
    if (guard.handled) return;

    const data = await service.importSalesUniversal(req.file.path);
    const totalRows = guard.validation?.summary?.totalRows || data.imported || 0;

    await logImportBatch({
      module: IMPORT_MODULES.SALES,
      periods: guard.periodPolicy?.periods || [],
      fileName: req.file.originalname,
      totalRows,
      successRows: data.imported || 0,
      failedRows: 0,
      startedAt
    });

    res.status(201).json({
      success: true,
      message: `Berhasil memproses ${data.imported} data sales toko!`,
      data: {
        fileName: req.file.originalname,
        periods: guard.periodPolicy?.periods || [],
        imported: data.imported
      }
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
  }
};

module.exports = {
  createPeriod,
  getAllPeriods,
  generateMonthlySnapshot,
  uploadAttendance,
  uploadActualLabourCost,
  uploadSales,
  getSummary,
  uploadAttendanceUniversal,
  uploadSalesUniversal,
  getAttendance,
  getSales,
  getAttendanceAggregate,
  getAllSales,
  getAllAttendance,
  getActiveStorePerformance,
  getStorePerformanceByPeriod
};