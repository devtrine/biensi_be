const express = require('express');
const {
  getDivisionsController,
  getDivisionByIdController,
  createDivisionController,
  updateDivisionController,
  deleteDivisionController
} = require('./controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', getDivisionsController);
router.get('/:id', getDivisionByIdController);
router.post('/', createDivisionController);
router.put('/:id', updateDivisionController);
router.delete('/:id', deleteDivisionController);

module.exports = router;