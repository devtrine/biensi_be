const fs = require('fs');
const service = require('./service');
const { runDryRunOrGuard } = require('../../utils/importValidator');
const { IMPORT_MODULES, logImportBatch, summarizeDetectedPeriods } = require('../../utils/importBatch');

const cleanupTempFile = (req) => {
  if (req.file && fs.existsSync(req.file.path)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }
};

const getAllProduction = async (req, res) => {
  try {
    const data = await service.getAllProduction({ year: req.query.year });
    return res.status(200).json({
      success: true,
      message: 'Data realisasi produksi berhasil dimuat',
      data
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
};

const getProductionById = async (req, res) => {
  try {
    const data = await service.getProductionById(req.params.id);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(error.statusCode || 404).json({
      success: false,
      message: error.message
    });
  }
};

const createProduction = async (req, res) => {
  try {
    const data = await service.createOrUpsertProduction(req.body);
    return res.status(201).json({
      success: true,
      message: 'Data realisasi produksi berhasil disimpan',
      data
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message
    });
  }
};

const updateProduction = async (req, res) => {
  try {
    const data = await service.updateProduction(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Data realisasi produksi berhasil diperbarui',
      data
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message
    });
  }
};

const deleteProduction = async (req, res) => {
  try {
    await service.deleteProduction(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Data realisasi produksi berhasil dihapus'
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message
    });
  }
};

const importProduction = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File Excel produksi wajib diunggah. Gunakan form-data dengan key 'file'."
      });
    }

    const guard = await runDryRunOrGuard(req, res, 'production');
    if (guard.handled) return;

    const result = await service.importProductionExcel(guard.workbook || req.file.path);
    const periods = guard.periodPolicy?.periods?.length
      ? guard.periodPolicy.periods
      : summarizeDetectedPeriods(
          result.parsedRows.map(r => r.periodKey),
          result.parsedRows
        );

    await logImportBatch({
      module: IMPORT_MODULES.PRODUCTION,
      periods,
      fileName: req.file.originalname,
      totalRows: result.imported,
      successRows: result.imported,
      failedRows: 0,
      startedAt
    });

    return res.status(201).json({
      success: true,
      message: `Berhasil mengimpor ${result.imported} periode data realisasi produksi!`,
      data: {
        fileName: req.file.originalname,
        imported: result.imported,
        periods,
        items: result.items
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      errors: error.details || undefined
    });
  } finally {
    cleanupTempFile(req);
  }
};

const downloadTemplate = async (req, res) => {
  try {
    const buffer = service.generateTemplateWorkbookBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Template_Realisasi_Produksi.xlsx"'
    );
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat file template Excel produksi.'
    });
  }
};

module.exports = {
  getAllProduction,
  getProductionById,
  createProduction,
  updateProduction,
  deleteProduction,
  importProduction,
  downloadTemplate
};
