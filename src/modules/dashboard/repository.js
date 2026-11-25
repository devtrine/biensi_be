const prisma = require('../../config/database');

// Ambil Periode berdasarkan Tahun & Bulan
const getPeriodByDate = async (year, month) => {
  const numYear = parseInt(year, 10) || new Date().getFullYear();
  const numMonth = parseInt(month, 10) || (new Date().getMonth() + 1);

  const period = await prisma.reportingPeriod.findFirst({
    where: { year: numYear, month: numMonth }
  });

  if (!period) {
    return {
      id: null,
      year: numYear,
      month: numMonth,
      periodStart: new Date(Date.UTC(numYear, numMonth - 1, 1)),
      periodEnd: new Date(Date.UTC(numYear, numMonth, 0)),
      isVirtual: true
    };
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
  if (!periodId) return [];

  const includeRel = {
    division: true,
    department: true,
    position: true,
    store: true,
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

  // [Jangan buang karyawan yang gender-nya null agar konsisten dengan headcountTrajectory
  return snapshots.filter(s => Boolean(s.employee));
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

  let attendance = periodId
    ? await prisma.attendanceAggregateMonthly.findFirst({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      })
    : null;

  if (!attendance && year) {
    const latestAttPeriod = await prisma.reportingPeriod.findFirst({
      where: {
        year: parseInt(year, 10),
        attendanceAggregate: {
          some: whereClause.scope ? { scope: whereClause.scope } : {}
        }
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
  const sales = periodId
    ? await prisma.salesMonthly.findMany({
        where: { periodId },
        include: { store: true },
        orderBy: { netSales: 'desc' }
      })
    : [];

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
// Ambil Ringkasan SP Toko, SP HO, Bipartit, Kontrak Lewat Jatuh Tempo, & Perizinan (WLKP/PP/K3)
const getIndustrialAndSpSummary = async (year, month = null, spYear = null) => {
  const numYear = parseInt(year, 10) || new Date().getFullYear();
  const numMonth = month ? parseInt(month, 10) : 12;
  const refDate = new Date(Date.UTC(numYear, numMonth, 0, 23, 59, 59));
  const today = new Date();

  // Tentukan mode filter SP: 'ALL' (keseluruhan) atau tahun tertentu (default mengikuti numYear)
  const isAllSpYear = String(spYear || '').toUpperCase() === 'ALL';
  const targetSpYear = !isAllSpYear ? (parseInt(spYear, 10) || numYear) : null;

  const [allSpStoreRecords, allDiscCases, irCases, overdueContracts, compliances] = await Promise.all([
    prisma.spAggregateMonthly.findMany({
      where: {
        scope: 'STORE'
      },
      include: { period: true }
    }),
    // Tarik seluruh data disciplinaryCase (non Fraud & Audit) agar bisa dihitung All-Time sekaligus per Tahun
    prisma.disciplinaryCase.findMany({
      where: {
        category: { not: 'Fraud & Audit' }
      },
      include: { store: true }
    }),
    prisma.industrialRelationCase.findMany({
      where: {
        OR: [
          {
            startDate: { lte: refDate }
          },
          {
            endDate: { lte: refDate }
          },
          {
            startDate: null,
            endDate: null
          }
        ]
      },
      include: { employee: true, store: true }
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

  const isCaseActiveAtDate = (c, compareDate) => {
    const stUpper = String(c.status || '').toUpperCase();
    const discUpper = String(c.disciplineType || '').toUpperCase();
    if (stUpper.includes('NON') || stUpper.includes('EXPIRED') || discUpper.includes('PHK')) return false;
    if (c.endDate) return new Date(c.endDate) >= compareDate;
    if (c.startDate) {
      const exp = new Date(c.startDate);
      exp.setUTCMonth(exp.getUTCMonth() + 6);
      return exp >= compareDate;
    }
    return true;
  };

  // Helper agregasi daftar kasus SP (Store + HQ)
  const summarizeDisciplinaryList = (cases, compareDate) => {
    const store = { total: 0, spAktif: 0, spNonAktif: 0, tataTertib: 0, nonTataTertib: 0, sp1: 0, sp2: 0, sp3: 0, barat: 0, timur: 0 };
    const hq = { total: 0, spAktif: 0, spNonAktif: 0, tataTertib: 0, nonTataTertib: 0, sp1: 0, sp2: 0, sp3: 0 };

    cases.forEach(c => {
      const isStore = c.storeId !== null;
      const target = isStore ? store : hq;

      target.total++;
      if (isCaseActiveAtDate(c, compareDate)) target.spAktif++;
      else target.spNonAktif++;

      if (String(c.category || '').toUpperCase().includes('NON')) target.nonTataTertib++;
      else target.tataTertib++;

      const dt = String(c.disciplineType || '').toUpperCase();
      if (dt.includes('1')) target.sp1++;
      else if (dt.includes('2')) target.sp2++;
      else if (dt.includes('3')) target.sp3++;

      if (isStore) {
        const reg = String(c.store?.region || '').toUpperCase();
        if (reg === 'TIMUR') store.timur++;
        else if (reg === 'BARAT') store.barat++;
      }
    });

    const corporate = {
      total: store.total + hq.total,
      spAktif: store.spAktif + hq.spAktif,
      spNonAktif: store.spNonAktif + hq.spNonAktif,
      tataTertib: store.tataTertib + hq.tataTertib,
      nonTataTertib: store.nonTataTertib + hq.nonTataTertib,
      sp1: store.sp1 + hq.sp1,
      sp2: store.sp2 + hq.sp2,
      sp3: store.sp3 + hq.sp3
    };

    return { corporate, store, hq };
  };

  // Helper menggabungkan spAggregateMonthly (Rekap SP Toko) ke dalam objek summary jika tahun tersebut tidak memiliki detail SP Toko di disciplinaryCase
  const applyStoreRekapToSummary = (summaryObj, rekapRows, activeCutoffMonth = 12, isCurrentOrTargetYear = true) => {
    if (!rekapRows || rekapRows.length === 0 || summaryObj.store.total > 0) return summaryObj;
    rekapRows.forEach(r => {
      const m = r.period?.month || 1;
      const brk = r.breakdown || {};
      const phkCnt = brk.bySpLevel?.phk || 0;
      const nonPhk = Math.max(0, r.totalSpIssued - phkCnt);

      summaryObj.store.total += r.totalSpIssued;
      summaryObj.store.tataTertib += r.tataTertibCount;
      summaryObj.store.nonTataTertib += r.nonTataTertibCount;

      if (isCurrentOrTargetYear && m > activeCutoffMonth - 6) {
        summaryObj.store.spAktif += nonPhk;
        summaryObj.store.spNonAktif += phkCnt;
      } else {
        summaryObj.store.spNonAktif += r.totalSpIssued;
      }

      if (brk.bySpLevel) {
        summaryObj.store.sp1 += (brk.bySpLevel.sp1 || 0);
        summaryObj.store.sp2 += (brk.bySpLevel.sp2 || 0);
        summaryObj.store.sp3 += (brk.bySpLevel.sp3 || 0);
      }
      if (brk.byRegion) {
        summaryObj.store.barat += (brk.byRegion.barat || 0);
        summaryObj.store.timur += (brk.byRegion.timur || 0);
      }
    });

    summaryObj.corporate.total = summaryObj.store.total + summaryObj.hq.total;
    summaryObj.corporate.spAktif = summaryObj.store.spAktif + summaryObj.hq.spAktif;
    summaryObj.corporate.spNonAktif = summaryObj.store.spNonAktif + summaryObj.hq.spNonAktif;
    summaryObj.corporate.tataTertib = summaryObj.store.tataTertib + summaryObj.hq.tataTertib;
    summaryObj.corporate.nonTataTertib = summaryObj.store.nonTataTertib + summaryObj.hq.nonTataTertib;
    summaryObj.corporate.sp1 = summaryObj.store.sp1 + summaryObj.hq.sp1;
    summaryObj.corporate.sp2 = summaryObj.store.sp2 + summaryObj.hq.sp2;
    summaryObj.corporate.sp3 = summaryObj.store.sp3 + summaryObj.hq.sp3;
    return summaryObj;
  };

  // 1. Pecahan Per Tahun (gabungan disciplinaryCase + spAggregateMonthly)
  const casesByYearMap = {};
  allDiscCases.forEach(c => {
    const y = c.startDate ? new Date(c.startDate).getUTCFullYear() : numYear;
    if (!casesByYearMap[y]) casesByYearMap[y] = [];
    casesByYearMap[y].push(c);
  });

  const rekapByYearMap = {};
  allSpStoreRecords.forEach(r => {
    const y = r.period?.year || numYear;
    if (!rekapByYearMap[y]) rekapByYearMap[y] = [];
    rekapByYearMap[y].push(r);
  });

  const allSpYears = Array.from(new Set([
    ...Object.keys(casesByYearMap).map(Number),
    ...Object.keys(rekapByYearMap).map(Number)
  ])).sort((a, b) => b - a);

  const byYear = allSpYears.map(y => {
    const yearRef = y === numYear ? refDate : (y < today.getUTCFullYear() ? new Date(Date.UTC(y, 11, 31, 23, 59, 59)) : today);
    const summary = summarizeDisciplinaryList(casesByYearMap[y] || [], yearRef);
    const yearRekapRows = (rekapByYearMap[y] || []).filter(r => (y === numYear && month) ? (r.period?.month || 1) <= numMonth : true);
    applyStoreRekapToSummary(summary, yearRekapRows, y === numYear ? numMonth : 12, y >= numYear);
    return {
      year: y,
      total: summary.corporate.total,
      spAktif: summary.corporate.spAktif,
      spNonAktif: summary.corporate.spNonAktif,
      store: summary.store.total,
      hq: summary.hq.total,
      tataTertib: summary.corporate.tataTertib,
      nonTataTertib: summary.corporate.nonTataTertib,
      detail: summary
    };
  });

  // 2. Rekap Keseluruhan (All-Time tanpa filter tahun, mencakup Rekap SP Toko untuk tahun yang tidak ada di disciplinaryCase)
  const allTimeSummary = summarizeDisciplinaryList(allDiscCases, today);
  allSpYears.forEach(y => {
    const hasStoreDetailInYear = (casesByYearMap[y] || []).some(c => c.storeId !== null);
    if (!hasStoreDetailInYear && rekapByYearMap[y]?.length > 0) {
      const dummyYearSummary = summarizeDisciplinaryList([], today);
      applyStoreRekapToSummary(dummyYearSummary, rekapByYearMap[y], y === numYear ? numMonth : 12, y >= today.getUTCFullYear());
      allTimeSummary.store.total += dummyYearSummary.store.total;
      allTimeSummary.store.spAktif += dummyYearSummary.store.spAktif;
      allTimeSummary.store.spNonAktif += dummyYearSummary.store.spNonAktif;
      allTimeSummary.store.tataTertib += dummyYearSummary.store.tataTertib;
      allTimeSummary.store.nonTataTertib += dummyYearSummary.store.nonTataTertib;
      allTimeSummary.store.sp1 += dummyYearSummary.store.sp1;
      allTimeSummary.store.sp2 += dummyYearSummary.store.sp2;
      allTimeSummary.store.sp3 += dummyYearSummary.store.sp3;
      allTimeSummary.store.barat += dummyYearSummary.store.barat;
      allTimeSummary.store.timur += dummyYearSummary.store.timur;
    }
  });
  allTimeSummary.corporate.total = allTimeSummary.store.total + allTimeSummary.hq.total;
  allTimeSummary.corporate.spAktif = allTimeSummary.store.spAktif + allTimeSummary.hq.spAktif;
  allTimeSummary.corporate.spNonAktif = allTimeSummary.store.spNonAktif + allTimeSummary.hq.spNonAktif;
  allTimeSummary.corporate.tataTertib = allTimeSummary.store.tataTertib + allTimeSummary.hq.tataTertib;
  allTimeSummary.corporate.nonTataTertib = allTimeSummary.store.nonTataTertib + allTimeSummary.hq.nonTataTertib;
  allTimeSummary.corporate.sp1 = allTimeSummary.store.sp1 + allTimeSummary.hq.sp1;
  allTimeSummary.corporate.sp2 = allTimeSummary.store.sp2 + allTimeSummary.hq.sp2;
  allTimeSummary.corporate.sp3 = allTimeSummary.store.sp3 + allTimeSummary.hq.sp3;

  // 3. Data Utama Sesuai Filter spYear ('ALL' atau tahun terpilih)
  let activeSummary;
  if (isAllSpYear) {
    activeSummary = JSON.parse(JSON.stringify(allTimeSummary));
  } else {
    const filteredDiscCases = allDiscCases.filter(c => {
      if (!c.startDate) return false;
      const d = new Date(c.startDate);
      if (d.getUTCFullYear() !== targetSpYear) return false;
      if (targetSpYear === numYear && month) return d <= refDate;
      return true;
    });
    const activeCompareDate = targetSpYear === numYear ? refDate : new Date(Date.UTC(targetSpYear, 11, 31, 23, 59, 59));
    activeSummary = summarizeDisciplinaryList(filteredDiscCases, activeCompareDate);
    const spStoreRecords = (rekapByYearMap[targetSpYear] || []).filter(r =>
      (targetSpYear === numYear && month) ? (r.period?.month || 1) <= numMonth : true
    );
    applyStoreRekapToSummary(activeSummary, spStoreRecords, targetSpYear === numYear ? numMonth : 12, targetSpYear >= numYear);
  }

  const countDisputes = (list) => {
    const res = { total: list.length, selesai: 0, proses: 0, bipartit: 0, mediasi: 0, phi: 0 };
    list.forEach(c => {
      const cat = String(c.caseCategory || '').toUpperCase();
      const st = String(c.status || '').toUpperCase();

      if (st.includes('CLOSE') || st.includes('SELESAI')) {
        res.selesai++;
      } else {
        res.proses++;
      }

      if (cat.includes('MEDIASI') || cat.includes('DISNAKER') || cat.includes('PIHAK')) {
        res.mediasi++;
      } else if (cat.includes('PHI')) {
        res.phi++;
      } else if (cat.includes('BIPARTIT')) {
        res.bipartit++;
      }
    });
    return res;
  };

  // Poin 7: Matriks Perizinan Ketenagakerjaan (WLKP, PP, K3)
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
    spFilterYear: isAllSpYear ? 'ALL' : targetSpYear,
    totalSpIssued: activeSummary.corporate.total,
    corporateSp: activeSummary.corporate,
    storeSp: activeSummary.store,
    hqSp: activeSummary.hq,
    allTimeSp: allTimeSummary,
    byYear,
    disputes: {
      corporate: countDisputes(irCases),
      hq: countDisputes(irCases.filter(c => !c.storeId && !c.employee?.storeId)),
      store: countDisputes(irCases.filter(c => Boolean(c.storeId || c.employee?.storeId)))
    },
    overdueContracts: {
      corporate: overdueContracts.length,
      hq: overdueContracts.filter(e => !e.storeId).length,
      store: overdueContracts.filter(e => e.storeId).length
    },
    compliancePermits
  };
};

const getAvailableYears = async () => {
  const [periods, movements, discCases, irCases] = await Promise.all([
    prisma.reportingPeriod.findMany({
      where: {
        year: { gte: 2020, lte: 2100 },
        OR: [
          { employeeSnaps: { some: {} } },
          { salesMonthly: { some: {} } },
          { attendanceAggregate: { some: {} } },
          { spAggregateMonthly: { some: {} } },
          { kpiPositions: { some: {} } },
          { importBatches: { some: {} } }
        ]
      },
      select: { year: true },
      distinct: ['year']
    }),
    prisma.employeeMovement.findMany({ select: { movementDate: true } }),
    prisma.disciplinaryCase.findMany({ select: { startDate: true } }),
    prisma.industrialRelationCase.findMany({ select: { startDate: true } })
  ]);

  const yearSet = new Set();
  const addYear = (y) => {
    const n = Number(y);
    if (Number.isInteger(n) && n >= 2020 && n <= 2100) yearSet.add(n);
  };

  periods.forEach(p => addYear(p.year));
  movements.forEach(m => { if (m.movementDate) addYear(new Date(m.movementDate).getUTCFullYear()); });
  discCases.forEach(c => { if (c.startDate) addYear(new Date(c.startDate).getUTCFullYear()); });
  irCases.forEach(c => { if (c.startDate) addYear(new Date(c.startDate).getUTCFullYear()); });

  return Array.from(yearSet).sort((a, b) => b - a);
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
  getIndustrialAndSpSummary,
  getAvailableYears
};
