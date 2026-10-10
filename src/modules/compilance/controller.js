const service = require('./service');
const fs = require('fs');

// === 1. IMPORT DATA KEPATUHAN (EXCEL) ===
const importCompliance = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel Kepatuhan tidak ditemukan." });
    }

    const result = await service.importComplianceData(req.file.path);
    
    // File sengaja TIDAK dihapus (fs.unlinkSync) agar bisa dipakai untuk Import History
    
    res.status(200).json({
      success: true,
      message: `Import Kepatuhan Selesai! Berhasil memproses data dari ${result.successCount} toko.`,
      errors: result.errors,
    //   filePath: req.file.path 
    });
  } catch (error) {
    // Jika format salah/error fatal, baru file dihapus
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
  }
};

// === 2. GET DASHBOARD DATA (UNTUK UI) ===
const getDashboardOverview = async (req, res) => {
  try {
    const data = await service.getDashboardData();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { importCompliance, getDashboardOverview };