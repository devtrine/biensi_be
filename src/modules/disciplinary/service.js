const xlsx = require('xlsx');
const repository = require('./repository');

// Helper Tanggal Excel & Teks Bulan Indonesia ("Mei 2025", "januari 2022", "APRIL 2026")
const parseFlexibleDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  let str = String(val).trim();
  if (!str || str === '-') return null;

  const monthMap = {
    januari: 'January', februari: 'February', maret: 'March', april: 'April',
    mei: 'May', juni: 'June', juli: 'July', agustus: 'August',
    september: 'September', oktober: 'October', november: 'November', desember: 'December'
  };

  Object.keys(monthMap).forEach(indo => {
    const regex = new RegExp(indo, 'ig');
    str = str.replace(regex, monthMap[indo]);
  });

  // Jika hanya tertulis nama bulan tanpa tahun (seperti "Januari" di spToko.xlsx), tambahkan 2026
  if (!/\d{4}/.test(str)) {
    str = `${str} 2026`;
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const parseDecimal = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleanStr = String(val).replace(/[^0-9.-]+/g, '');
  return parseFloat(cleanStr) || 0;
};

// === 1. SERVICE UNTUK IMPORT SP (HO & TOKO) ===
const importBulkSP = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = [];

  for (const sheetName of workbook.SheetNames) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let dataStartRow = 0;

    // Matrix Scanner (Maksimal 10 Baris Pertama)
    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if (cell.includes('EMPLOYEENO')) col.empNo = c;
        else if (cell.includes('REFERENCENO')) { col.refNo = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell === 'DIVISI') col.divisi = c;
        else if (cell.includes('DEPARTEMENT') || cell.includes('DEPARTMENT')) col.dept = c;
        else if (cell.includes('DISCIPLINESNAME')) { col.discName = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('STARTDATE')) col.startDate = c;
        else if (cell.includes('ENDDATE')) col.endDate = c;
        // ✅ PENTING: Cek NONTATATERTIB dulu sebelum TATATERTIB agar tidak tertimpa!
        else if (cell.includes('NONTATATERTIB')) col.nonTataTertib = c;
        else if (cell.includes('TATATERTIB')) col.tataTertib = c;
        else if (cell === 'PERIODE') col.periode = c;
      }
    }

    if (col.name === undefined) continue;

    for (let r = dataStartRow; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      let category = 'Tata Tertib';
      if (col.nonTataTertib !== undefined && row[col.nonTataTertib]) {
        category = 'Non Tata Tertib';
      }

      const startDate = parseFlexibleDate(row[col.startDate]) || parseFlexibleDate(row[col.periode]);
      const endDate = parseFlexibleDate(row[col.endDate]);

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        divisionName: col.divisi !== undefined ? row[col.divisi] : null,
        departmentName: col.dept !== undefined ? row[col.dept] : null,
        referenceNo: col.refNo !== undefined ? row[col.refNo] : null,
        disciplineName: col.discName !== undefined ? row[col.discName] : 'Surat Peringatan',
        startDate,
        endDate,
        category
      });
    }
  }
  if (allData.length === 0) throw new Error('Gagal. Pastikan format SP (Toko/HO) benar.');
  return await repository.processBulkSP(allData);
};

