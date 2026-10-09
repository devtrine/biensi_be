const service = require('./service');

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
  try {
    if (!req.file) throw new Error("File Excel turnover wajib diunggah!");
    
    // Panggil service dan tangkap return-nya
    const result = await service.importBulkMovement(req.file.path);
    
    // Pastikan result tidak undefined (Solusi Error 2)
    if (!result) throw new Error("Gagal memproses data, respons kosong dari server.");

    res.status(201).json({ 
      success: true, 
      message: `Import Selesai! Sukses: ${result.sukses}, Gagal: ${result.gagal}`,
      errors: result.errorList 
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { 
  getAllMovements, 
  getMovementById, 
  createMovement, 
  deleteMovement, 
  uploadBulkMovement 
};