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
const logoutController = async (req, res) => {
  try {
    await service.logout(req.user.id);
    return res.status(200).json({
      success: true,
      message: 'Logout berhasil. Silakan hapus token di sisi klien.'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    });
  }
};

module.exports = {
  loginController, logoutController
};