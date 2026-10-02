const service = require('./service');

const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email dan password wajib diisi' }
      });
    }

    const result = await service.login(email, password);

    return res.status(200).json({
      success: true,
      data: result,
      meta: {}
    });

  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: error.message }
    });
  }
};

module.exports = {
  loginController
};