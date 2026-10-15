const service = require('./service');

const getSummary = async (req, res) => {
  try {
    // Tangkap filter utama sesuai UI
    const filters = {
      year: req.query.year,
      month: req.query.month, // Opsional: jika Frontend ingin spesifik per bulan
      scope: req.query.scope  // Corporate, HQ, atau Store
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