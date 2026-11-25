require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const xlsx = require('xlsx');

const app = require('../src/app');
const prisma = require('../src/config/database');
const { validateImportFile } = require('../src/utils/importValidator');
const {
  IMPORT_MODULES,
  enforcePeriodPolicy,
  summarizeDetectedPeriods
} = require('../src/utils/importBatch');

const TEMP_DIR = path.join(__dirname, '.tmp-import-tests');
const TEST_YEAR = 2099;

// Load template definitions directly from frontend source so tests stay 100% synced with FE templates
function loadFeTemplates() {
  const demoPath = path.resolve(__dirname, '../../biensi_fe/src/services/templateDemographyData.ts');
  const svcPath = path.resolve(__dirname, '../../biensi_fe/src/services/template.service.ts');

  const demoSrc = fs.readFileSync(demoPath, 'utf8')
    .replace(/export const DEMOGRAFI_HO_TEMPLATE_ROWS:\s*any\[\]\[\]\s*=/, 'const DEMOGRAFI_HO_TEMPLATE_ROWS =')
    .replace(/export const DEMOGRAFI_TOKO_TEMPLATE_ROWS:\s*any\[\]\[\]\s*=/, 'const DEMOGRAFI_TOKO_TEMPLATE_ROWS =');

  const svcRaw = fs.readFileSync(svcPath, 'utf8');
  const startIdx = svcRaw.indexOf('export const RECRUITMENT_KPI_TEMPLATE_ROWS');
  const endIdx = svcRaw.indexOf('async function exportWorkbookWithExcelJS');
  const svcSnippet = svcRaw
    .slice(startIdx, endIdx)
    .replace(/export const RECRUITMENT_KPI_TEMPLATE_ROWS:\s*any\[\]\[\]\s*=/, 'const RECRUITMENT_KPI_TEMPLATE_ROWS =')
    .replace(/export interface TemplateDefinition\s*\{[\s\S]*?\n\}/, '')
    .replace(/const TEMPLATE_DEFINITIONS:\s*Record<string,\s*TemplateDefinition>\s*=/, 'const TEMPLATE_DEFINITIONS =');

  const fn = new Function(`${demoSrc}\n${svcSnippet}\nreturn { TEMPLATE_DEFINITIONS, DEMOGRAFI_HO_TEMPLATE_ROWS, DEMOGRAFI_TOKO_TEMPLATE_ROWS };`);
  return fn();
}

function writeWorkbookFile(fileName, sheets) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const wb = xlsx.utils.book_new();
  for (const s of sheets) {
    const ws = xlsx.utils.aoa_to_sheet(s.rows);
    xlsx.utils.book_append_sheet(wb, ws, s.sheetName.slice(0, 31));
  }
  const fullPath = path.join(TEMP_DIR, fileName);
  xlsx.writeFile(wb, fullPath);
  return fullPath;
}

function writeCsvFile(fileName, rows) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          const str = String(cell);
          return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(',')
    )
    .join('\n');
  const fullPath = path.join(TEMP_DIR, fileName);
  fs.writeFileSync(fullPath, csv, 'utf8');
  return fullPath;
}

