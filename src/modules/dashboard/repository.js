const prisma = require('../../config/database');

// 1. Ambil Periode berdasarkan Tahun & Bulan (Jika bulan tersebut belum ada, fallback ke bulan terakhir di tahun itu)
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

// 2. Ambil Periode berdasarkan ID
const getPeriodById = async (periodId) => {
  return await prisma.reportingPeriod.findUnique({
    where: { id: periodId }
  });
};

// 3. Ambil Snapshot Karyawan (Dengan Auto-Fallback jika di bulan Oktober belum di-generate snapshot)
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

  // Fallback cerdas: Jika di periodId (misal bulan 10) snapshot masih kosong,
  // ambil snapshot dari bulan terakhir di tahun yang sama yang sudah memiliki isi (misal bulan 9)
  if (snapshots.length === 0 && year) {
    const latestPeriodWithSnap = await prisma.reportingPeriod.findFirst({
      where: {
        year: parseInt(year, 10),
        employeeSnapshots: { some: {} }
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

  // Saring hanya karyawan valid (blokir sisa snapshot hantu jika masih ada di periode lain)
  return snapshots.filter(s => s.employee && s.employee.gender !== null && s.employee.baseSalary !== null);
};

const getLatestPeriodByYear = async (year) => {
  return await prisma.reportingPeriod.findFirst({
    where: { year: parseInt(year, 10) },
    orderBy: { month: 'desc' }
  });
};

// 4. Ambil Absensi Agregat (FIXED: Menggunakan findFirst + Mendukung Filter Scope HQ / STORE)
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

  // Fallback jika di bulan yang diminta belum ada absensi, ambil bulan terakhir di tahun yang sama
  if (!attendance && year) {
    const latestAttPeriod = await prisma.reportingPeriod.findFirst({
      where: {
        year: parseInt(year, 10),
        attendanceAggregates: { some: {} }
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

// 5. Ambil Sales per Periode (Dengan Auto-Fallback ke bulan terakhir yang punya sales valid di tahun tersebut, misal Juli 2026)
const getSalesByPeriod = async (periodId, year = null) => {
  let sales = await prisma.salesMonthly.findMany({
    where: { periodId },
    include: { store: true },
    orderBy: { netSales: 'desc' }
  });

  // Saring baris rekap "TOTAL" & toko dummy testing
  let validSales = sales.filter(s => {
    const name = String(s.store?.storeName || '').toUpperCase().trim();
    return name !== 'TOTAL' && name !== 'STORE SUDIRMAN';
  });

  // Jika di bulan 9/10 sales masih kosong, otomatis ambil dari bulan terakhir yang ada transaksi di tahun tersebut (Juli 2026)
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

// 6. Ambil Karyawan Toko Murni (19 orang dari demografi toko)
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

// 7. Ambil Data Turnover (Mendukung Filter Scope Corporate / HQ / Store)
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

// 8. Ambil Kontrak yang Akan Habis (Mendukung Filter Scope)
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

module.exports = {
  getPeriodByDate,
  getPeriodById,
  getMonthlySnapshots,
  getAttendanceByPeriod,
  getSalesByPeriod,
  getActiveEmployeesForSnapshot,
  getTurnoverMovements,
  getExpiringContracts,
  getLatestPeriodByYear
};