const repository = require('./repository');

const getAllPositions = async (search) => await repository.findAllPositions(search);

const getPositionById = async (id) => {
  const position = await repository.findPositionById(id);
  if (!position) throw new Error('Jabatan tidak ditemukan');
  return position;
};

const createPosition = async (data) => {
  const existing = await repository.findPositionByCode(data.code);
  if (existing) throw new Error('Kode jabatan sudah terdaftar');
  return await repository.createPosition(data);
};

const updatePosition = async (id, data) => {
  const existing = await getPositionById(id);
  if (data.code && data.code !== existing.code) {
    const codeTaken = await repository.findPositionByCode(data.code);
    if (codeTaken) throw new Error('Kode jabatan sudah digunakan');
  }
  return await repository.updatePosition(id, data);
};

const deletePosition = async (id) => {
  await getPositionById(id);
  await repository.deletePosition(id);
  return true;
};

module.exports = { getAllPositions, getPositionById, createPosition, updatePosition, deletePosition };