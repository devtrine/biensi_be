const prisma = require('../../config/database');

// Ambil Periode berdasarkan Tahun & Bulan
const getPeriodByDate = async (year, month) => {
  const numYear = parseInt(year, 10);
  const numMonth = parseInt(month, 10);

  let period = await prisma.reportingPeriod.findFirst({
    where: { year: numYear, month: numMonth }
  });

  if (!period) {
    period = await prisma.reportingPeriod.findFirst({
      where: { year: numYear },
      orderBy: { month: 'desc' }
    });
  }
  return period;
};

// Ambil Periode berdasarkan ID
const getPeriodById = async (periodId) => {
  return await prisma.reportingPeriod.findUnique({
    where: { id: periodId }
  });
};

// Ambil Snapshot Karyawan
const getMonthlySnapshots = async (periodId, year) => {
  const includeRel = {
    employee: {
      include: {
        division: true,
        department: true,
        unit: true,
        position: true,
        store: true
      }
    }
  };

  let snapshots = await prisma.employeeMonthlySnapshot.findMany({
    where: { periodId },
    include: includeRel
  });

  if (snapshots.length === 0 && year) {
    const latestPeriodWithSnap = await prisma.reportingPeriod.findFirst({
      where: {
        year: parseInt(year, 10),
        employeeSnaps: { some: {} }
      },
      orderBy: { month: 'desc' }
    });

    if (latestPeriodWithSnap) {
      snapshots = await prisma.employeeMonthlySnapshot.findMany({
        where: { periodId: latestPeriodWithSnap.id },
        include: includeRel
      });
    }
  }

  return snapshots.filter(s => s.employee && s.employee.gender !== null && s.employee.baseSalary !== null);
};

const getLatestPeriodByYear = async (year) => {
  return await prisma.reportingPeriod.findFirst({
    where: { year: parseInt(year, 10) },
    orderBy: { month: 'desc' }
  });
};

// Ambil Absensi
const getAttendanceByPeriod = async (periodId, scope = 'Corporate', year = null) => {
  const normScope = String(scope || '').toUpperCase();
  const whereClause = { periodId };

  if (normScope.includes('HQ') || normScope.includes('PUSAT') || normScope === 'HO') {
    whereClause.scope = 'HQ';
  } else if (normScope.includes('STORE') || normScope.includes('RITEL') || normScope.includes('TOKO')) {
    whereClause.scope = 'STORE';
  }

  let attendance = await prisma.attendanceAggregateMonthly.findFirst({
    where: whereClause,
    orderBy: { createdAt: 'desc' }
  });

  if (!attendance && year) {
    const latestAttPeriod = await prisma.reportingPeriod.findFirst({
      where: {
        year: parseInt(year, 10),
        attendanceAggregate: { some: {} }
      },
      orderBy: { month: 'desc' }
    });

    if (latestAttPeriod) {
      whereClause.periodId = latestAttPeriod.id;
      attendance = await prisma.attendanceAggregateMonthly.findFirst({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      });
    }
  }

  return attendance;
};

// Ambil Sales per Periode normalnya ngambil data terakhir
const getSalesByPeriod = async (periodId, year = null) => {
  const sales = await prisma.salesMonthly.findMany({
    where: { periodId },
    include: { store: true },
    orderBy: { netSales: 'desc' }
  });

  let validSales = sales.filter(s => {
    const name = String(s.store?.storeName || '').toUpperCase().trim();
    return name !== 'TOTAL' && name !== 'STORE SUDIRMAN';
  });

  if (validSales.length === 0 && year) {
    const periodsInYear = await prisma.reportingPeriod.findMany({
      where: { year: parseInt(year, 10) },
      orderBy: { month: 'desc' }
    });

    for (const p of periodsInYear) {
      const candidateSales = await prisma.salesMonthly.findMany({
        where: { periodId: p.id },
        include: { store: true },
        orderBy: { netSales: 'desc' }
      });
      const filtered = candidateSales.filter(s => {
        const name = String(s.store?.storeName || '').toUpperCase().trim();
        return name !== 'TOTAL' && name !== 'STORE SUDIRMAN' && parseFloat(s.netSales || 0) > 0;
      });
      if (filtered.length > 0) {
        validSales = filtered;
        break;
      }
    }
  }

  return validSales;
};

// Ambil Karyawan Toko 
const getActiveEmployeesForSnapshot = async () => {
  return await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      storeId: { not: null },
      gender: { not: null },
      baseSalary: { not: null, gt: 0 }
    },
    include: { position: true, store: true, division: true, department: true }
  });
};

// Ambil Data Turnover (Mendukung Filter Scope Corporate / HQ / Store)
const getTurnoverMovements = async (startDate, endDate, scope = 'Corporate') => {
  const normScope = String(scope || '').toUpperCase();
  const whereClause = {
    movementDate: { gte: startDate, lte: endDate },
    movementType: { in: ['VOLUNTARY', 'INVOLUNTARY', 'CONTRACT_END'] }
  };

  if (normScope.includes('HQ') || normScope.includes('PUSAT') || normScope === 'HO') {
    whereClause.storeId = null;
  } else if (normScope.includes('STORE') || normScope.includes('RITEL') || normScope.includes('TOKO')) {
    whereClause.storeId = { not: null };
  }

  return await prisma.employeeMovement.findMany({
    where: whereClause,
    include: {
      employee: { include: { position: true } },
      store: true,
      department: true
    }
  });
};

