const xlsx = require('xlsx');
const repository = require('./repository');

// Helpers
const parseExcelDate = (serial) => {
  if (!serial) return null;
  let date = typeof serial === 'string' ? new Date(serial) : new Date((serial - 25569) * 86400 * 1000);
  return isNaN(date.getTime()) ? null : date;
};

const parseDecimal = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleanStr = String(val).replace(/[^0-9.-]+/g, "");
  return parseFloat(cleanStr) || 0;
};

// === 1. SERVICE UNTUK IMPORT SP (HO & TOKO) ===
const importBulkSP = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = []; 

  for (const sheetName of workbook.SheetNames) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let headerRowIndex = 0;
    
    // Matrix Scanner (Maksimal 10 Baris Pertama)
    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c; headerRowIndex = r;
        }
        else if (cell.includes('EMPLOYEENO')) col.empNo = c;
        else if (cell.includes('REFERENCENO')) col.refNo = c;
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell === 'DIVISI') col.divisi = c;
        else if (cell.includes('DEPARTEMENT')) col.dept = c;
        else if (cell.includes('DISCIPLINESNAME')) col.discName = c;
        else if (cell.includes('STARTDATE')) col.startDate = c;
        else if (cell.includes('ENDDATE')) col.endDate = c;
        else if (cell.includes('TATATERTIB')) col.tataTertib = c;
        else if (cell.includes('NONTATATERTIB')) col.nonTataTertib = c;
      }
    }

    if (col.name === undefined) continue;

    for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      let category = 'Tata Tertib';
      if (col.nonTataTertib !== undefined && row[col.nonTataTertib]) category = 'Non Tata Tertib';

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        divisionName: col.divisi !== undefined ? row[col.divisi] : null,
        departmentName: col.dept !== undefined ? row[col.dept] : null,
        referenceNo: col.refNo !== undefined ? row[col.refNo] : null,
        disciplineName: col.discName !== undefined ? row[col.discName] : 'Surat Peringatan',
        startDate: parseExcelDate(row[col.startDate]),
        endDate: parseExcelDate(row[col.endDate]),
        category: category
      });
    }
  }
  if (allData.length === 0) throw new Error("Gagal. Pastikan format SP (Toko/HO) benar.");
  return await repository.processBulkSP(allData);
};

// === 2. SERVICE UNTUK IMPORT FRAUD ===
const importBulkFraud = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = []; 

  for (const sheetName of workbook.SheetNames) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let headerRowIndex = 0;

    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c; headerRowIndex = r;
        }
        else if (cell.includes('EMPLOYEENO')) col.empNo = c;
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell.includes('DISCIPLINESNAME')) col.discName = c;
        else if (cell.includes('STARTDATE')) col.startDate = c;
        else if (cell.includes('PENYEBABFRAUD')) col.fraudCause = c;
        else if (cell.includes('TGLAUDIT')) col.auditDate = c;
        else if (cell.includes('SELISIHQTY')) col.selisihQty = c;
        else if (cell.includes('NILAIBAKB')) col.bakb = c;
        else if (cell.includes('TARGET')) col.target = c;
        else if (cell.includes('PENCAPAIANSALES')) col.actual = c;
        else if (cell === 'REMARK' || cell === 'KETERANGAN') col.remark = c;
      }
    }

    if (col.name === undefined || col.bakb === undefined) continue; // Pastikan ini beneran file fraud

    for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      allData.push({
        employeeName: empName,
        employeeNo: col.empNo !== undefined ? row[col.empNo] : null,
        storeName: col.store !== undefined ? row[col.store] : null,
        disciplineName: col.discName !== undefined ? row[col.discName] : 'Kasus Fraud',
        startDate: parseExcelDate(row[col.startDate]),
        remark: col.remark !== undefined ? row[col.remark] : null,
        fraudCategory: col.fraudCause !== undefined ? row[col.fraudCause] : 'Lainnya',
        auditDate: parseExcelDate(row[col.auditDate]),
        selisihQty: col.selisihQty !== undefined ? parseDecimal(row[col.selisihQty]) : 0,
        bakbAmount: col.bakb !== undefined ? parseDecimal(row[col.bakb]) : 0,
        salesTarget: col.target !== undefined ? parseDecimal(row[col.target]) : 0,
        salesActual: col.actual !== undefined ? parseDecimal(row[col.actual]) : 0,
      });
    }
  }
  if (allData.length === 0) throw new Error("Gagal. Pastikan file mengandung kolom Fraud (BAKB, Selisih, dll).");
  return await repository.processBulkFraud(allData);
};

