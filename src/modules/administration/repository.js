const prisma = require('../../config/database');

const createUser = async (data) => {
  return await prisma.user.create({
    data: data,
    select: { id: true, name: true, email: true, roleId: true } // Jangan kembalikan password!
  });
};

const findUserById = async (id) => {
  return await prisma.user.findUnique({
    where: { id },
    include: { role: true }
  });
};

const updateUser = async (id, data) => {
  return await prisma.user.update({
    where: { id },
    data: data
  });
};

const findAllUsers = async () => {
  return await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: 'desc' }
  });
};

const findAllRoles = async () => {
  return await prisma.role.findMany({
    orderBy: { id: 'asc' }
  });
};

const updateRole = async (id, data) => {
  return await prisma.role.update({
    where: { id: parseInt(id) },
    data: data
  });
};

module.exports = {
  findUserById,
  updateUser,
  findAllUsers,
  findAllRoles,
  updateRole,
  createUser
};