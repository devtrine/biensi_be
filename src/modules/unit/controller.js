const service = require('./service');

const getUnits = async (req, res) => {
  try { res.status(200).json({ success: true, data: await service.getAllUnits(req.query.search) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const getUnitById = async (req, res) => {
  try { res.status(200).json({ success: true, data: await service.getUnitById(req.params.id) }); } 
  catch (error) { res.status(404).json({ success: false, message: error.message }); }
};

const createUnit = async (req, res) => {
  try { res.status(201).json({ success: true, message: "Unit berhasil ditambahkan", data: await service.createUnit(req.body) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const updateUnit = async (req, res) => {
  try { res.status(200).json({ success: true, message: "Unit berhasil diupdate", data: await service.updateUnit(req.params.id, req.body) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const deleteUnit = async (req, res) => {
  try { 
    await service.deleteUnit(req.params.id);
    res.status(200).json({ success: true, message: "Unit berhasil dihapus" });
  } catch (error) {
    if (error.code === 'P2003') return res.status(400).json({ success: false, message: "Gagal menghapus: Unit masih memiliki Karyawan." });
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { getUnits, getUnitById, createUnit, updateUnit, deleteUnit };