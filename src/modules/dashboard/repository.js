const prisma = require('../../config/database');

// Ambil Periode berdasarkan Tahun & Bulan
const getPeriodByDate = async (year, month) => {
  const numYear = parseInt(year, 10) || new Date().getFullYear();
  const numMonth = parseInt(month, 10) || (new Date().getMonth() + 1);

  let period = await prisma.reportingPeriod.findFirst({
    where: { year: numYear, month: numMonth }
  });

  // Jika database baru di-reset dan belum ada periode sama sekali
  if (!period) {
    const periodStart = new Date(Date.UTC(numYear, numMonth - 1, 1));
    const periodEnd = new Date(Date.UTC(numYear, numMonth, 0));
    period = await prisma.reportingPeriod.create({
      data: {
        year: numYear,
        month: numMonth,
        periodStart,
        periodEnd
      }
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

  const snapshots = await prisma.employeeMonthlySnapshot.findMany({
    where: { periodId },
    include: includeRel
  });

  return snapshots.filter(s => s.employee && s.employee.gender !== null);
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

// Ambil Ringkasan SP Toko, SP HO, Bipartit, Kontrak Lewat Jatuh Tempo, & Perizinan (WLKP/PP/K3)
const getIndustrialAndSpSummary = async (year, month = null) => {
  const numYear = parseInt(year, 10) || new Date().getFullYear();
  const numMonth = month ? parseInt(month, 10) : 12;
  const startOfYear = new Date(Date.UTC(numYear, 0, 1, 0, 0, 0));
  const refDate = new Date(Date.UTC(numYear, numMonth, 0, 23, 59, 59));

  const [spStoreRecords, discCases, irCases, overdueContracts, compliances] = await Promise.all([
    prisma.spAggregateMonthly.findMany({
      where: {
        scope: 'STORE',
        period: {
          year: numYear,
          ...(month ? { month: { lte: numMonth } } : {})
        }
      },
      include: { period: true }
    }),
    prisma.disciplinaryCase.findMany({
      where: {
        category: { not: 'Fraud & Audit' },
        startDate: { gte: startOfYear, lte: refDate }
      },
      include: { store: true }
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
    }),
    prisma.storeCompliance.findMany({
      include: { store: true },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  const isCaseActiveAtRef = (c) => {
    const stUpper = String(c.status || '').toUpperCase();
    const discUpper = String(c.disciplineType || '').toUpperCase();
    if (stUpper.includes('NON') || stUpper.includes('EXPIRED') || discUpper.includes('PHK')) return false;
    if (c.endDate) return new Date(c.endDate) >= refDate;
    if (c.startDate) {
      const exp = new Date(c.startDate);
      exp.setUTCMonth(exp.getUTCMonth() + 6);
      return exp >= refDate;
    }
    return true;
  };

  const spHoCases = discCases.filter(c => c.storeId === null);
  const spStoreCases = discCases.filter(c => c.storeId !== null);

  // Poin 6: Penamaan Jumlah SP Aktif & Jumlah SP Non Aktif berdasarkan masa berlaku 6 bulan / End Date
  const storeSp = { total: 0, spAktif: 0, spNonAktif: 0, tataTertib: 0, nonTataTertib: 0, sp1: 0, sp2: 0, sp3: 0, barat: 0, timur: 0 };

  if (spStoreRecords.length > 0) {
    spStoreRecords.forEach(r => {
      const m = r.period?.month || 1;
      const brk = r.breakdown || {};
      const phkCnt = brk.bySpLevel?.phk || 0;
      const nonPhk = Math.max(0, r.totalSpIssued - phkCnt);

      storeSp.total += r.totalSpIssued;
      storeSp.tataTertib += r.tataTertibCount;
      storeSp.nonTataTertib += r.nonTataTertibCount;

      if (m > numMonth - 6) {
        storeSp.spAktif += nonPhk;
        storeSp.spNonAktif += phkCnt;
      } else {
        storeSp.spNonAktif += r.totalSpIssued;
      }

      if (brk.bySpLevel) {
        storeSp.sp1 += (brk.bySpLevel.sp1 || 0);
        storeSp.sp2 += (brk.bySpLevel.sp2 || 0);
        storeSp.sp3 += (brk.bySpLevel.sp3 || 0);
      }
      if (brk.byRegion) {
        storeSp.barat += (brk.byRegion.barat || 0);
        storeSp.timur += (brk.byRegion.timur || 0);
      }
    });
  } else {
    spStoreCases.forEach(c => {
      storeSp.total++;
      if (isCaseActiveAtRef(c)) storeSp.spAktif++;
      else storeSp.spNonAktif++;

      if (String(c.category || '').toUpperCase().includes('NON')) storeSp.nonTataTertib++;
      else storeSp.tataTertib++;

      const dt = String(c.disciplineType || '').toUpperCase();
      if (dt.includes('1')) storeSp.sp1++;
      else if (dt.includes('2')) storeSp.sp2++;
      else if (dt.includes('3')) storeSp.sp3++;

      const reg = String(c.store?.region || '').toUpperCase();
      if (reg === 'TIMUR') storeSp.timur++;
      else if (reg === 'BARAT') storeSp.barat++;
    });
  }

  let hqSpAktif = 0;
  let hqSpNonAktif = 0;
  let hqTataTertib = 0;
  let hqNonTataTertib = 0;
  spHoCases.forEach(c => {
    if (isCaseActiveAtRef(c)) hqSpAktif++;
    else hqSpNonAktif++;

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

  // Poin 7: Matriks Perizinan Ketenagakerjaan (WLKP, PP, K3)
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
  const complianceKpi = { total: compliances.length, patuh: 0, akanJatuhTempo: 0, kadaluarsa: 0 };
  const complianceByType = { wlkp: 0, pp: 0, k3: 0, lainnya: 0 };
  const complianceList = [];

  const summarizeComplianceScope = (items) => {
    const res = { total: items.length, patuh: 0, akanJatuhTempo: 0, kadaluarsa: 0, wlkp: 0, pp: 0, k3: 0 };
    items.forEach(item => {
      if (item.status === 'KADALUARSA') res.kadaluarsa++;
      else if (item.status === 'SEGERA HABIS') res.akanJatuhTempo++;
      else res.patuh++;

      const docUpper = String(item.area || '').toUpperCase();
      if (docUpper.includes('WLKP')) res.wlkp++;
      else if (docUpper.includes('PP') || docUpper.includes('PERATURAN PERUSAHAAN')) res.pp++;
      else if (docUpper.includes('K3') || docUpper.includes('GENSET') || docUpper.includes('LISTRIK')) res.k3++;
    });
    return res;
  };

  compliances.forEach(c => {
    let statusKalkulasi = c.status || 'PATUH';
    let liveRemainingDays = c.remainingDays ?? 0;

    if (c.validUntil) {
      const expiry = new Date(c.validUntil);
      liveRemainingDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      if (expiry < today) {
        statusKalkulasi = 'KADALUARSA';
        complianceKpi.kadaluarsa++;
      } else if (expiry <= thirtyDaysFromNow) {
        statusKalkulasi = 'SEGERA HABIS';
        complianceKpi.akanJatuhTempo++;
      } else {
        statusKalkulasi = 'PATUH';
        complianceKpi.patuh++;
      }
    } else {
      if (statusKalkulasi === 'KADALUARSA') complianceKpi.kadaluarsa++;
      else if (statusKalkulasi === 'SEGERA HABIS') complianceKpi.akanJatuhTempo++;
      else complianceKpi.patuh++;
    }

    const docUpper = String(c.documentType || '').toUpperCase();
    if (docUpper.includes('WLKP')) complianceByType.wlkp++;
    else if (docUpper.includes('PP') || docUpper.includes('PERATURAN PERUSAHAAN')) complianceByType.pp++;
    else if (docUpper.includes('K3') || docUpper.includes('GENSET') || docUpper.includes('LISTRIK')) complianceByType.k3++;
    else complianceByType.lainnya++;

    const displayEntity = c.store?.storeName || c.location || c.entityName || 'HO';
    const isHqDoc = !c.storeId;

    complianceList.push({
      id: c.id,
      storeId: c.storeId || null,
      isHq: isHqDoc,
      area: c.documentType,
      description: c.description || `Perizinan ${c.documentType} untuk ${displayEntity}`,
      entity: displayEntity,
      entityName: c.entityName || 'Biensi',
      location: c.location || displayEntity,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      pic: c.pic || '-',
      remainingDays: Math.max(0, liveRemainingDays),
      notes: c.notes || '-',
      status: statusKalkulasi
    });
  });

  const compliancePermits = {
    kpi: complianceKpi,
    byType: complianceByType,
    byScope: {
      corporate: summarizeComplianceScope(complianceList),
      hq: summarizeComplianceScope(complianceList.filter(item => item.isHq)),
      store: summarizeComplianceScope(complianceList.filter(item => !item.isHq))
    },
    tableData: complianceList
  };

  return {
    totalSpIssued: storeSp.total + spHoCases.length,
    corporateSp: {
      total: storeSp.total + spHoCases.length,
      spAktif: storeSp.spAktif + hqSpAktif,
      spNonAktif: storeSp.spNonAktif + hqSpNonAktif,
      tataTertib: storeSp.tataTertib + hqTataTertib,
      nonTataTertib: storeSp.nonTataTertib + hqNonTataTertib
    },
    storeSp,
    hqSp: {
      total: spHoCases.length,
      spAktif: hqSpAktif,
      spNonAktif: hqSpNonAktif,
      tataTertib: hqTataTertib,
      nonTataTertib: hqNonTataTertib
    },
    disputes: {
      corporate: countDisputes(irCases),
      hq: countDisputes(irCases.filter(c => !c.employee?.storeId)),
      store: countDisputes(irCases.filter(c => c.employee?.storeId))
    },
    overdueContracts: {
      corporate: overdueContracts.length,
      hq: overdueContracts.filter(e => !e.storeId).length,
      store: overdueContracts.filter(e => e.storeId).length
    },
    compliancePermits
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
