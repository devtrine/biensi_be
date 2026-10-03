const prisma = require('../../config/database');

const findAllDivisions = async (searchQuery = '') => {
  return await prisma.division.findMany({
    where: searchQuery ? {
      OR: [
        { code: { contains: searchQuery, mode: 'insensitive' } },
        { name: { contains: searchQuery, mode: 'insensitive' } }
      ]
    } : {},
    orderBy: { name: 'asc' }
  });
};

const findDivisionById = async (id) => {
  return await prisma.division.findUnique({ where: { id: parseInt(id, 10) } });
};

const findDivisionByCode = async (code) => {
  return await prisma.division.findUnique({ where: { code } });
};

const createDivision = async (data) => {
  return await prisma.division.create({ data });
};

const updateDivision = async (id, data) => {
  return await prisma.division.update({
    where: { id: parseInt(id, 10) },
    data
  });
};

const deleteDivision = async (id) => {
  return await prisma.division.delete({
    where: { id: parseInt(id, 10) }
  });
};

module.exports = {
  findAllDivisions,
  findDivisionById,
  findDivisionByCode,
  createDivision,
  updateDivision,
  deleteDivision
};