const xlsx = require('xlsx');
const repository = require('./repository');

const parseExcelDate = (serial) => {
  if (!serial) return null;
  let date = typeof serial === 'string' ? new Date(serial) : new Date((serial - 25569) * 86400 * 1000);
  return isNaN(date.getTime()) ? null : date;
};

const importComplianceData = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  let allData = []; 

  // Saring sheet untuk kepatuhan (WLKP, perizinan, dsb)
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return lower.includes('wlkp') || lower.includes('compliance') || lower.includes('kepatuhan') || lower.includes('perizinan');
  });

  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      return !lower.includes('demografi') && !lower.includes('turnover') && !lower.includes('kehadiran') &&
             !lower.includes('sales') && !lower.includes('fraud') && !lower.includes('kasus') &&
             !lower.includes('sp') && !lower.includes('phase') && !lower.includes('critical') && !lower.includes('visual');
    });
  }

  if (targetSheets.length === 0) {
    targetSheets = [workbook.SheetNames[0]];
  }

  for (const sheetName of targetSheets) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let col = {}; 
    let headerRowIndex = 0;

    // 1. MATRIX SCANNER CANGGIH (Anti-Tertukar Tgl Akhir)
    for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        if (!cell) continue;

        if (cell.includes('STORENAME') && col.store === undefined) {
          col.store = c; headerRowIndex = r; 
        }
        
        // Kita tangkap Judul Utamanya, lalu kunci indeks kolom tanggalnya (Index Offset)
        if (cell.includes('PERATURANPERUSAHAAN') || cell === 'PP') {
          col.ppAwal = c; col.ppAkhir = c + 1;
        }
        else if (cell.includes('WLKP')) {
          col.wlkpAwal = c; col.wlkpAkhir = c + 1;
        }
        else if (cell.includes('BPJSKETENAGAKERJAAN')) {
          // Karena kolom pertamanya Jml Terdaftar, maka Tgl Awal bergeser ke c+1
          col.bpjsAwal = c + 1; col.bpjsAkhir = c + 2; 
        }
        else if (cell === 'GENSET') {
          col.gensetAwal = c; col.gensetAkhir = c + 1;
        }
        else if (cell.includes('INSTALASILISTRIK') || cell.includes('PENYALURLISTRIK')) {
          col.listrikAwal = c; col.listrikAkhir = c + 1;
        }
      }
    }

    const hasComplianceCols = col.ppAwal !== undefined || col.wlkpAwal !== undefined || col.bpjsAwal !== undefined || col.gensetAwal !== undefined || col.listrikAwal !== undefined;
    if (col.store === undefined || !hasComplianceCols) continue;

    // 2. EKSTRAK DATA PER TOKO
    for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const storeName = row[col.store];
      
      // Abaikan baris kosong atau baris sub-header
      if (!storeName || String(storeName).toUpperCase().includes('STORE') || String(storeName).includes('Tgl')) continue;

      let documents = [];

      // Susun Dokumen Peraturan Perusahaan
      if (col.ppAwal !== undefined && (row[col.ppAwal] || row[col.ppAkhir])) {
         documents.push({ type: 'Peraturan Perusahaan (PP)', validFrom: parseExcelDate(row[col.ppAwal]), validUntil: parseExcelDate(row[col.ppAkhir]) });
      }
      // Susun Dokumen WLKP
      if (col.wlkpAwal !== undefined && (row[col.wlkpAwal] || row[col.wlkpAkhir])) {
         documents.push({ type: 'WLKP Kemnaker', validFrom: parseExcelDate(row[col.wlkpAwal]), validUntil: parseExcelDate(row[col.wlkpAkhir]) });
      }
      // Susun Dokumen BPJS Ketenagakerjaan
      if (col.bpjsAwal !== undefined && (row[col.bpjsAwal] || row[col.bpjsAkhir])) {
         documents.push({ type: 'BPJS Ketenagakerjaan', validFrom: parseExcelDate(row[col.bpjsAwal]), validUntil: parseExcelDate(row[col.bpjsAkhir]) });
      }
      // Susun Dokumen Genset
      if (col.gensetAwal !== undefined && (row[col.gensetAwal] || row[col.gensetAkhir])) {
         documents.push({ type: 'Sertifikasi Genset', validFrom: parseExcelDate(row[col.gensetAwal]), validUntil: parseExcelDate(row[col.gensetAkhir]) });
      }
      // Susun Dokumen Instalasi Listrik
      if (col.listrikAwal !== undefined && (row[col.listrikAwal] || row[col.listrikAkhir])) {
         documents.push({ type: 'Instalasi Listrik', validFrom: parseExcelDate(row[col.listrikAwal]), validUntil: parseExcelDate(row[col.listrikAkhir]) });
      }

      // Jika toko ini punya minimal 1 dokumen, masukkan ke antrean
      if (documents.length > 0) {
          allData.push({ storeName, documents });
      }
    }
  }

  if (allData.length === 0) throw new Error("Gagal membaca data. Pastikan format tabel memiliki kolom Store Name dan jenis kepatuhan.");
  return await repository.processBulkCompliance(allData);
};

module.exports = { importComplianceData, getDashboardData: repository.getDashboardData };