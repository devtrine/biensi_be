const service = require('./service');
const importService = require('./import');
const fs = require('fs');

const getEmployees = async (req, res) => {
  try { 
    res.status(200).json({ 
      success: true, 
      data: await service.getAllEmployees(req.query.search, req.query.status) 
    }); 
  } 
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
    res.status(200).json({ success: true, message: "Data karyawan dinonaktifkan (Soft Delete)" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const importEmployees = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File Excel tidak ditemukan" });
    }

    const result = await importService.processExcelImport(req.file.path);

    res.status(200).json({
      success: true,
      message: `Import selesai. Sukses: ${result.sukses}, Gagal: ${result.gagal}`,
      errors: result.errorList
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    // Hapus file sementara setelah selesai diproses agar disk tidak penuh
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
  }
};

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  importEmployees
};
