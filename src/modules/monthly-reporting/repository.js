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
      period: true // Agar tahu ini absensi bulan apa
    },
    orderBy: { 
      period: { periodStart: 'desc' } // Urutkan dari bulan terbaru ke terlama
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
      { period: { periodStart: 'desc' } }, // Urutkan bulan dulu
      { netSales: 'desc' }                 // Lalu urutkan sales tertinggi di bulan itu
    ]
  });
};

// --- 2. SNAPSHOT CLONING ENGINE ---
const getActiveEmployeesForSnapshot = async () => {
  return await prisma.employee.findMany({
    where: { status: 'ACTIVE', storeId: { not: null } }, // Pastikan hanya anak toko
    include: { position: true, store: true } // <-- Tambahkan store: true
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
const getOrCreateStore = async (storeName) => {
  const cleanName = String(storeName).trim();
  
  // 1. Cek apakah toko dengan nama ini sudah ada di database
  let store = await prisma.store.findFirst({
    where: { storeName: { equals: cleanName, mode: 'insensitive' } }
  });

  // 2. Jika belum ada, buat toko baru
  if (!store) {
    store = await prisma.store.create({
      data: {
        storeName: cleanName,
        storeCode: `STR-${Date.now()}` // Generate kode otomatis agar Prisma tidak error
      }
    });
  }
  
  // 3. Kembalikan ID-nya saja
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
  return await prisma.salesMonthly.createMany({ data: dataArray, skipDuplicates: true });
};

// --- 4. DASHBOARD AGGREGATION QUERIES ---
const getSnapshotsByPeriod = async (periodId) => {
  return await prisma.employeeMonthlySnapshot.findMany({ where: { periodId } });
};

const getLabourCostsByPeriod = async (periodId) => {
  return await prisma.labourCost.findMany({ where: { periodId } });
};

// Ambil Absensi Agregat
const getAttendanceByPeriod = async (periodId) => {
  return await prisma.attendanceAggregateMonthly.findUnique({
    where: { periodId: periodId }
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