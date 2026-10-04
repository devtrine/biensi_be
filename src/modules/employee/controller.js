const service = require('./service');

const getEmployees = async (req, res) => {
  try { res.status(200).json({ success: true, data: await service.getAllEmployees(req.query.search) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const getEmployeeById = async (req, res) => {
  try { res.status(200).json({ success: true, data: await service.getEmployeeById(req.params.id) }); } 
  catch (error) { res.status(404).json({ success: false, message: error.message }); }
};

const createEmployee = async (req, res) => {
  try { res.status(201).json({ success: true, message: "Karyawan ditambahkan", data: await service.createEmployee(req.body) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const updateEmployee = async (req, res) => {
  try { res.status(200).json({ success: true, message: "Data karyawan diupdate", data: await service.updateEmployee(req.params.id, req.body) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const deleteEmployee = async (req, res) => {
  try { 
    await service.deleteEmployee(req.params.id);
    res.status(200).json({ success: true, message: "Data karyawan dihapus" });
  } catch (error) {
    if (error.code === 'P2003') return res.status(400).json({ success: false, message: "Gagal menghapus: Karyawan memiliki data transaksi aktif." });
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee };