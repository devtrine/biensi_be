const service = require('./service');

// Format standar controller CRUD
const getDepartments = async (req, res) => {
  try {
    const data = await service.getAllDepartments(req.query.search);
    res.status(200).json({ success: true, data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const getDepartmentById = async (req, res) => {
  try {
    const data = await service.getDepartmentById(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) { res.status(404).json({ success: false, message: error.message }); }
};

const createDepartment = async (req, res) => {
  try {
    const data = await service.createDepartment(req.body);
    res.status(201).json({ success: true, message: "Departemen berhasil ditambahkan", data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const updateDepartment = async (req, res) => {
  try {
    const data = await service.updateDepartment(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Departemen berhasil diupdate", data });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const deleteDepartment = async (req, res) => {
  try {
    await service.deleteDepartment(req.params.id);
    res.status(200).json({ success: true, message: "Departemen berhasil dihapus" });
  } catch (error) {
    if (error.code === 'P2003') return res.status(400).json({ success: false, message: "Gagal menghapus: Departemen masih memiliki Karyawan." });
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { getDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment };