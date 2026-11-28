const prisma = require('../../config/database');

const findAllProduction = async ({ year } = {}) => {
  const numYear = year ? parseInt(year, 10) : null;

  return await prisma.productionMonthly.findMany({
    where: numYear && !isNaN(numYear)
      ? { period: { year: numYear } }
      : {},
    include: {
      period: {
        select: {
          id: true,
          year: true,
          month: true,
          periodStart: true,
          periodEnd: true
        }
      }
    },
    orderBy: [
      { period: { year: 'desc' } },
      { period: { month: 'asc' } }
    ]
  });
};

const findProductionById = async (id) => {
  return await prisma.productionMonthly.findUnique({
    where: { id },
    include: {
      period: {
        select: {
          id: true,
          year: true,
          month: true,
          periodStart: true,
          periodEnd: true
        }
      }
    }
  });
};

const findProductionByPeriodId = async (periodId) => {
  return await prisma.productionMonthly.findUnique({
    where: { periodId },
    include: {
      period: {
        select: {
          id: true,
          year: true,
          month: true
        }
      }
    }
  });
};

const upsertProductionByPeriod = async (periodId, { productionQty, notes = null }) => {
  return await prisma.productionMonthly.upsert({
    where: { periodId },
    update: {
      productionQty,
      ...(notes !== undefined ? { notes } : {})
    },
    create: {
      periodId,
      productionQty,
      notes
    },
    include: {
      period: {
        select: {
          id: true,
          year: true,
          month: true
        }
      }
    }
  });
};

const updateProductionById = async (id, data) => {
  return await prisma.productionMonthly.update({
    where: { id },
    data,
    include: {
      period: {
        select: {
          id: true,
          year: true,
          month: true
        }
      }
    }
  });
};

const deleteProductionById = async (id) => {
  return await prisma.productionMonthly.delete({
    where: { id }
  });
};

module.exports = {
  findAllProduction,
  findProductionById,
  findProductionByPeriodId,
  upsertProductionByPeriod,
  updateProductionById,
  deleteProductionById
};
