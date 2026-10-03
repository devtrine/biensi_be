const service = require('./service');

const getPositions = async (req, res) => {
  try { res.status(200).json({ success: true, data: await service.getAllPositions(req.query.search) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const getPositionById = async (req, res) => {
  try { res.status(200).json({ success: true, data: await service.getPositionById(req.params.id) }); } 
  catch (error) { res.status(404).json({ success: false, message: error.message }); }
};

const createPosition = async (req, res) => {
  try { res.status(201).json({ success: true, message: "Jabatan ditambahkan", data: await service.createPosition(req.body) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const updatePosition = async (req, res) => {
  try { res.status(200).json({ success: true, message: "Jabatan diupdate", data: await service.updatePosition(req.params.id, req.body) }); } 
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
};

const deletePosition = async (req, res) => {
  try { 
    await service.deletePosition(req.params.id);
    res.status(200).json({ success: true, message: "Jabatan dihapus" });
  } catch (error) {
    if (error.code === 'P2003') return res.status(400).json({ success: false, message: "Gagal menghapus: Jabatan masih terikat dengan karyawan." });
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { getPositions, getPositionById, createPosition, updatePosition, deletePosition };