// Ambil Kontrak yang Akan Habis 
const getExpiringContracts = async (targetDate, scope = 'Corporate') => {
  const normScope = String(scope || '').toUpperCase();
  const whereClause = {
    endDate: { lte: targetDate, gt: new Date() },
    status: 'ACTIVE',
    baseSalary: { not: null }
  };

  if (normScope.includes('HQ') || normScope.includes('PUSAT') || normScope === 'HO') {
    whereClause.storeId = null;
  } else if (normScope.includes('STORE') || normScope.includes('RITEL') || normScope.includes('TOKO')) {
    whereClause.storeId = { not: null };
  }

  return await prisma.employee.findMany({
    where: whereClause,
    include: { store: true, position: true },
    orderBy: { endDate: 'asc' },
    take: 6
  });
};

// Ambil Absensi HQ dan STORE Sekaligus
const getAttendanceBothScopes = async (periodId, year = null) => {
  const [hq, store] = await Promise.all([
    getAttendanceByPeriod(periodId, 'HQ', year),
    getAttendanceByPeriod(periodId, 'STORE', year)
  ]);
  return { hq, store };
};

// Ambil Ringkasan SP Toko, SP HO, Bipartit, & Kontrak Lewat Jatuh Tempo
const getIndustrialAndSpSummary = async (year) => {
  const numYear = parseInt(year, 10) || new Date().getFullYear();
  const startOfYear = new Date(Date.UTC(numYear, 0, 1, 0, 0, 0));
  const endOfYear = new Date(Date.UTC(numYear, 11, 31, 23, 59, 59));

  const [spStoreRecords, spHoCases, irCases, overdueContracts] = await Promise.all([
    prisma.spAggregateMonthly.findMany({
      where: { scope: 'STORE', period: { year: numYear } }
    }),
    prisma.disciplinaryCase.findMany({
      where: {
        storeId: null,
        category: { not: 'Fraud & Audit' },
        startDate: { gte: startOfYear, lte: endOfYear }
      }
    }),
    prisma.industrialRelationCase.findMany({
      include: { employee: true }
    }),
    prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        baseSalary: { not: null },
        endDate: { lt: new Date() }
      },
      select: { id: true, storeId: true }
    })
  ]);

  const storeSp = spStoreRecords.reduce(
    (acc, r) => {
      acc.total += r.totalSpIssued;
      acc.tataTertib += r.tataTertibCount;
      acc.nonTataTertib += r.nonTataTertibCount;
      const brk = r.breakdown || {};
      if (brk.bySpLevel) {
        acc.sp1 += (brk.bySpLevel.sp1 || 0);
        acc.sp2 += (brk.bySpLevel.sp2 || 0);
        acc.sp3 += (brk.bySpLevel.sp3 || 0);
      }
      if (brk.byRegion) {
        acc.barat += (brk.byRegion.barat || 0);
        acc.timur += (brk.byRegion.timur || 0);
      }
      return acc;
    },
    { total: 0, tataTertib: 0, nonTataTertib: 0, sp1: 0, sp2: 0, sp3: 0, barat: 0, timur: 0 }
  );

  let hqTataTertib = 0;
  let hqNonTataTertib = 0;
  spHoCases.forEach(c => {
    if (String(c.category || '').toUpperCase().includes('NON')) hqNonTataTertib++;
    else hqTataTertib++;
  });

  const countDisputes = (list) => {
    const res = { total: list.length, selesai: 0, bipartit: 0, mediasi: 0, phi: 0 };
    list.forEach(c => {
      const st = String(c.status || '').toUpperCase();
      if (st.includes('CLOSE') || st.includes('SELESAI')) res.selesai++;
      else if (st.includes('MEDIASI') || st.includes('DISNAKER')) res.mediasi++;
      else if (st.includes('PHI')) res.phi++;
      else res.bipartit++;
    });
    return res;
  };

  return {
    totalSpIssued: storeSp.total + spHoCases.length, // Metrik #27 Corporate
    storeSp,                                         // Metrik #27 Store & Kartu SP
    hqSp: {                                          // Metrik #27 HQ
      total: spHoCases.length,
      tataTertib: hqTataTertib,
      nonTataTertib: hqNonTataTertib
    },
    disputes: {                                      // Metrik #26 (Corporate, HQ, Store)
      corporate: countDisputes(irCases),
      hq: countDisputes(irCases.filter(c => !c.employee?.storeId)),
      store: countDisputes(irCases.filter(c => c.employee?.storeId))
    },
    overdueContracts: {                              // Metrik #23 (Kontrak lewat jatuh tempo)
      corporate: overdueContracts.length,
      hq: overdueContracts.filter(e => !e.storeId).length,
      store: overdueContracts.filter(e => e.storeId).length
    }
  };
};

module.exports = {
  getPeriodByDate,
  getPeriodById,
  getMonthlySnapshots,
  getAttendanceByPeriod,
  getAttendanceBothScopes,
  getSalesByPeriod,
  getActiveEmployeesForSnapshot,
  getTurnoverMovements,
  getExpiringContracts,
  getLatestPeriodByYear,
  getIndustrialAndSpSummary
};