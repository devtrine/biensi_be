const { getDashboardData } = require('./repository');
const service = require('./service');
const fs = require('fs');

// === 1. IMPORT BULK SP (TOKO & HO) ===
const importBulkSP = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel tidak ditemukan. Gunakan form-data dengan key 'file'." });
    }

    const result = await service.importBulkSP(req.file.path);
    
    // Hapus file sementara setelah diproses
    // fs.unlinkSync(req.file.path);

    res.status(200).json({
      success: true,
      message: `Import SP Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      errors: result.errors
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); // Hapus file jika terjadi error
    res.status(500).json({ success: false, message: error.message });
  }
};

// === 2. IMPORT BULK FRAUD ===
const importBulkFraud = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel tidak ditemukan. Gunakan form-data dengan key 'file'." });
    }

    const result = await service.importBulkFraud(req.file.path);
    
    // Hapus file sementara setelah diproses
    // fs.unlinkSync(req.file.path);

    res.status(200).json({
      success: true,
      message: `Import Fraud Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      errors: result.errors
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
  }
};

const importBulkBipartit = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel Bipartit tidak ditemukan." });
    }

    const result = await service.importBulkBipartit(req.file.path);
    // fs.unlinkSync(req.file.path); // Bersihkan file bekas

    res.status(200).json({
      success: true,
      message: `Import Bipartit Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
      errors: result.errors
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === 3. GET ALL CASES ===
const getAllCases = async (req, res) => {
  try {
    const filters = req.query; // Ambil filter dari query params jika ada
    const data = await service.getAllCases(filters);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// === 4. GET CASE BY ID ===
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

// === 5. DELETE CASE ===
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

module.exports = { importBulkSP, importBulkFraud, getAllCases, getCaseById, deleteCase, getDashboardOverview, importBulkBipartit };