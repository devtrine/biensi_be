const repository = require('./repository');

const getAllDivisions = async (searchQuery) => {
  return await repository.findAllDivisions(searchQuery);
};

const getDivisionById = async (id) => {
  const division = await repository.findDivisionById(id);
  if (!division) throw new Error('Divisi tidak ditemukan');
  return division;
};

const createDivision = async (divisionData) => {
  const existing = await repository.findDivisionByCode(divisionData.code);
  if (existing) throw new Error('Kode divisi sudah terdaftar');
  
  return await repository.createDivision(divisionData);
};

const updateDivision = async (id, divisionData) => {
  const existing = await repository.findDivisionById(id);
  if (!existing) throw new Error('Divisi tidak ditemukan');

  if (divisionData.code && divisionData.code !== existing.code) {
    const codeTaken = await repository.findDivisionByCode(divisionData.code);
    if (codeTaken) throw new Error('Kode divisi sudah digunakan oleh divisi lain');
  }

  return await repository.updateDivision(id, divisionData);
};

const deleteDivision = async (id) => {
  const existing = await repository.findDivisionById(id);
  if (!existing) throw new Error('Divisi tidak ditemukan');
  
  // Note: Jika divisi punya departemen/karyawan, Prisma otomatis akan 
  // melempar error Foreign Key Constraint saat di-delete. Ini bagus untuk proteksi data.
  await repository.deleteDivision(id);
  return true;
};

module.exports = {
  getAllDivisions,
  getDivisionById,
  createDivision,
  updateDivision,
  deleteDivision
};