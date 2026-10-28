const service = require('./service');
const fs = require('fs');

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
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
  }
};

const getTurnoverDashboard = async (req, res) => {
  try {
    // 1. Ambil waktu saat ini sebagai default (Fallback)
    const currentDate = new Date();
    const defaultYear = currentDate.getFullYear();
    const defaultMonth = currentDate.getMonth() + 1;
    
    // 2. Tangkap parameter dari URL query (?year=2026&month=12)
    const year = parseInt(req.query.year) || defaultYear;
    const month = parseInt(req.query.month) || defaultMonth;

    // 3. Panggil Service
    const result = await service.getTurnoverDashboard(year, month);

    // 4. Kirim Response ke Frontend
    res.status(200).json(result);
  } catch (error) {
    console.error("Error getTurnoverDashboard:", error.message);
    res.status(500).json({ 
      success: false, 
      message: "Gagal mengambil data dashboard turnover",
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