async function requestJson(baseUrl, urlPath, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${urlPath}`, { method, headers, body });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function uploadMultipart(baseUrl, urlPath, filePath, token, fields = {}) {
  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const mime =
    ext === '.csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  form.append('file', new Blob([buf], { type: mime }), fileName);
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, String(v));
  }
  return requestJson(baseUrl, urlPath, { method: 'POST', token, body: form });
}

async function cleanupTest2099Data() {
  const testEmpNos = [
    'TST99HO01', 'TST99HO02', 'TST99HO01-HO',
    'TST99ST01', 'TST99ST02', 'TST99ST01-STR', 'TST99ST02-STR',
    'TST99CSV1', 'TST99CSV2',
    'TST99MV01', 'TST99MV02', 'TST99MV03', 'TST99MV04',
    'TST99SP01', 'TST99SP02', 'TST99SP03', 'TST99SP03-STR',
    'TST99FR01',
    'TST99BP01', 'TST99BP02'
  ];
  const testStoreNames = [
    'TST99 SHOWROOM MAKASSAR',
    'TST99 FS PALANGKARAYA',
    'TST99 SHOWROOM BEKASI',
    'TST99 COUNTER TASIK'
  ];

  const periods2099 = await prisma.reportingPeriod.findMany({
    where: { year: TEST_YEAR },
    select: { id: true }
  });
  const periodIds = periods2099.map((p) => p.id);

  const testEmps = await prisma.employee.findMany({
    where: {
      OR: [
        { employeeNo: { in: testEmpNos } },
        { fullName: { startsWith: 'TST99 ' } }
      ]
    },
    select: { id: true }
  });
  const empIds = testEmps.map((e) => e.id);

  const testStores = await prisma.store.findMany({
    where: { storeName: { in: testStoreNames } },
    select: { id: true }
  });
  const storeIds = testStores.map((s) => s.id);

  await prisma.importBatch.deleteMany({
    where: {
      OR: [
        { periodYear: TEST_YEAR },
        ...(periodIds.length ? [{ periodId: { in: periodIds } }] : []),
        { fileName: { startsWith: 'TST99_' } }
      ]
    }
  });

  if (periodIds.length > 0) {
    await prisma.employeeMonthlySnapshot.deleteMany({ where: { periodId: { in: periodIds } } });
    await prisma.attendanceAggregateMonthly.deleteMany({ where: { periodId: { in: periodIds } } });
    await prisma.salesMonthly.deleteMany({ where: { periodId: { in: periodIds } } });
    await prisma.spAggregateMonthly.deleteMany({ where: { periodId: { in: periodIds } } });
  }

  await prisma.fraudCase.deleteMany({
    where: {
      OR: [
        ...(empIds.length ? [{ employeeId: { in: empIds } }] : []),
        ...(storeIds.length ? [{ storeId: { in: storeIds } }] : []),
        { remark: { contains: 'TST99' } }
      ]
    }
  });

  await prisma.disciplinaryCase.deleteMany({
    where: {
      OR: [
        ...(empIds.length ? [{ employeeId: { in: empIds } }] : []),
        { referenceNo: { startsWith: 'TST99' } }
      ]
    }
  });

  await prisma.industrialRelationCase.deleteMany({
    where: {
      OR: [
        ...(empIds.length ? [{ employeeId: { in: empIds } }] : []),
        { description: { contains: 'TST99' } }
      ]
    }
  });

  await prisma.employeeMovement.deleteMany({
    where: {
      OR: [
        ...(empIds.length ? [{ employeeId: { in: empIds } }] : []),
        { movementDate: { gte: new Date('2099-01-01T00:00:00Z'), lte: new Date('2099-12-31T23:59:59Z') } }
      ]
    }
  });

  await prisma.storeCompliance.deleteMany({
    where: {
      OR: [
        { entityName: 'TST99_ENTITY' },
        { notes: { contains: 'TST99' } },
        ...(storeIds.length ? [{ storeId: { in: storeIds } }] : [])
      ]
    }
  });

  if (empIds.length > 0) {
    await prisma.employee.deleteMany({ where: { id: { in: empIds } } });
  }
  if (storeIds.length > 0) {
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  }
  if (periodIds.length > 0) {
    await prisma.reportingPeriod.deleteMany({ where: { id: { in: periodIds } } });
  }
}

let server;
let baseUrl;
let adminToken;
let feTemplates;

test.before(async () => {
  await cleanupTest2099Data();
  feTemplates = loadFeTemplates();

  const adminUser = await prisma.user.findFirst({
    where: { roleId: 1, isActive: true },
    select: { id: true, email: true, roleId: true }
  });
  assert.ok(adminUser, 'Super Admin user must exist in DB');

  adminToken = jwt.sign(
    { id: adminUser.id, email: adminUser.email, roleId: adminUser.roleId },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
      resolve();
    });
  });
});

test.after(async () => {
  await cleanupTest2099Data();
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await prisma.$disconnect();
});

test('Unit: enforcePeriodPolicy & summarizeDetectedPeriods (STRICT_SINGLE vs MULTI_CONFIRM)', () => {
  const summary = summarizeDetectedPeriods(['2099-07', '2099-08'], [
    { periodKey: '2099-07', label: 'Baris 2' },
    { periodKey: '2099-07', label: 'Baris 3' },
    { periodKey: '2099-08', label: 'Baris 4' }
  ]);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].key, '2099-07');
  assert.equal(summary[0].count, 2);
  assert.equal(summary[1].label, 'Agustus 2099');

  // Demografi: 1 sheet + 1 month allowed
  const singleOk = enforcePeriodPolicy({
    mode: 'STRICT_SINGLE',
    sheets: ['Master Data Demografi HO'],
    detectedPeriods: ['2099-07']
  });
  assert.equal(singleOk.allowed, true);
  assert.equal(singleOk.requiresConfirmation, false);

  // Demografi: >1 sheet rejected hard
  const multiSheet = enforcePeriodPolicy({
    mode: 'STRICT_SINGLE',
    sheets: ['Master Data Demografi HO', 'Demografi Toko'],
    detectedPeriods: ['2099-07']
  });
  assert.equal(multiSheet.allowed, false);
  assert.equal(multiSheet.code, 'MULTI_SHEET_NOT_ALLOWED');
  assert.equal(multiSheet.requiresConfirmation, false);

  // Demografi: >1 month rejected hard
  const multiMonthDemo = enforcePeriodPolicy({
    mode: 'STRICT_SINGLE',
    sheets: ['Master Data Demografi HO'],
    detectedPeriods: ['2099-07', '2099-08']
  });
  assert.equal(multiMonthDemo.allowed, false);
  assert.equal(multiMonthDemo.code, 'DEMOGRAPHY_MULTI_MONTH_REJECTED');
  assert.equal(multiMonthDemo.requiresConfirmation, false);

  // Modul Umum: multi-bulan butuh konfirmasi 2 tahap
  const step1 = enforcePeriodPolicy({
    mode: 'MULTI_CONFIRM',
    sheets: ['TurnOver2026HO'],
    detectedPeriods: ['2099-01', '2099-02'],
    confirmStep: 0
  });
  assert.equal(step1.allowed, false);
  assert.equal(step1.requiresConfirmation, true);
  assert.equal(step1.confirmStep, 1);
  assert.equal(step1.totalConfirmSteps, 2);

  const step2 = enforcePeriodPolicy({
    mode: 'MULTI_CONFIRM',
    sheets: ['TurnOver2026HO'],
    detectedPeriods: ['2099-01', '2099-02'],
    confirmStep: 1
  });
  assert.equal(step2.allowed, false);
  assert.equal(step2.requiresConfirmation, true);
  assert.equal(step2.confirmStep, 2);

  const allowed = enforcePeriodPolicy({
    mode: 'MULTI_CONFIRM',
    sheets: ['TurnOver2026HO'],
    detectedPeriods: ['2099-01', '2099-02'],
    confirmStep: 2
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.requiresConfirmation, false);
});

test('Template Validation: all FE template definitions pass dry-run structure & format checks', async () => {
  const { TEMPLATE_DEFINITIONS } = feTemplates;
  const moduleKeys = ['demografi_ho', 'demografi_store', 'movement', 'compliance', 'sp', 'fraud', 'bipartit', 'attendance', 'sales'];

  for (const key of moduleKeys) {
    const def = TEMPLATE_DEFINITIONS[key];
    assert.ok(def, `Template definition missing for ${key}`);
    const validatorKey = key.startsWith('demografi') ? 'employees' : key;
    const filePath = writeWorkbookFile(`TPL_${def.fileName}`, def.sheets);
    const report = await validateImportFile(validatorKey, filePath, def.fileName);

    assert.equal(report.issues.headerErrors.length, 0, `${key} headerErrors: ${report.issues.headerErrors.join('; ')}`);
    assert.equal(report.issues.rowErrors.length, 0, `${key} rowErrors: ${report.issues.rowErrors.join('; ')}`);
    assert.equal(report.issues.fileDuplicates.length, 0, `${key} fileDuplicates: ${report.issues.fileDuplicates.join('; ')}`);
    assert.ok(report.summary.totalRows > 0, `${key} should have > 0 totalRows`);
    assert.ok(report.periodPolicy, `${key} should return periodPolicy`);
  }
});

test('E2E: Demografi HO & Store strict single-month rules, CSV, import status, & Dashboard sync', async () => {
  const hoHeader = feTemplates.DEMOGRAFI_HO_TEMPLATE_ROWS[0];
  const storeHeader = feTemplates.DEMOGRAFI_TOKO_TEMPLATE_ROWS[0];

  // 1. Reject 2-sheet Demografi file
  const twoSheetFile = writeWorkbookFile('TST99_Demografi_2Sheet.xlsx', [
    {
      sheetName: 'Master Data Demografi HO',
      rows: [
        hoHeader,
        ['TST99HO01', 1, 'Juli', TEST_YEAR, 'BUSINESS SUPPORT', 'HR & GA', 'GA', 'TST99 ANDI HO', 'GA STAFF', 'STAFF', 'LAKI - LAKI', '1990-05-06', 1, '2020-01-01', '-', 'TETAP', 'S1', 10000000, 'Terdaftar', 'Terdaftar']
      ]
    },
    {
      sheetName: 'Demografi Toko',
      rows: [
        storeHeader,
        ['TST99ST01', 1, 'Juli', TEST_YEAR, 'COMMERCIAL BUSINESS', 'SALES OFFLINE', 'TST99 SHOWROOM MAKASSAR', 'TIMUR', 'SHOWROOM', 'TST99 SARI TOKO', 'STORE LEADER', 'LEADER', 'PEREMPUAN', '1995-08-26', 1, '2021-01-01', '-', 'TETAP', 'SMA', 7000000, 'Terdaftar', 'Terdaftar']
      ]
    }
  ]);
  const resTwoSheet = await uploadMultipart(baseUrl, '/employees/import', twoSheetFile, adminToken);
  assert.equal(resTwoSheet.status, 400);
  assert.equal(resTwoSheet.json.periodPolicy.code, 'MULTI_SHEET_NOT_ALLOWED');

  // 2. Reject mixed-month Demografi file
  const mixedMonthFile = writeWorkbookFile('TST99_Demografi_MixedMonth.xlsx', [
    {
      sheetName: 'Master Data Demografi HO',
      rows: [
        hoHeader,
        ['TST99HO01', 1, 'Juli', TEST_YEAR, 'BUSINESS SUPPORT', 'HR & GA', 'GA', 'TST99 ANDI HO', 'GA STAFF', 'STAFF', 'LAKI - LAKI', '1990-05-06', 1, '2020-01-01', '-', 'TETAP', 'S1', 10000000, 'Terdaftar', 'Terdaftar'],
        ['TST99HO02', 2, 'Agustus', TEST_YEAR, 'BUSINESS SUPPORT', 'HR & GA', 'GA', 'TST99 BUDI HO', 'GA STAFF', 'STAFF', 'PEREMPUAN', '1992-05-06', 1, '2020-01-01', '-', 'TETAP', 'S1', 8000000, 'Terdaftar', 'Terdaftar']
      ]
    }
  ]);
  const resMixed = await uploadMultipart(baseUrl, '/employees/import', mixedMonthFile, adminToken);
  assert.equal(resMixed.status, 400);
  assert.equal(resMixed.json.periodPolicy.code, 'DEMOGRAPHY_MULTI_MONTH_REJECTED');

  // 3. Import valid Demografi HO (Juli 2099)
  const hoFileName = 'TST99_Demografi_HO_Juli_2099.xlsx';
  const hoFile = writeWorkbookFile(hoFileName, [
    {
      sheetName: 'Master Data Demografi HO',
      rows: [
        hoHeader,
        ['TST99HO01', 1, 'Juli', TEST_YEAR, 'BUSINESS SUPPORT', 'HR & GA', 'GA', 'TST99 ANDI HO', 'GA STAFF', 'STAFF', 'LAKI - LAKI', '1990-05-06', 1, '2020-01-01', '-', 'TETAP', 'S1', 10000000, 'Terdaftar', 'Terdaftar'],
        ['TST99HO02', 2, 'Juli', TEST_YEAR, 'SUPPLY CHAIN', 'PRODUCTION', 'CM & CMT', 'TST99 BUDI HO', 'HEAD PRODUCTION', 'HEAD', 'PEREMPUAN', '1988-03-10', 1, '2019-01-01', '-', 'KONTRAK', 'S1', 15000000, 'Terdaftar', 'Tidak Terdaftar']
      ]
    }
  ]);
  const hoDry = await uploadMultipart(baseUrl, '/import/validate/employees', hoFile, adminToken);
  assert.equal(hoDry.status, 200);
  assert.equal(hoDry.json.canProceed, true);
  assert.equal(hoDry.json.periodPolicy.allowed, true);

  const hoCommit = await uploadMultipart(baseUrl, '/employees/import', hoFile, adminToken);
  assert.equal(hoCommit.status, 200);
  assert.equal(hoCommit.json.success, true);
  assert.equal(hoCommit.json.data.fileName, hoFileName);
  assert.equal(hoCommit.json.data.sukses, 2);

  // 4. Import valid Demografi Store (Juli 2099)
  const storeFileName = 'TST99_Demografi_Toko_Juli_2099.xlsx';
  const storeFile = writeWorkbookFile(storeFileName, [
    {
      sheetName: 'Demografi Toko',
      rows: [
        storeHeader,
        ['TST99ST01', 1, 'Juli', TEST_YEAR, 'COMMERCIAL BUSINESS', 'SALES OFFLINE', 'TST99 SHOWROOM MAKASSAR', 'TIMUR', 'SHOWROOM', 'TST99 SARI TOKO', 'STORE LEADER', 'LEADER', 'PEREMPUAN', '1995-08-26', 1, '2021-01-01', '-', 'TETAP', 'SMA', 7000000, 'Sudah Terdaftar', 'Sudah Terdaftar'],
        ['TST99ST02', 2, 'Juli', TEST_YEAR, 'COMMERCIAL BUSINESS', 'SALES OFFLINE', 'TST99 FS PALANGKARAYA', 'TIMUR', 'FAMILY STORE', 'TST99 RUDI TOKO', 'CASHIER', 'KASIR', 'LAKI - LAKI', '1999-01-12', 1, '2023-02-01', '-', 'KONTRAK', 'SMA', 5000000, 'Sudah Terdaftar', 'Sudah Terdaftar']
      ]
    }
  ]);
  const storeCommit = await uploadMultipart(baseUrl, '/employees/import', storeFile, adminToken);
  assert.equal(storeCommit.status, 200);
  assert.equal(storeCommit.json.success, true);
  assert.equal(storeCommit.json.data.fileName, storeFileName);
  assert.equal(storeCommit.json.data.sukses, 2);

  // 5. Import CSV Demografi (Februari 2099) matching user's 20-col CSV format
  const csvFile = writeCsvFile('TST99_Demografi_Feb_2099.csv', [
    hoHeader,
    ['TST99CSV1', 1, 'Februari', TEST_YEAR, 'COMMERCIAL BUSINESS', 'R&D DESIGN', 'R&D DESIGN', 'TST99 CSV ONE', 'SENIOR DESIGNER', 'STAFF', 'PEREMPUAN', '1990-12-31', 1, '2019-06-12', '', 'KONTRAK', 'S1', 6000000, 'Terdaftar', 'Terdaftar'],
    ['TST99CSV2', 2, 'Februari', TEST_YEAR, 'BUSINESS SUPPORT', 'HR, GA & LEGAL', 'GA', 'TST99 CSV TWO', 'DRIVER', 'OPR', 'LAKI - LAKI', '1988-01-31', 1, '2021-10-26', '', 'KONTRAK', 'SMA', 4000000, 'Terdaftar', 'Tidak Terdaftar']
  ]);
  const csvCommit = await uploadMultipart(baseUrl, '/employees/import', csvFile, adminToken);
  assert.equal(csvCommit.status, 200);
  assert.equal(csvCommit.json.success, true);
  assert.equal(csvCommit.json.data.sukses, 2);

  // 6. Verify /import/status for DEMOGRAFI_HO & DEMOGRAFI_STORE
  const statusHo = await requestJson(baseUrl, `/import/status?module=${IMPORT_MODULES.DEMOGRAFI_HO}&year=${TEST_YEAR}`, { token: adminToken });
  assert.equal(statusHo.status, 200);
  const juliHo = statusHo.json.data.months.find((m) => m.month === 7);
  const febHo = statusHo.json.data.months.find((m) => m.month === 2);
  const marHo = statusHo.json.data.months.find((m) => m.month === 3);
  assert.equal(juliHo.status, 'SUDAH_DIINPUT');
  assert.equal(juliHo.fileName, hoFileName);
  assert.equal(febHo.status, 'SUDAH_DIINPUT');
  assert.equal(febHo.fileName, 'TST99_Demografi_Feb_2099.csv');
  assert.equal(marHo.status, 'BELUM_DIINPUT');
  assert.equal(marHo.fileName, null);

  const statusStore = await requestJson(baseUrl, `/import/status?module=${IMPORT_MODULES.DEMOGRAFI_STORE}&year=${TEST_YEAR}`, { token: adminToken });
  assert.equal(statusStore.status, 200);
  const juliStore = statusStore.json.data.months.find((m) => m.month === 7);
  assert.equal(juliStore.status, 'SUDAH_DIINPUT');
  assert.equal(juliStore.fileName, storeFileName);

  // 7. Verify Dashboard summary reflects HO + Store + Corporate accurately
  const dashCorp = await requestJson(baseUrl, `/dashboard/summary?year=${TEST_YEAR}&month=7&scope=Corporate`, { token: adminToken });
  assert.equal(dashCorp.status, 200);
  assert.equal(dashCorp.json.data.summary.demographics.totalHeadcount, 4);
  assert.equal(dashCorp.json.data.summary.demographics.hqHeadcount, 2);
  assert.equal(dashCorp.json.data.summary.demographics.storeHeadcount, 2);
  assert.equal(dashCorp.json.data.summary.productivity.totalActualCost, 37000000);

  const dashHq = await requestJson(baseUrl, `/dashboard/summary?year=${TEST_YEAR}&month=7&scope=HQ`, { token: adminToken });
  assert.equal(dashHq.status, 200);
  assert.equal(dashHq.json.data.summary.demographics.totalHeadcount, 2);
  assert.equal(dashHq.json.data.summary.productivity.totalActualCost, 25000000);
});

test('E2E: All General Modules (Movement, Compliance, SP, Fraud, Bipartit, Attendance, Sales) -> 2-step confirm & Dashboard', async () => {
  const { TEMPLATE_DEFINITIONS } = feTemplates;

  // 1. MOVEMENT (Multi-month: Jan, Feb, Aug 2099 -> must require 2-step verification)
  const movFileName = 'TST99_Turnover_2099.xlsx';
  const movFile = writeWorkbookFile(movFileName, [
    {
      sheetName: 'TurnOver2026HO',
      rows: [
        TEMPLATE_DEFINITIONS.movement.sheets[0].rows[0],
        [1, TEST_YEAR, 'Agustus', 'COMMERCIAL BUSINESS', 'PROMOTION', 1, 'TST99MV01', 'TST99 MITA', 'HOST LIVE', 'STAFF', '2024-08-12', '2099-08-13', 1, '0 Tahun 0 Bulan', 'Mengundurkan Diri', 'Tidak ada kabar', 'Voluntary', 'Voluntary', 'Tidak ada kabar', 'Tidak ada kabar', 'Voluntary'],
        [2, TEST_YEAR, 'Agustus', 'SUPPLY CHAIN', 'R&D DESIGN', 1, 'TST99MV02', 'TST99 DAFINA', 'STAFF OF DESIGN', 'STAFF', '2023-01-15', '2099-08-20', 948, '2 Tahun 7 Bulan', 'Mengundurkan Diri', 'Mendapat Tawaran Lain', 'Voluntary', 'Voluntary', 'Pindah Kerja', 'Pindah Kerja', 'Voluntary']
      ]
    },
    {
      sheetName: 'TurnOverToko2026',
      rows: [
        TEMPLATE_DEFINITIONS.movement.sheets[1].rows[0],
        [1, TEST_YEAR, 'Januari', 'COMMERCIAL BUSINESS', 'SALES OFFLINE', 'TST99 FS PALANGKARAYA', 'TIMUR', 1, 'TST99MV03', 'TST99 ANDI MOVE', 'SALES ADVISOR', 'STAFF', '2024-03-01', '2099-01-15', 685, '1 Tahun 10 Bulan', 'Mengundurkan Diri', 'Mendapatkan Pekerjaan Lain', 'Voluntary', 'Voluntary', 'Pindah Kerja', 'Mendapat tawaran lain', 'Voluntary'],
        [2, TEST_YEAR, 'Februari', 'COMMERCIAL BUSINESS', 'SALES OFFLINE', 'TST99 SHOWROOM MAKASSAR', 'TIMUR', 1, 'TST99MV04', 'TST99 RINA MOVE', 'CASHIER', 'STAFF', '2023-05-10', '2099-02-28', 1024, '2 Tahun 9 Bulan', 'Habis Kontrak', 'Habis Kontrak', 'Involuntary', 'Involuntary', 'Habis Kontrak', 'Habis Kontrak', 'Involuntary']
      ]
    }
  ]);

  const movDry = await uploadMultipart(baseUrl, '/import/validate/movement', movFile, adminToken);
  assert.equal(movDry.status, 200);
  assert.equal(movDry.json.canProceed, true);
  assert.equal(movDry.json.periodPolicy.requiresConfirmation, true);

  const movStep1 = await uploadMultipart(baseUrl, '/movement/bulk-upload', movFile, adminToken, { confirmStep: 0 });
  assert.equal(movStep1.status, 200);
  assert.equal(movStep1.json.requiresConfirmation, true);
  assert.equal(movStep1.json.confirmStep, 1);

  const movStep2 = await uploadMultipart(baseUrl, '/movement/bulk-upload', movFile, adminToken, { confirmStep: 1 });
  assert.equal(movStep2.status, 200);
  assert.equal(movStep2.json.requiresConfirmation, true);
  assert.equal(movStep2.json.confirmStep, 2);

  const movCommit = await uploadMultipart(baseUrl, '/movement/bulk-upload?confirmStep=2', movFile, adminToken, { confirmStep: 2 });
  assert.equal(movCommit.status, 201);
  assert.equal(movCommit.json.success, true);
  assert.equal(movCommit.json.data.sukses, 4);

  const movStatus = await requestJson(baseUrl, `/import/status?module=${IMPORT_MODULES.MOVEMENT}&year=${TEST_YEAR}`, { token: adminToken });
  assert.equal(movStatus.json.data.months.find((m) => m.month === 1).fileName, movFileName);
  assert.equal(movStatus.json.data.months.find((m) => m.month === 2).fileName, movFileName);
  assert.equal(movStatus.json.data.months.find((m) => m.month === 8).fileName, movFileName);

  // 2. COMPLIANCE (Single-month: Oct 2099)
  const compFileName = 'TST99_Compliance_2099.xlsx';
  const compFile = writeWorkbookFile(compFileName, [
    {
      sheetName: 'WLKP dll',
      rows: [
        TEMPLATE_DEFINITIONS.compliance.sheets[0].rows[0],
        [1, 'TST99_ENTITY', 'WLKP', null, 'TST99 Pelaporan WLKP Online', 'HO', null, null, 'HR Compliance', 'Aktif', 0, 'TST99 monitoring'],
        [2, 'TST99_ENTITY', 'PP', 'TST99 SHOWROOM MAKASSAR', 'TST99 Peraturan Perusahaan', 'TST99 SHOWROOM MAKASSAR', '04-Oct-2099', '20-Oct-2099', 'HR Service', 'Aktif', 365, 'TST99 pp']
      ]
    }
  ]);
  const compCommit = await uploadMultipart(baseUrl, '/compilance/import', compFile, adminToken);
  assert.equal(compCommit.status, 200);
  assert.equal(compCommit.json.success, true);
  assert.equal(compCommit.json.data.successCount, 2);

  // 3. SP (HO & Toko, Single-month: Jan 2099)
  const spFileName = 'TST99_SP_Jan_2099.xlsx';
  const spFile = writeWorkbookFile(spFileName, [
    {
      sheetName: 'SP_HO',
      rows: [
        ...TEMPLATE_DEFINITIONS.sp.sheets[0].rows.slice(0, 5),
        [1, 'TST99SP01', 'TST99 SP HO ONE', 'Staff Of Design', 'Creative', 'Head Office', 'TST99REF01', 'Surat Peringatan 2', '2099-01-15', '2099-07-15', 180, 1, null, 1, 'COMMERCIAL BUSINESS', 'ONLINE', 'Staff', 'Januari 2099'],
        [2, 'TST99SP02', 'TST99 SP HO TWO', 'Manager Ops', 'Tech', 'Head Office', 'TST99REF02', 'Surat Peringatan 1', '2099-01-20', '2099-07-20', 180, null, 1, 1, 'SUPPLY CHAIN', 'TECHNICAL SERVICE', 'Manager', 'Januari 2099']
      ]
    },
    {
      sheetName: 'SP_Toko',
      rows: [
        ...TEMPLATE_DEFINITIONS.sp.sheets[1].rows.slice(0, 5),
        [1, 'TST99SP03', 'TST99 SP TOKO ONE', 'Sales Advisor', 'Store', 'TST99 FS PALANGKARAYA', 'TIMUR', 'TST99REF03', 'Surat Peringatan 1', '2099-01-05', '2099-07-05', 180, 1, null, 1, 'COMMERCIAL BUSINESS', 'SALES OFFLINE', 'Sales Advisor', 'Januari 2099']
      ]
    }
  ]);
  const spCommit = await uploadMultipart(baseUrl, '/disciplinary/import-sp', spFile, adminToken);
  assert.equal(spCommit.status, 200);
  assert.equal(spCommit.json.success, true);
  assert.equal(spCommit.json.data.successCount, 3);

  // 4. FRAUD (Single-month: Jan 2099)
  const fraudFileName = 'TST99_Fraud_Jan_2099.xlsx';
  const fraudFile = writeWorkbookFile(fraudFileName, [
    {
      sheetName: 'Data Fraud 2022-2026',
      rows: [
        ...TEMPLATE_DEFINITIONS.fraud.sheets[0].rows.slice(0, 4),
        [1, 'TST99FR01', 'TST99 FRAUD USER', 'Store Leader', 'TST99 SHOWROOM BEKASI', 'Kasus Fraud Transaksi', 'Selisih Audit', '2099-01-15', -5, 3500000, 150000000, 120000000, 'TST99 investigasi fraud', 'Januari 2099']
      ]
    }
  ]);
  const fraudCommit = await uploadMultipart(baseUrl, '/disciplinary/import-fraud', fraudFile, adminToken);
  assert.equal(fraudCommit.status, 200);
  assert.equal(fraudCommit.json.success, true);
  assert.equal(fraudCommit.json.data.successCount, 1);

  // 5. BIPARTIT (Multi-month: Jan, Feb, Mar 2099 -> 2-step confirmation)
  const bipFileName = 'TST99_Bipartit_2099.xlsx';
  const bipFile = writeWorkbookFile(bipFileName, [
    {
      sheetName: 'Kasus',
      rows: [
        ...TEMPLATE_DEFINITIONS.bipartit.sheets[0].rows.slice(0, 2),
        [1, 'TST99 BP ONE', 'STORE LEADER', 'TST99 SHOWROOM BEKASI', null, 'Mediasi Disnaker', null, 'TST99 Mediasi Disnaker kontrak', 1, 'Januari 2099', 'Maret 2099'],
        [2, 'TST99 BP TWO', 'CASHIER', 'TST99 FS PALANGKARAYA', 'Bipartit', null, null, 'TST99 Musyawarah bipartit', 1, 'Februari 2099', 'Februari 2099']
      ]
    }
  ]);
  const bipNeedConfirm = await uploadMultipart(baseUrl, '/disciplinary/import-bipartit', bipFile, adminToken, { confirmStep: 0 });
  assert.equal(bipNeedConfirm.json.requiresConfirmation, true);
  const bipCommit = await uploadMultipart(baseUrl, '/disciplinary/import-bipartit?confirmStep=2', bipFile, adminToken, { confirmStep: 2 });
  assert.equal(bipCommit.status, 200);
  assert.equal(bipCommit.json.success, true);
  assert.equal(bipCommit.json.data.successCount, 2);

  // 6. ATTENDANCE (Multi-month: Jan, Feb 2099 for HQ & STORE -> 2-step confirmation)
  const attRows = TEMPLATE_DEFINITIONS.attendance.sheets[0].rows;
  const attFileName = 'TST99_Attendance_2099.xlsx';
  const attFile = writeWorkbookFile(attFileName, [
    {
      sheetName: 'kehadiran2099',
      rows: [
        attRows[0],
        [1, `JANUARI ${TEST_YEAR}`, 362, 57, 0.157, 11, 0.03, 150, 0.414, 2, 0.005, 22, 0.806],
        [2, `FEBRUARI ${TEST_YEAR}`, 364, 51, 0.14, 10, 0.027, 142, 0.39, 2, 0.005, 20, 0.826],
        [],
        [],
        [],
        attRows[6],
        [1, `JANUARI ${TEST_YEAR}`, 909, 170, 0.187, 6, 0.006, 468, 0.514, 84, 0.092, 22, 0.713],
        [2, `FEBRUARI ${TEST_YEAR}`, 872, 186, 0.213, 7, 0.008, 250, 0.286, 101, 0.115, 20, 0.662]
      ]
    }
  ]);
  const attNeedConfirm = await uploadMultipart(baseUrl, '/reporting-monthly/bulk-attendance', attFile, adminToken, { confirmStep: 1 });
  assert.equal(attNeedConfirm.json.requiresConfirmation, true);
  assert.equal(attNeedConfirm.json.confirmStep, 2);

  const attCommit = await uploadMultipart(baseUrl, '/reporting-monthly/bulk-attendance?confirmStep=2', attFile, adminToken, { confirmStep: 2 });
  assert.equal(attCommit.status, 201);
  assert.equal(attCommit.json.success, true);
  assert.equal(attCommit.json.data.imported, 4);

  // 7. SALES (Multi-month: Jan, Feb, Mar 2099 -> 2-step confirmation)
  const salesFileName = 'TST99_Sales_2099.xlsx';
  const salesFile = writeWorkbookFile(salesFileName, [
    {
      sheetName: 'SALES2099',
      rows: [
        ['REKAP TARGET & REALISASI SALES 2099'],
        ['NO', 'NAMA TOKO', 'REG', 'JENIS TOKO', 'Target JAN 2099', null, 'Actual JAN 2099', null, 'Target FEB 2099', null, 'Actual FEB 2099', null, 'Target MARET 2099', null, 'Actual MARET 2099', null],
        TEMPLATE_DEFINITIONS.sales.sheets[0].rows[2],
        [1, 'TST99 SHOWROOM BEKASI', 'BARAT', 'SHOWROOM', 480, 115000000, 500, 120000000, 430, 105000000, 450, 110000000, 550, 140000000, 600, 150000000],
        [2, 'TST99 COUNTER TASIK', 'BARAT', 'COUNTER', 200, 50000000, 215, 52000000, 380, 75000000, 402, 78000000, 1150, 225000000, 1247, 250000000]
      ]
    }
  ]);
  const salesNeedConfirm = await uploadMultipart(baseUrl, '/reporting-monthly/bulk-sales', salesFile, adminToken, { confirmStep: 0 });
  assert.equal(salesNeedConfirm.json.requiresConfirmation, true);
  const salesCommit = await uploadMultipart(baseUrl, '/reporting-monthly/bulk-sales?confirmStep=2', salesFile, adminToken, { confirmStep: 2 });
  assert.equal(salesCommit.status, 201);
  assert.equal(salesCommit.json.success, true);
  assert.equal(salesCommit.json.data.imported, 6);

  // 8. Verify Dashboard reflects ALL imported modules for year 2099!
  const dashAug = await requestJson(baseUrl, `/dashboard/summary?year=${TEST_YEAR}&month=8&scope=Corporate&spYear=${TEST_YEAR}`, { token: adminToken });
  assert.equal(dashAug.status, 200);
  const d = dashAug.json.data;

  // Turnover
  assert.equal(d.turnoverAndRetention.overview.kpi.monthlyTurnover, 2);
  assert.equal(d.turnoverAndRetention.overview.kpi.totalYtd, 4);
  assert.equal(d.turnoverAndRetention.overview.kpi.voluntaryTotal, 3);

  // SP & Bipartit & Compliance
  assert.equal(d.industrialAndSp.totalSpIssued, 3);
  assert.equal(d.industrialAndSp.hqSp.total, 2);
  assert.equal(d.industrialAndSp.storeSp.total, 1);
  assert.equal(d.industrialAndSp.disputes.corporate.total >= 2, true);
  assert.ok(d.compliance.tableData.some((c) => c.description === 'TST99 Pelaporan WLKP Online'));

  // Attendance (month 2 has exact HQ & Store records)
  const dashFeb = await requestJson(baseUrl, `/dashboard/summary?year=${TEST_YEAR}&month=2&scope=Corporate`, { token: adminToken });
  assert.equal(dashFeb.status, 200);
  assert.equal(dashFeb.json.data.summary.attendanceByScope.hq.totalEmployees, 364);
  assert.equal(dashFeb.json.data.summary.attendanceByScope.store.totalEmployees, 872);

  // Sales (month 3: 150M + 250M = 400M)
  const dashMar = await requestJson(baseUrl, `/dashboard/summary?year=${TEST_YEAR}&month=3&scope=Corporate`, { token: adminToken });
  assert.equal(dashMar.status, 200);
  assert.equal(dashMar.json.data.summary.productivity.totalSales, 400000000);
  assert.equal(dashMar.json.data.storePerformance.overview.totalSales, 400000000);

  // Disciplinary dashboard (includes Fraud BAKB)
  const discDash = await requestJson(baseUrl, '/disciplinary/dashboard', { token: adminToken });
  assert.equal(discDash.status, 200);
  assert.ok(discDash.json.data.tableData.some((row) => row.employeeName === 'TST99 FRAUD USER' && row.financialLoss === 3500000));

  // Verify Import History endpoint
  const historyRes = await requestJson(baseUrl, `/import/history?year=${TEST_YEAR}&limit=50`, { token: adminToken });
  assert.equal(historyRes.status, 200);
  assert.ok(historyRes.json.data.length >= 6);
});
