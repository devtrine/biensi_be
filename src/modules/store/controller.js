const service = require('./service');

const getStoresController = async (req, res, next) => {
  try {
    let isActive;
    if (req.query.isActive === 'true') isActive = true;
    else if (req.query.isActive === 'false') isActive = false;

    // Ambil parameter '?search=...' dari URL. Kalau kosong, jadikan string kosong
    const searchQuery = req.query.search || '';

    // Kirim isActive dan searchQuery ke layer service
    const stores = await service.getStores(isActive, searchQuery);
    
    return res.status(200).json({ success: true, data: stores, meta: { total: stores.length } });
  } catch (error) { 
    next(error); 
  }
};

const getInactiveStoresController = async (req, res, next) => {
    try {
        const searchQuery = req.query.search || '';
        const stores = await service.getInactiveStores(searchQuery);
        return res.status(200).json({ success: true, data: stores, meta: { total: stores.length } });
    } catch (error) { next(error); }
};


const getStoreByIdController = async (req, res, next) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    const store = await service.getStoreById(storeId);
    return res.status(200).json({ success: true, data: store });
  } catch (error) { 
    // Jika error karena tidak ketemu, kembalikan 404
    if (error.message === 'Toko tidak ditemukan.') {
      return res.status(404).json({ success: false, error: { message: error.message } });
    }
    next(error); 
  }
};

const createStoreController = async (req, res, next) => {
  try {
    const { storeCode, storeName } = req.body;
    if (!storeCode || !storeName) {
      return res.status(400).json({ success: false, error: { message: 'storeCode dan storeName wajib diisi' } });
    }
    const newStore = await service.createNewStore(req.body);
    return res.status(201).json({ success: true, data: newStore, message: 'Toko berhasil ditambahkan' });
  } catch (error) { next(error); }
};

const updateStoreController = async (req, res, next) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    const updatedStore = await service.updateExistingStore(storeId, req.body);
    return res.status(200).json({ success: true, data: updatedStore, message: 'Data toko berhasil diperbarui' });
  } catch (error) { next(error); }
};

const deactivateStoreController = async (req, res, next) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    await service.deactivateStore(storeId);
    return res.status(200).json({ success: true, message: 'Toko berhasil dinonaktifkan (Soft Delete)' });
  } catch (error) { next(error); }
};

const hardDeleteStoreController = async (req, res, next) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    await service.destroyStore(storeId);
    return res.status(200).json({ success: true, message: 'Data toko berhasil dihapus permanen dari database' });
  } catch (error) { next(error); }
};

module.exports = {
  getStoresController,
  getInactiveStoresController,
  getStoreByIdController,
  createStoreController,
  updateStoreController,
  deactivateStoreController,
  hardDeleteStoreController
};