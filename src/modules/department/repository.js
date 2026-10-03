const prisma = require('../../config/database');

const findAllDepartments = async (searchQuery = '') => {
  return await prisma.department.findMany({
    where: searchQuery ? {
      OR: [
        { code: { contains: searchQuery, mode: 'insensitive' } },
        { name: { contains: searchQuery, mode: 'insensitive' } }
      ]
    } : {},
    include: { division: true }, // Menampilkan data divisi induknya
    orderBy: { name: 'asc' }
  });
};

const findDepartmentById = async (id) => {
  return await prisma.department.findUnique({ 
    where: { id: parseInt(id, 10) },
    include: { division: true }
  });
};

const findDepartmentByCode = async (code) => {
  return await prisma.department.findUnique({ where: { code } });
};

const createDepartment = async (data) => {
  return await prisma.department.create({
    data: {
      code: data.code,
      name: data.name,
      divisionId: parseInt(data.divisionId, 10)
    }
  });
};

const updateDepartment = async (id, data) => {
  const updateData = { ...data };
  if (data.divisionId) updateData.divisionId = parseInt(data.divisionId, 10);

  return await prisma.department.update({
    where: { id: parseInt(id, 10) },
    data: updateData
  });
};

const deleteDepartment = async (id) => {
  return await prisma.department.delete({ where: { id: parseInt(id, 10) } });
};

module.exports = {
  findAllDepartments, findDepartmentById, findDepartmentByCode,
  createDepartment, updateDepartment, deleteDepartment
};