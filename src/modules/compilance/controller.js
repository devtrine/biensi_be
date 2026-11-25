const fs = require('fs');
const service = require('./service');
const { runDryRunOrGuard } = require('../../utils/importValidator');
const { IMPORT_MODULES, logImportBatch } = require('../../utils/importBatch');

const importCompliance = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File Excel Kepatuhan tidak ditemukan.' });
    }

    const guard = await runDryRunOrGuard(req, res, 'compliance');
    if (guard.handled) return;

    const result = await service.importComplianceData(req.file.path);

    const totalRows = guard.validation?.summary?.totalRows || (result.successCount + result.failCount);
    await logImportBatch({
      module: IMPORT_MODULES.COMPLIANCE,
      periods: guard.periodPolicy?.periods || [],
      fileName: req.file.originalname,
      totalRows,
      successRows: result.successCount || 0,
      failedRows: result.failCount || 0,
      startedAt
    });

    res.status(200).json({
      success: true,
      message: `Import Kepatuhan Selesai! Sukses: ${result.successCount}, Gagal: ${result.failCount}`,
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