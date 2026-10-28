const service = require('./service');
const fs = require('fs');

const importCompliance = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel Kepatuhan tidak ditemukan." });
    }

    const result = await service.importComplianceData(req.file.path);
    
    res.status(200).json({
      success: true,
      message: `Import Kepatuhan Selesai! Berhasil memproses data dari ${result.successCount} toko.`,
      errors: result.errors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
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

module.exports = { importCompliance, getDashboardOverview };
