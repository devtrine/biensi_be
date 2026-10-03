const prisma = require('../../config/database');

const findAllPositions = async (search = '') => {
  return await prisma.position.findMany({
    where: search ? {
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { employeeLevel: { contains: search, mode: 'insensitive' } } // Bisa di-search via level
      ]
    } : {},
    orderBy: { name: 'asc' }
  });
};

const findPositionById = async (id) => prisma.position.findUnique({ where: { id: parseInt(id, 10) } });
const findPositionByCode = async (code) => prisma.position.findUnique({ where: { code } });
const createPosition = async (data) => prisma.position.create({ data });
const updatePosition = async (id, data) => prisma.position.update({ where: { id: parseInt(id, 10) }, data });
const deletePosition = async (id) => prisma.position.delete({ where: { id: parseInt(id, 10) } });

module.exports = { findAllPositions, findPositionById, findPositionByCode, createPosition, updatePosition, deletePosition };