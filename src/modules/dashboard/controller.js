const service = require('./service');

// hak akses via controller karena di kompres jadi 1 endpoint
const REDACTION_MAP = {
  productivity: [
    'summary.productivity.totalBudgetCost',
    'summary.productivity.totalActualCost',
    'summary.productivity.labourCostRatio',
    'summary.productivity.payrollMultiplier',
    'summary.productivity.avgEmploymentCost',
    'summary.productivity.costByDivision',
    'summary.productivity.costByDepartment',
    'summary.productivity.costByEmploymentType',
    'summary.scopeBreakdown.*.productivity.budgetCost',
    'summary.scopeBreakdown.*.productivity.actualCost',
    'summary.scopeBreakdown.*.productivity.labourCostRatio',
    'summary.scopeBreakdown.*.productivity.payrollMultiplier',
    'summary.scopeBreakdown.*.productivity.avgEmploymentCost',
    'storePerformance.costRatioByStoreType',
    'storePerformance.storeLeaderboard.*.labourCost',
    'storePerformance.storeLeaderboard.*.labourCostRatio'
  ],
  turnover: [
    'turnoverAndRetention',
    'summary.retention'
  ],
  disciplinary: [
    'industrialAndSp.storeSp',
    'industrialAndSp.hqSp',
    'industrialAndSp.corporateSp',
    'industrialAndSp.totalSpIssued'
  ],
  attendance: [
    'summary.attendance',
    'summary.attendanceByScope'
  ],
  // Dipisah sesuai checkbox di FE
  industrialRelation: [
    'industrialAndSp.disputes'
  ],
  compliance: [
    'compliance',
    'industrialAndSp.compliancePermits'
  ],
  employees: [
    'summary.demographics.distribution',
    'summary.scopeBreakdown.*.byGender',
    'summary.scopeBreakdown.*.byAgeBracket',
    'summary.scopeBreakdown.*.byTenureBracket',
    'summary.scopeBreakdown.*.byLevelStandard',
    'summary.scopeBreakdown.*.byEmployeeLevel',
    'summary.scopeBreakdown.*.byEmployeeLevel14',
    'summary.scopeBreakdown.*.byEmploymentStandard',
    'summary.scopeBreakdown.*.byPositionGroup'
  ]
};
// ==============================================================================

// Helper rekursif untuk menghapus properti berdasarkan path (mendukung wildcard '*')
const deletePropertyByPath = (target, pathParts) => {
  if (!target || typeof target !== 'object' || pathParts.length === 0) return;

  const [currentKey, ...restKeys] = pathParts;

  if (currentKey === '*') {
    if (Array.isArray(target)) {
      target.forEach(item => deletePropertyByPath(item, restKeys));
    } else {
      Object.values(target).forEach(val => deletePropertyByPath(val, restKeys));
    }
    return;
  }

  if (restKeys.length === 0) {
    delete target[currentKey];
  } else if (target[currentKey] !== undefined) {
    deletePropertyByPath(target[currentKey], restKeys);
  }
};

const getSummary = async (req, res) => {
  try {
    const filters = {
      year: req.query.year,
      month: req.query.month,
      scope: req.query.scope
    };

    // 1. Ambil data utuh dari service
    const data = await service.getMainExecutiveDashboard(filters);

    // 2. Identifikasi Role & Permissions dari req.user (hasil middleware auth)
    const userRole = req.user?.roleId;
    const roleName = String(req.user?.roleName || '').toUpperCase();
    const permissions = req.user?.permissions || {};
    const modulesPerm = permissions.modules || permissions;
    const accessLevel = String(permissions.accessLevel || 'RESTRICTED_READ').toUpperCase();

    const isSuperAdmin = userRole === 1 || roleName === 'SUPER ADMIN';

    // 3. Jalankan Redaction Map secara dinamis
    if (!isSuperAdmin) {
      for (const [moduleName, pathsToDelete] of Object.entries(REDACTION_MAP)) {
        const modConfig = modulesPerm[moduleName];
        const canView = modConfig && typeof modConfig === 'object'
          ? Boolean(modConfig.view || modConfig.lihat || modConfig.read)
          : accessLevel === 'READ_WRITE' || accessLevel === 'READ';

        if (!canView) {
          pathsToDelete.forEach(path => {
            deletePropertyByPath(data, path.split('.'));
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Executive Dashboard berhasil dimuat',
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getSummary
};