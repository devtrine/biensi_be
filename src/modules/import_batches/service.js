const prisma = require('../../config/database');
const { IMPORT_MODULES, getImportStatusByYear } = require('../../utils/importBatch');

const getYearlyStatus = async (moduleParam, yearParam) => {
  const moduleKey = String(moduleParam || '').toUpperCase().trim();
  const year = parseInt(yearParam, 10) || new Date().getFullYear();

  if (!moduleKey || !Object.values(IMPORT_MODULES).includes(moduleKey)) {
    const err = new Error(`Parameter 'module' tidak valid. Pilihan: ${Object.values(IMPORT_MODULES).join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const months = await getImportStatusByYear({ module: moduleKey, year });
  const inputtedMonths = months.filter(m => m.isInputted).length;

  return {
    module: moduleKey,
    year,
    summary: {
      inputtedMonths,
      uninputtedMonths: 12 - inputtedMonths
    },
    months
  };
};

const getImportHistory = async ({ module, year, limit = 20 }) => {
  const moduleKey = module ? String(module).toUpperCase().trim() : undefined;
  const numYear = year ? parseInt(year, 10) : undefined;
  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

  return await prisma.importBatch.findMany({
    where: {
      ...(moduleKey ? { module: moduleKey } : {}),
      ...(numYear ? { periodYear: numYear } : {})
    },
    include: {
      period: {
        select: { id: true, year: true, month: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: safeLimit
  });
};

module.exports = {
  getYearlyStatus,
  getImportHistory
};