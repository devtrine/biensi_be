const service = require('./service');

const getSummary = async (req, res) => {
  try {
    // filter buat FE
    const filters = {
      year: req.query.year,
      month: req.query.month, 
      scope: req.query.scope  
    };

    const data = await service.getMainExecutiveDashboard(filters);

    res.status(200).json({
      success: true,
      message: 'Executive Dashboard berhasil dimuat',
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getSummary
};