const { getDashboardData } = require('./repository');
const service = require('./service');
const { runDryRunOrGuard } = require('../../utils/importValidator');
const fs = require('fs');

const cleanupTempFile = (req) => {
  if (req.file && fs.existsSync(req.file.path)) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
  }
};

// === 1. IMPORT BULK SP (TOKO & HO) ===
const importBulkSP = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel tidak ditemukan. Gunakan form-data dengan key 'file'." });
    }

    const guard = await runDryRunOrGuard(req, res, 'sp');
    if (guard.handled) return;

    const result = await service.importBulkSP(req.file.path);
    res.status(200).json({
      success: true,
      message: `Import SP Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      errors: result.errors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    cleanupTempFile(req);
  }
};

// === 2. IMPORT BULK FRAUD ===
const importBulkFraud = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel tidak ditemukan. Gunakan form-data dengan key 'file'." });
    }

    const guard = await runDryRunOrGuard(req, res, 'fraud');
    if (guard.handled) return;

    const result = await service.importBulkFraud(req.file.path);
    res.status(200).json({
      success: true,
      message: `Import Fraud Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      errors: result.errors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    cleanupTempFile(req);
  }
};

const importBulkBipartit = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel Bipartit tidak ditemukan." });
    }

    const guard = await runDryRunOrGuard(req, res, 'bipartit');
    if (guard.handled) return;

    const result = await service.importBulkBipartit(req.file.path);
    res.status(200).json({
      success: true,
      message: `Import Bipartit Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      errors: result.errors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    cleanupTempFile(req);
  }
};

const importSpTokoRekap = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File Excel wajib diunggah.' });
    }

    const guard = await runDryRunOrGuard(req, res, 'sp-rekap');
    if (guard.handled) return;

    const result = await service.importSpTokoRekap(req.file.path);
    return res.status(200).json({
      success: true,
      message: `Rekap SP Toko berhasil diimpor (${result.imported} periode bulan).`,
      data: result
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    cleanupTempFile(req);
  }
};

const getSpTokoRekap = async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const data = await service.getSpTokoRekap(year);
    return res.status(200).json({
      success: true,
      data
    });
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
    if (!data) return res.status(404).json({ success: false, message: "Data kasus tidak ditemukan" });
    
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteCase = async (req, res) => {
  try {
    const { id } = req.params;
    await service.deleteCase(id);
    res.status(200).json({ success: true, message: "Data kasus berhasil dihapus" });
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

module.exports = { importBulkSP, importBulkFraud, getAllCases, getCaseById, deleteCase, getDashboardOverview, importBulkBipartit, importSpTokoRekap, getSpTokoRekap };