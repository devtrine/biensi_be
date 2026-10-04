const repository = require('./repository');

const getAllUnits = async (search) => await repository.findAllUnits(search);

const getUnitById = async (id) => {
  const unit = await repository.findUnitById(id);
  if (!unit) throw new Error('Unit tidak ditemukan');
  return unit;
};

const createUnit = async (data) => {
  if (!data.departmentId) throw new Error('departmentId wajib diisi');
  const existing = await repository.findUnitByCode(data.code);
  if (existing) throw new Error('Kode Unit sudah terdaftar');
  return await repository.createUnit(data);
};

const updateUnit = async (id, data) => {
  const existing = await getUnitById(id);
  if (data.code && data.code !== existing.code) {
    const codeTaken = await repository.findUnitByCode(data.code);
    if (codeTaken) throw new Error('Kode Unit sudah digunakan');
  }
  return await repository.updateUnit(id, data);
};

const deleteUnit = async (id) => {
  await getUnitById(id);
  await repository.deleteUnit(id);
  return true;
};

module.exports = { getAllUnits, getUnitById, createUnit, updateUnit, deleteUnit };