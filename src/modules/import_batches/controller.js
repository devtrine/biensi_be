const importBatchService = require('./service');

const getYearlyStatus = async (req, res) => {
  try {
    const data = await importBatchService.getYearlyStatus(req.query.module, req.query.year);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
};

const getImportHistory = async (req, res) => {
  try {
    const data = await importBatchService.getImportHistory({
      module: req.query.module,
      year: req.query.year,
      limit: req.query.limit
    });
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getYearlyStatus,
  getImportHistory
};