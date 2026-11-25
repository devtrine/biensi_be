const fs = require('fs');
const { getDashboardData } = require('./repository');
const service = require('./service');
const { runDryRunOrGuard } = require('../../utils/importValidator');
const { IMPORT_MODULES, logImportBatch } = require('../../utils/importBatchHelper');

const cleanupTempFile = (req) => {
  if (req.file && fs.existsSync(req.file.path)) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
  }
};

// === 1. IMPORT BULK SP (TOKO & HO) ===
const importBulkSP = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel tidak ditemukan. Gunakan form-data dengan key 'file'." });
    }

    const guard = await runDryRunOrGuard(req, res, 'sp');
    if (guard.handled) return;

    const result = await service.importBulkSP(req.file.path);
    const totalRows = guard.validation?.summary?.totalRows || (result.successCount + result.failCount);

    await logImportBatch({
      module: IMPORT_MODULES.SP,
      periods: guard.periodPolicy?.periods || [],
      fileName: req.file.originalname,
      totalRows,
      successRows: result.successCount || 0,
      failedRows: result.failCount || 0,
      startedAt
    });

    res.status(200).json({
      success: true,
      message: `Import SP Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      data: {
        fileName: req.file.originalname,
        periods: guard.periodPolicy?.periods || [],
        successCount: result.successCount,
        failCount: result.failCount
      },
      errors: result.errors
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  } finally {
    cleanupTempFile(req);
  }
};

// === 2. IMPORT BULK FRAUD ===
const importBulkFraud = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel tidak ditemukan. Gunakan form-data dengan key 'file'." });
    }

    const guard = await runDryRunOrGuard(req, res, 'fraud');
    if (guard.handled) return;

    const result = await service.importBulkFraud(req.file.path);
    const totalRows = guard.validation?.summary?.totalRows || (result.successCount + result.failCount);

    await logImportBatch({
      module: IMPORT_MODULES.FRAUD,
      periods: guard.periodPolicy?.periods || [],
      fileName: req.file.originalname,
      totalRows,
      successRows: result.successCount || 0,
      failedRows: result.failCount || 0,
      startedAt
    });

    res.status(200).json({
      success: true,
      message: `Import Fraud Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      data: {
        fileName: req.file.originalname,
        periods: guard.periodPolicy?.periods || [],
        successCount: result.successCount,
        failCount: result.failCount
      },
      errors: result.errors
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  } finally {
    cleanupTempFile(req);
  }
};

// === 3. IMPORT BULK BIPARTIT ===
const importBulkBipartit = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File Excel Bipartit tidak ditemukan.' });
    }

    const guard = await runDryRunOrGuard(req, res, 'bipartit');
    if (guard.handled) return;

    const result = await service.importBulkBipartit(req.file.path);
    const totalRows = guard.validation?.summary?.totalRows || (result.successCount + result.failCount);

    await logImportBatch({
      module: IMPORT_MODULES.BIPARTIT,
      periods: guard.periodPolicy?.periods || [],
      fileName: req.file.originalname,
      totalRows,
      successRows: result.successCount || 0,
      failedRows: result.failCount || 0,
      startedAt
    });

    res.status(200).json({
      success: true,
      message: `Import Bipartit Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      data: {
        fileName: req.file.originalname,
        periods: guard.periodPolicy?.periods || [],
        successCount: result.successCount,
        failCount: result.failCount
      },
      errors: result.errors
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  } finally {
    cleanupTempFile(req);
  }
};

// === 4. IMPORT REKAP SP TOKO ===
const importSpTokoRekap = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File Excel wajib diunggah.' });
    }

    const guard = await runDryRunOrGuard(req, res, 'sp-rekap');
    if (guard.handled) return;

    const result = await service.importSpTokoRekap(req.file.path);
    const totalRows = guard.validation?.summary?.totalRows || result.imported || 0;

    await logImportBatch({
      module: IMPORT_MODULES.SP_REKAP,
      periods: guard.periodPolicy?.periods || [],
      fileName: req.file.originalname,
      totalRows,
      successRows: result.imported || totalRows,
      failedRows: 0,
      startedAt
    });

    return res.status(200).json({
      success: true,
      message: `Rekap SP Toko berhasil diimpor (${result.imported} periode bulan).`,
      data: {
        ...result,
        fileName: req.file.originalname,
        periods: guard.periodPolicy?.periods || []
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  } finally {
    cleanupTempFile(req);
  }
};

const getSpTokoRekap = async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const data = await service.getSpTokoRekap(year);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAllCases = async (req, res) => {
  try {
    const filters = req.query;
    const data = await service.getAllCases(filters);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await service.getCaseById(id);
    if (!data) return res.status(404).json({ success: false, message: 'Data kasus tidak ditemukan' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteCase = async (req, res) => {
  try {
    const { id } = req.params;
    await service.deleteCase(id);
    res.status(200).json({ success: true, message: 'Data kasus berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDashboardOverview = async (req, res) => {
  try {
    const data = await service.getDashboardData();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  importBulkSP,
  importBulkFraud,
  getAllCases,
  getCaseById,
  deleteCase,
  getDashboardOverview,
  importBulkBipartit,
  importSpTokoRekap,
  getSpTokoRekap
};