// Helper modifikasi agar mengerti "Mei 2025" atau "Agustus"
const parseIndonesianDate = (val) => {
  if (!val) return null;
  if (typeof val === 'number') return parseExcelDate(val); // Jika format asli Date Excel
  
  // Jika formatnya Text / String
  let dateStr = String(val)
    .replace(/Januari/i, 'January')
    .replace(/Februari/i, 'February')
    .replace(/Maret/i, 'March')
    .replace(/Mei/i, 'May')
    .replace(/Agustus/i, 'August')
    .replace(/Oktober/i, 'October')
    .replace(/Desember/i, 'December');
    
  let dateObj = new Date(dateStr);
  return isNaN(dateObj.getTime()) ? null : dateObj;
};

// === 3. SERVICE UNTUK IMPORT BIPARTIT ===
const importBulkBipartit = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = []; 

  for (const sheetName of workbook.SheetNames) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; let headerRowIndex = 0;

    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if ((cell === 'NAME' || cell.includes('NAMAKARYAWAN')) && col.name === undefined) {
          col.name = c; headerRowIndex = r;
        }
        else if (cell.includes('STORENAME') || cell.includes('SHOWROOM')) col.store = c;
        else if (cell.includes('BIPARTIT')) col.bipartit = c;
        else if (cell.includes('MEDIASI')) col.mediasi = c;
        else if (cell.includes('PIHAKKE3') || cell.includes('PIHAKKETIGA')) col.pihak3 = c;
        else if (cell.includes('KETERANGAN')) col.ket = c;
        else if (cell.includes('PERIODEAWAL')) col.startDate = c;
        else if (cell.includes('PERIODESELESAI')) col.endDate = c;
      }
    }

    if (col.name === undefined) continue; 

    for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const empName = row[col.name];
      if (!empName || String(empName).toUpperCase().includes('NAME')) continue;

      // Logika Kategori (Checklist dari Excel)
      let category = 'Lainnya';
      if (col.bipartit !== undefined && row[col.bipartit]) category = 'Bipartit';
      else if (col.mediasi !== undefined && row[col.mediasi]) category = 'Mediasi';
      else if (col.pihak3 !== undefined && row[col.pihak3]) category = 'Pihak ke 3';

      allData.push({
        employeeName: empName,
        employeeNo: null, // Karena di Excel Bipartit tidak ada kolom NIK
        storeName: col.store !== undefined ? row[col.store] : null,
        category: category,
        keterangan: col.ket !== undefined ? row[col.ket] : null,
        startDate: parseIndonesianDate(row[col.startDate]),
        endDate: parseIndonesianDate(row[col.endDate])
      });
    }
  }
  if (allData.length === 0) throw new Error("Gagal. Pastikan file mengandung kolom Bipartit/Mediasi.");
  return await repository.processBulkBipartit(allData);
};

// CRUD GET & DELETE
const getAllCases = async (filters) => await repository.getAllCases(filters);
const getCaseById = async (id) => await repository.getCaseById(id);
const deleteCase = async (id) => await repository.deleteCase(id);
const getDashboardData = async () => await repository.getDashboardData();

module.exports = { importBulkSP, importBulkFraud, getAllCases, getCaseById,
                   deleteCase, getDashboardData, importBulkBipartit };