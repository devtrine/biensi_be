const fs = require('fs');
const service = require('./service');
const { runDryRunOrGuard } = require('../../utils/importValidator');
const { IMPORT_MODULES, logImportBatch } = require('../../utils/importBatchHelper');

const getAllMovements = async (req, res) => {
  try {
    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      movementType: req.query.movementType
    };
    const result = await service.getAllMovements(filters);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getMovementById = async (req, res) => {
  try {
    const data = await service.getMovementById(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const createMovement = async (req, res) => {
  try {
    const data = await service.createMovement(req.body);
    res.status(201).json({ success: true, message: 'Data turnover manual berhasil dicatat', data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteMovement = async (req, res) => {
  try {
    await service.deleteMovement(req.params.id);
    res.status(200).json({ success: true, message: 'Data turnover berhasil dihapus' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const uploadBulkMovement = async (req, res) => {
  const startedAt = new Date();
  try {
    if (!req.file) throw new Error('File Excel turnover wajib diunggah!');

    const guard = await runDryRunOrGuard(req, res, 'movement');
    if (guard.handled) return;

    const result = await service.importBulkMovement(req.file.path);
    if (!result) throw new Error('Gagal memproses data, respons kosong dari server.');

    const totalRows = guard.validation?.summary?.totalRows || (result.sukses + result.gagal);
    await logImportBatch({
      module: IMPORT_MODULES.MOVEMENT,
      periods: guard.periodPolicy?.periods || [],
      fileName: req.file.originalname,
      totalRows,
      successRows: result.sukses || 0,
      failedRows: result.gagal || 0,
      startedAt
    });

    res.status(201).json({
      success: true,
      message: `Import Selesai! Sukses: ${result.sukses}, Gagal: ${result.gagal}`,
      data: {
        fileName: req.file.originalname,
        periods: guard.periodPolicy?.periods || [],
        sukses: result.sukses,
        gagal: result.gagal
      },
      errors: result.errorList
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
  }
};

const getTurnoverDashboard = async (req, res) => {
  try {
    const currentDate = new Date();
    const defaultYear = currentDate.getFullYear();
    const defaultMonth = currentDate.getMonth() + 1;

    const year = parseInt(req.query.year) || defaultYear;
    const month = parseInt(req.query.month) || defaultMonth;

    const result = await service.getTurnoverDashboard(year, month);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getTurnoverDashboard:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data dashboard turnover',
      error: error.message
    });
  }
};

module.exports = {
  getAllMovements,
  getMovementById,
  createMovement,
  deleteMovement,
  uploadBulkMovement,
  getTurnoverDashboard
};