const express = require('express');
const {
  getStoresController,
  getInactiveStoresController,
  getStoreByIdController,
  createStoreController,
  updateStoreController,
  deactivateStoreController,
  hardDeleteStoreController
} = require('./controller');
const { authenticate } = require('../../middleware/auth');
const router = express.Router();

router.use(authenticate);

router.get('/', getStoresController);
router.get('/inactive', getInactiveStoresController);
router.get('/:id', getStoreByIdController);

router.post('/', createStoreController);
router.put('/:id', updateStoreController);

router.patch('/:id/deactivate', deactivateStoreController); 
router.delete('/:id', hardDeleteStoreController);

module.exports = router;