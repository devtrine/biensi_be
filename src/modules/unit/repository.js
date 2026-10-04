const prisma = require('../../config/database');

const findAllUnits = async (searchQuery = '') => {
  return await prisma.unit.findMany({
    where: searchQuery ? {
      OR: [
        { code: { contains: searchQuery, mode: 'insensitive' } },
        { name: { contains: searchQuery, mode: 'insensitive' } }
      ]
    } : {},
    include: { department: true }, // Tarik data Departemen sekalian
    orderBy: { name: 'asc' }
  });
};

const findUnitById = async (id) => {
  return await prisma.unit.findUnique({ 
    where: { id: parseInt(id, 10) },
    include: { department: true }
  });
};

const findUnitByCode = async (code) => {
  return await prisma.unit.findUnique({ where: { code } });
};

const createUnit = async (data) => {
  return await prisma.unit.create({
    data: {
      code: data.code,
      name: data.name,
      departmentId: parseInt(data.departmentId, 10)
    }
  });
};

const updateUnit = async (id, data) => {
  const updateData = { ...data };
  if (data.departmentId) updateData.departmentId = parseInt(data.departmentId, 10);

  return await prisma.unit.update({
    where: { id: parseInt(id, 10) },
    data: updateData
  });
};

const deleteUnit = async (id) => {
  return await prisma.unit.delete({ where: { id: parseInt(id, 10) } });
};

module.exports = {
  findAllUnits, findUnitById, findUnitByCode,
  createUnit, updateUnit, deleteUnit
};