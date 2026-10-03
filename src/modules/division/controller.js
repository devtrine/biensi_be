const service = require('./service');

const getDivisionsController = async (req, res) => {
  try {
    const divisions = await service.getAllDivisions(req.query.search);
    res.status(200).json({ success: true, data: divisions });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getDivisionByIdController = async (req, res) => {
  try {
    const division = await service.getDivisionById(req.params.id);
    res.status(200).json({ success: true, data: division });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const createDivisionController = async (req, res) => {
  try {
    const division = await service.createDivision(req.body);
    res.status(201).json({ success: true, message: "Divisi berhasil ditambahkan", data: division });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateDivisionController = async (req, res) => {
  try {
    const division = await service.updateDivision(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Data divisi berhasil diupdate", data: division });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteDivisionController = async (req, res) => {
  try {
    await service.deleteDivision(req.params.id);
    res.status(200).json({ success: true, message: "Data divisi berhasil dihapus" });
  } catch (error) {
    // Tangkap error relasi Prisma (P2003)
    if (error.code === 'P2003') {
      return res.status(400).json({ success: false, message: "Gagal menghapus: Divisi ini masih digunakan oleh Departemen atau Karyawan." });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDivisionsController,
  getDivisionByIdController,
  createDivisionController,
  updateDivisionController,
  deleteDivisionController
};