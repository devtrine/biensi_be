const repository = require('./repository');

const getStores = async (isActive, searchQuery) => {
  const filter = {};
  if (isActive !== undefined) {
    filter.isActive = isActive;
  }
  return await repository.findAllStores(filter, searchQuery);
};

const getInactiveStores = async (searchQuery = '') => {
  return await repository.findAllStores({ isActive: false }, searchQuery);
};

const getStoreById = async (id) => {
  const store = await repository.findStoreById(id);
  if (!store) {
    throw new Error('Toko tidak ditemukan.');
  }
  return store;
};

const createNewStore = async (data) => {
  const existingStore = await repository.findStoreByCode(data.storeCode);
  if (existingStore) {
    throw new Error(`Toko dengan kode ${data.storeCode} sudah terdaftar.`);
  }
  return await repository.createStore(data);
};

const updateExistingStore = async (id, data) => {
  await getStoreById(id);

  if (data.storeCode) {
    const existingStore = await repository.findStoreByCode(data.storeCode);
    if (existingStore && existingStore.id !== id) {
      throw new Error(`Kode toko ${data.storeCode} sudah dipakai oleh toko lain.`);
    }
  }
  return await repository.updateStore(id, data);
};

const deactivateStore = async (id) => {
  await getStoreById(id); // Cek toko ada atau tidak
  return await repository.deactivateStore(id);
};

const destroyStore = async (id) => {
  await getStoreById(id); // Cek toko ada atau tidak
  return await repository.hardDeleteStore(id);
};

module.exports = {
  getStores,
  getInactiveStores,
  getStoreById,
  createNewStore,
  updateExistingStore,
  deactivateStore,
  destroyStore
};