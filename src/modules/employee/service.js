const repository = require('./repository');

const formatEmployeePayload = (data) => {
  const payload = { ...data };

  // Parsing Foreign Keys (Int atau null)
  if (data.divisionId !== undefined) payload.divisionId = data.divisionId ? parseInt(data.divisionId, 10) : null;
  if (data.departmentId !== undefined) payload.departmentId = data.departmentId ? parseInt(data.departmentId, 10) : null;
  if (data.unitId !== undefined) payload.unitId = data.unitId ? parseInt(data.unitId, 10) : null; // Relasi baru
  if (data.positionId !== undefined) payload.positionId = data.positionId ? parseInt(data.positionId, 10) : null;
  if (data.storeId !== undefined) payload.storeId = data.storeId ? parseInt(data.storeId, 10) : null; // Asumsi storeId Int

  // Parsing Dates
  if (data.birthDate) payload.birthDate = new Date(data.birthDate);
  if (data.joinDate) payload.joinDate = new Date(data.joinDate);
  if (data.endDate) payload.endDate = new Date(data.endDate);
  
  // Parsing Booleans
  if (data.bpjsKetenagakerjaan !== undefined) payload.bpjsKetenagakerjaan = Boolean(data.bpjsKetenagakerjaan);
  if (data.bpjsKesehatan !== undefined) payload.bpjsKesehatan = Boolean(data.bpjsKesehatan);
  if (data.baseSalary !== undefined) {
    payload.baseSalary = data.baseSalary ? parseFloat(data.baseSalary) : null;
  }
  return payload;
};

const getAllEmployees = async (search) => await repository.findAllEmployees(search);

const getEmployeeById = async (id) => {
  const employee = await repository.findEmployeeById(id);
  if (!employee) throw new Error('Karyawan tidak ditemukan');
  return employee;
};

const createEmployee = async (data) => {
  if (!data.employeeNo || !data.fullName || !data.joinDate) {
    throw new Error('NIK (employeeNo), Nama (fullName), dan joinDate wajib diisi');
  }

  const existing = await repository.findEmployeeByNo(data.employeeNo);
  if (existing) throw new Error('NIK Karyawan sudah terdaftar');

  return await repository.createEmployee(formatEmployeePayload(data));
};

const updateEmployee = async (id, data) => {
  const existing = await getEmployeeById(id);

  if (data.employeeNo && data.employeeNo !== existing.employeeNo) {
    const noTaken = await repository.findEmployeeByNo(data.employeeNo);
    if (noTaken) throw new Error('NIK Karyawan sudah digunakan oleh orang lain');
  }

  return await repository.updateEmployee(id, formatEmployeePayload(data));
};

const deleteEmployee = async (id) => {
  await getEmployeeById(id);
  await repository.deleteEmployee(id);
  return true;
};

module.exports = { getAllEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee };