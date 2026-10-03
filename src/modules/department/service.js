const repository = require('./repository');

const getAllDepartments = async (search) => await repository.findAllDepartments(search);

const getDepartmentById = async (id) => {
  const dept = await repository.findDepartmentById(id);
  if (!dept) throw new Error('Departemen tidak ditemukan');
  return dept;
};

const createDepartment = async (data) => {
  if (!data.divisionId) throw new Error('divisionId wajib diisi');
  const existing = await repository.findDepartmentByCode(data.code);
  if (existing) throw new Error('Kode departemen sudah terdaftar');
  return await repository.createDepartment(data);
};

const updateDepartment = async (id, data) => {
  const existing = await getDepartmentById(id);
  if (data.code && data.code !== existing.code) {
    const codeTaken = await repository.findDepartmentByCode(data.code);
    if (codeTaken) throw new Error('Kode departemen sudah digunakan');
  }
  return await repository.updateDepartment(id, data);
};

const deleteDepartment = async (id) => {
  await getDepartmentById(id);
  await repository.deleteDepartment(id);
  return true;
};

module.exports = { getAllDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment };