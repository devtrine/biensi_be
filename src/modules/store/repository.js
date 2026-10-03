const prisma = require('../../config/database');

// src/modules/store/repository.js
const findAllStores = async (filter = {}, searchQuery = '') => {
  return await prisma.store.findMany({
    where: {
      ...filter, 
      ...(searchQuery && {
        OR: [
          { storeCode: { contains: searchQuery, mode: 'insensitive' } },
          { storeName: { contains: searchQuery, mode: 'insensitive' } }
        ]
      })
    },
    select: {
      id: true,
      storeCode: true,
      storeName: true,
      region: true,
      area: true,
      isActive: true,
      closedAt: true
    },
    orderBy: { storeName: 'asc' }
  });
};

const findStoreByCode = async (storeCode) => {
  return await prisma.store.findUnique({ where: { storeCode } });
};

const findStoreById = async (id) => {
  return await prisma.store.findUnique({ where: { id } });
};

const createStore = async (storeData) => {
  return await prisma.store.create({ data: storeData });
};

const updateStore = async (id, storeData) => {
  return await prisma.store.update({
    where: { id },
    data: storeData
  });
};

const deactivateStore = async (id) => {
  return await prisma.store.update({
    where: { id },
    data: { isActive: false, closedAt: new Date() }
  });
};

const hardDeleteStore = async (id) => {
  return await prisma.store.delete({
    where: { id }
  });
};

module.exports = {
  findAllStores,
  findStoreByCode,
  findStoreById,
  createStore,
  updateStore,
  deactivateStore,
  hardDeleteStore
};