const prisma = require('../../config/database');
const { findStoreById } = require('../store/repository');

// --- 1. PERIOD MANAGEMENT ---
const findPeriodByYearMonth = async (year, month) => {
  return await prisma.reportingPeriod.findUnique({
    where: { year_month: { year: parseInt(year), month: parseInt(month) } }
  });
};

const findPeriodById = async (id) => {
  return await prisma.reportingPeriod.findUnique({ where: { id } });
};

const createPeriod = async (data) => {
  return await prisma.reportingPeriod.create({ data });
};

const getAllPeriods = async () => {
  return await prisma.reportingPeriod.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }] });
};

const getAllAttendance = async () => {
  return await prisma.attendanceAggregateMonthly.findMany({
    include: { 
      period: true
    },
    orderBy: { 
      period: { periodStart: 'desc' } 
    }
  });
};

const getAllSales = async () => {
  return await prisma.salesMonthly.findMany({
    include: { 
      period: true, 
      store: true // Tampilkan info bulan dan info toko sekaligus
    },
    orderBy: [
      { period: { periodStart: 'desc' } },
      { netSales: 'desc' }
    ]
  });
};

// SNAPSHOT CLONING ENGINE
const getActiveEmployeesForSnapshot = async (scope = 'ALL') => {
  const whereClause = {
    status: 'ACTIVE',
    birthDate: {not: null},
    gender: { not: null },
    baseSalary: { not: null, gt: 0 }
  };

  // 2. Pisahkan HO vs Toko secara otomatis sesuai kebutuhan pemanggil!
  if (scope === 'STORE') {
    whereClause.storeId = { not: null };
  } else if (scope === 'HQ') {
    whereClause.storeId = null;
  }

  return await prisma.employee.findMany({
    where: whereClause,
    include: {
      division: true,
      department: true,
      position: true,
      store: true
    }
  });
};

const bulkCreateSnapshots = async (snapshotDataArray) => {
  return await prisma.employeeMonthlySnapshot.createMany({
    data: snapshotDataArray,
    skipDuplicates: true 
  });
};

const upsertAttendanceAggregate = async (periodId, scope, data) => {
  return await prisma.attendanceAggregateMonthly.upsert({
    where: {
      periodId_scope: {
        periodId: periodId,
        scope: scope
      }
    },
    update: data,
    create: {
      periodId,
      scope,
      ...data
    }
  });
};

// Fungsi Sakti: Cari toko, kalau tidak ada otomatis buat baru
const getOrCreateStore = async (storeName, region = null, storeType = null) => {
  const cleanName = String(storeName).trim().toUpperCase();
  const cleanRegion = region ? String(region).trim().toUpperCase() : null;
  const cleanType = storeType ? String(storeType).trim().toUpperCase() : null;
  
  // 1. Cek apakah toko dengan nama ini sudah ada di database
  let store = await prisma.store.findFirst({
    where: { storeName: { equals: cleanName, mode: 'insensitive' } }
  });

  // 2. Jika belum ada, buat toko baru; jika ada dan atribut baru tersedia, perbarui
  if (!store) {
    store = await prisma.store.create({
      data: {
        storeName: cleanName,
        storeCode: `STR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        region: cleanRegion,
        storeType: cleanType
      }
    });
  } else if ((cleanRegion && store.region !== cleanRegion) || (cleanType && store.storeType !== cleanType)) {
    store = await prisma.store.update({
      where: { id: store.id },
      data: {
        region: cleanRegion || store.region,
        storeType: cleanType || store.storeType
      }
    });
  }
  return store.id;
};

const getAttendanceAggregate = async (periodId) => {
  return await prisma.attendanceAggregateMonthly.findUnique({ where: { periodId } });
};

// Fungsi update actual labour cost per karyawan (dipanggil Promise.all dari service)
const updateSnapshotActualCost = async (periodId, employeeId, actualAmount) => {
  return await prisma.employeeMonthlySnapshot.update({
    where: { periodId_employeeId: { periodId, employeeId } }, // Memanfaatkan @@unique
    data: { actualLabourCost: actualAmount }
  });
};

// Tarik data NIK master untuk "Kamus In-Memory"
const getAllEmployeesNik = async () => {
  return await prisma.employee.findMany({ select: { id: true, nik: true } });
};

const bulkCreateSales = async (dataArray) => {
  if (!dataArray || dataArray.length === 0) return { count: 0 };
  await prisma.$transaction(
    dataArray.map(item =>
      prisma.salesMonthly.upsert({
        where: {
          periodId_storeId: {
            periodId: item.periodId,
            storeId: item.storeId
          }
        },
        update: {
          salesQty: item.salesQty,
          netSales: item.netSales,
          ...(item.targetSales !== undefined ? { targetSales: item.targetSales } : {})
        },
        create: item
      })
    )
  );
  return { count: dataArray.length };
};

// DASHBOARD AGGREGATION QUERIES
const getSnapshotsByPeriod = async (periodId) => {
  return await prisma.employeeMonthlySnapshot.findMany({ where: { periodId } });
};

const getLabourCostsByPeriod = async (periodId) => {
  return await prisma.labourCost.findMany({ where: { periodId } });
};

// Ambil Absensi Agregat (Aman untuk 1 parameter periodId maupun 2 parameter dengan scope)
const getAttendanceByPeriod = async (periodId, scope = null) => {
  const whereClause = { periodId };

  // Jika nanti dikirim filter scope ('HQ' atau 'STORE'), saring sesuai scope
  if (scope && scope.toUpperCase() !== 'CORPORATE') {
    whereClause.scope = scope.toUpperCase().includes('HQ') ? 'HQ' : 'STORE';
  }
  return await prisma.attendanceAggregateMonthly.findFirst({
    where: whereClause,
    orderBy: { createdAt: 'desc' }
  });
};

// Ambil Sales dan sertakan relasi Toko (Store)
const getSalesByPeriod = async (periodId) => {
  return await prisma.salesMonthly.findMany({
    where: { periodId: periodId },
    include: {
      store: true // Menampilkan detail nama toko
    },
    orderBy: {
      netSales: 'desc' // Urutkan dari penjualan tertinggi
    }
  });
};

const getMovementsByDateRange = async (startDate, endDate) => {
  return await prisma.employeeMovement.findMany({
    where: {
      movementDate: { gte: startDate, lte: endDate }
    }
  });
};

module.exports = {
  findPeriodByYearMonth, findPeriodById, createPeriod, getAllPeriods,
  getActiveEmployeesForSnapshot, bulkCreateSnapshots,
  upsertAttendanceAggregate, getOrCreateStore, getAttendanceAggregate, 
  updateSnapshotActualCost, getAllEmployeesNik, bulkCreateSales,
  getSnapshotsByPeriod, getLabourCostsByPeriod, getSalesByPeriod,
  getMovementsByDateRange, getAllSales, getAllAttendance, getAttendanceByPeriod
};