// === 2. SERVICE UNTUK IMPORT FRAUD ===
const importBulkFraud = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = [];

  for (const sheetName of workbook.SheetNames) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let dataStartRow = 0;

    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if (cell.includes('EMPLOYEENO')) col.empNo = c;
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell.includes('DISCIPLINESNAME')) { col.discName = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('STARTDATE')) { col.startDate = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('PENYEBABFRAUD')) col.fraudCause = c;
        else if (cell.includes('TGLAUDIT')) col.auditDate = c;
        else if (cell.includes('SELISIHQTY')) col.selisihQty = c;
        else if (cell.includes('NILAIBAKB')) col.bakb = c;
        else if (cell === 'TARGET') col.target = c;
        else if (cell.includes('PENCAPAIANSALES')) col.actual = c;
        else if (cell === 'REMARK' || cell === 'KETERANGAN') col.remark = c;
        else if (cell === 'PERIODE') col.periode = c;
      }
    }

    if (col.name === undefined || col.bakb === undefined) continue;

    for (let r = dataStartRow; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      const parsedStartDate = parseFlexibleDate(row[col.startDate]) || parseFlexibleDate(row[col.periode]);
      const parsedAuditDate = parseFlexibleDate(row[col.auditDate]) || parsedStartDate;

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        disciplineName: col.discName !== undefined ? row[col.discName] : 'Kasus Fraud',
        startDate: parsedStartDate || parsedAuditDate,
        remark: col.remark !== undefined ? row[col.remark] : null,
        fraudCategory: col.fraudCause !== undefined ? row[col.fraudCause] : 'Lainnya',
        auditDate: parsedAuditDate,
        selisihQty: col.selisihQty !== undefined ? parseDecimal(row[col.selisihQty]) : 0,
        bakbAmount: col.bakb !== undefined ? parseDecimal(row[col.bakb]) : 0,
        salesTarget: col.target !== undefined ? parseDecimal(row[col.target]) : 0,
        salesActual: col.actual !== undefined ? parseDecimal(row[col.actual]) : 0
      });
    }
  }
  if (allData.length === 0) throw new Error('Gagal. Pastikan file mengandung kolom Fraud (BAKB, Selisih, dll).');
  return await repository.processBulkFraud(allData);
};

// === 3. SERVICE UNTUK IMPORT BIPARTIT (KASUS.XLSX) ===
const importBulkBipartit = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = [];

  for (const sheetName of workbook.SheetNames) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let dataStartRow = 0;

    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c;
          dataStartRow = Math.max(dataStartRow, r + 1);
        }
        else if (cell.includes('EMPLOYEENO')) col.empNo = c;
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell.includes('BIPARTIT')) { col.bipartit = c; dataStartRow = Math.max(dataStartRow, r + 1); }
        else if (cell.includes('MEDIASI')) col.mediasi = c;
        else if (cell.includes('PIHAKKE3') || cell.includes('PIHAKKETIGA')) col.pihak3 = c;
        else if (cell.includes('KETERANGAN')) col.ket = c;
        else if (cell.includes('PERIODEAWAL')) col.startDate = c;
        else if (cell.includes('PERIODESELESAI')) col.endDate = c;
      }
    }

    if (col.name === undefined) continue;

    for (let r = dataStartRow; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      const ketText = col.ket !== undefined && row[col.ket] ? String(row[col.ket]).trim() : null;
      const ketUpper = String(ketText || '').toUpperCase();

      // ✅ PERBAIKAN: Cek checklist kolom dulu; jika kosong semua (seperti di kasus.xlsx), baca dari teks Keterangan!
      let category = 'Bipartit';
      if (col.bipartit !== undefined && row[col.bipartit]) category = 'Bipartit';
      else if (col.mediasi !== undefined && row[col.mediasi]) category = 'Mediasi';
      else if (col.pihak3 !== undefined && row[col.pihak3]) category = 'Pihak ke 3';
      else if (ketUpper.includes('MEDIASI') || ketUpper.includes('DISNAKER')) category = 'Mediasi';
      else if (ketUpper.includes('PIHAK')) category = 'Pihak ke 3';

      const parsedStart = parseFlexibleDate(row[col.startDate]);
      const parsedEnd = parseFlexibleDate(row[col.endDate]);

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        category: category,
        keterangan: ketText,
        startDate: parsedStart || parsedEnd, // Fallback jika Periode Awal kosong
        endDate: parsedEnd
      });
    }
  }
  if (allData.length === 0) throw new Error('Gagal. Pastikan file mengandung kolom Bipartit/Mediasi.');
  return await repository.processBulkBipartit(allData);
};

// CRUD GET & DELETE
const getAllCases = async (filters) => await repository.getAllCases(filters);
const getCaseById = async (id) => await repository.getCaseById(id);
const deleteCase = async (id) => await repository.deleteCase(id);
const getDashboardData = async () => await repository.getDashboardData();

module.exports = {
  importBulkSP,
  importBulkFraud,
  getAllCases,
  getCaseById,
  deleteCase,
  getDashboardData,
  importBulkBipartit
};