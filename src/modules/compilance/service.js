const xlsx = require('xlsx');
const repository = require('./repository');

// Parser tanggal tangguh: mendukung Excel Serial Number, YYYY-MM-DD, dan "04-Oct-26" / "04-Okt-26"
const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(date.getTime()) ? null : date;
  }

  let str = String(val).trim();
  if (!str || str === '-' || str === '0') return null;

  // Normalisasi singkatan bulan
  const indoMonths = {
    JANUARI: 'Jan', FEBRUARI: 'Feb', MARET: 'Mar', APRIL: 'Apr', MEI: 'May', JUNI: 'Jun',
    JULI: 'Jul', AGUSTUS: 'Aug', SEPTEMBER: 'Sep', OKTOBER: 'Oct', NOVEMBER: 'Nov', DESEMBER: 'Dec',
    AGU: 'Aug', AGT: 'Aug', OKT: 'Oct', DES: 'Dec', PEB: 'Feb'
  };
  Object.keys(indoMonths).forEach(indo => {
    const regex = new RegExp(`\\b${indo}\\b`, 'gi');
    str = str.replace(regex, indoMonths[indo]);
  });

  // regregator tanggal
  str = str.replace(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2})$/, '$1 $2 20$3');

  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
};

// Sinonim Header Bahasa and prevent Urutan Kolom Tertukar
const HEADER_ALIASES = {
  entityName: ['PERUSAHAAN', 'ENTITAS', 'COMPANY', 'ENTITY'],
  permitType: ['JENISPERIJINAN', 'JENISPERIZINAN', 'JENISDOKUMEN', 'JENISIZIN', 'PERMITTYPE', 'DOCUMENTTYPE', 'KATEGORIPERIZINAN'],
  storeName: ['NAMATOKO', 'STORENAME', 'SHOWROOM', 'CABANG', 'BRANCH', 'UNITKERJA'],
  documentName: ['DOKUMEN/PERIZINAN', 'DOKUMEN/PERIJINAN', 'NAMADOKUMEN', 'DOCUMENTNAME', 'INSTRUMEN', 'DOKUMEN', 'PERIZINAN'],
  location: ['LOKASI', 'LOCATION', 'WILAYAH', 'TEMPAT', 'SITE'],
  validFrom: ['TANGGALTERBIT', 'TGLTERBIT', 'TGLAWAL', 'PERIODEAWAL', 'ISSUEDATE', 'STARTDATE', 'VALIDFROM', 'EFFECTIVE'],
  validUntil: ['TANGGALBERAKHIR', 'TGLBERAKHIR', 'TGLAKHIR', 'PERIODEAKHIR', 'EXPIRYDATE', 'EXPIREDDATE', 'ENDDATE', 'VALIDUNTIL', 'JATUHTEMPO'],
  pic: ['PIC', 'PERSONINCHARGE', 'PENANGGUNGJAWAB'],
  status: ['STATUS', 'STATE', 'KONDISI'],
  remainingDays: ['SISAHARI', 'REMAININGDAYS', 'DAYSLEFT', 'SISAWAKTU'],
  notes: ['KETERANGAN', 'NOTES', 'REMARKS', 'CATATAN', 'DESKRIPSI']
};

const matchHeaderField = (normCell) => {
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some(alias => normCell === alias || normCell.includes(alias))) {
      return field;
    }
  }
  return null;
};

const importComplianceData = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const allData = [];

  // Filter sheet perizinan/kepatuhan
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return lower.includes('wlkp') || lower.includes('compliance') || lower.includes('kepatuhan') || lower.includes('perizinan') || lower.includes('perijinan');
  });

  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      return !lower.includes('demografi') && !lower.includes('turnover') && !lower.includes('kehadiran') &&
             !lower.includes('sales') && !lower.includes('fraud') && !lower.includes('kasus') &&
             !lower.includes('sp') && !lower.includes('phase') && !lower.includes('recruitment');
    });
  }
  if (targetSheets.length === 0) targetSheets = [workbook.SheetNames[0]];

  for (const sheetName of targetSheets) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let listHeaderRow = -1;
    const listColMap = {};

    // 1. Dinamis cari baris header format 12 kolom
    for (let r = 0; r < Math.min(15, rawMatrix.length); r++) {
      const row = rawMatrix[r] || [];
      const tempMap = {};

      for (let c = 0; c < row.length; c++) {
        const cellTop = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
        const cellSub = String((rawMatrix[r + 1] || [])[c] || '').toUpperCase().replace(/\s+/g, '');
        const combined = cellTop || cellSub;
        if (!combined) continue;

        const matchedField = matchHeaderField(cellTop);
        if (matchedField && tempMap[matchedField] === undefined) {
          tempMap[matchedField] = c;
        }
      }

      if (tempMap.permitType !== undefined || tempMap.documentName !== undefined) {
        listHeaderRow = r;
        Object.assign(listColMap, tempMap);
        break;
      }
    }

    // 1b. Fallback Format Matriks Toko (STORE NAME + PP / WLKP / PERIODE / GENSET)
    let matrixHeaderRow = -1;
    let matrixStoreCol = -1;
    const mCols = {};
    if (listHeaderRow === -1) {
      for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
        const row = rawMatrix[r] || [];
        for (let c = 0; c < row.length; c++) {
          const cell = String(row[c] || '').toUpperCase().replace(/\s+/g, '');
          if (!cell) continue;
          if ((cell.includes('STORENAME') || cell === 'NAMATOKO') && matrixStoreCol === -1) {
            matrixStoreCol = c;
            matrixHeaderRow = r;
          }
          if (cell.includes('PPTGLAWAL')) mCols.ppAwal = c;
          else if (cell.includes('PPTGLAKHIR')) mCols.ppAkhir = c;
          else if (cell.includes('WLKPTGLAWAL')) mCols.wlkpAwal = c;
          else if (cell.includes('WLKPTGLAKHIR')) mCols.wlkpAkhir = c;
          else if ((cell.includes('PERATURANPERUSAHAAN') || cell === 'PP') && mCols.ppFlag === undefined) mCols.ppFlag = c;
          else if (cell === 'WLKP' && mCols.wlkpFlag === undefined) mCols.wlkpFlag = c;
          else if (cell === 'PERIODE' && mCols.periodeAwal === undefined) { mCols.periodeAwal = c; mCols.periodeAkhir = c + 1; }
          else if (cell === 'GENSET' && mCols.gensetFlag === undefined) { mCols.gensetFlag = c; mCols.gensetAwal = c + 1; }
        }
      }
    }

    const hasMatrixCompliance =
      mCols.ppAwal !== undefined ||
      mCols.wlkpAwal !== undefined ||
      mCols.ppFlag !== undefined ||
      mCols.wlkpFlag !== undefined;

    if (listHeaderRow === -1 && (matrixStoreCol === -1 || !hasMatrixCompliance)) continue;

    if (listHeaderRow === -1 && matrixStoreCol !== -1 && hasMatrixCompliance) {
      for (let r = matrixHeaderRow + 1; r < rawMatrix.length; r++) {
        const row = rawMatrix[r] || [];
        const rawStore = row[matrixStoreCol];
        if (!rawStore || String(rawStore).trim() === '') continue;
        const storeName = String(rawStore).trim();
        const storeUpper = storeName.toUpperCase();
        if (storeUpper.includes('STORE NAME') || storeUpper === 'NAMA TOKO' || storeUpper.includes('TGL') || storeUpper === 'TOTAL') continue;

        const isHo = ['HO', 'HEAD OFFICE', 'KANTOR PUSAT', '-'].includes(storeUpper);
        const location = isHo ? 'HO' : storeName;
        const documents = [];

        if (mCols.ppAwal !== undefined || mCols.ppAkhir !== undefined) {
          const vf = parseExcelDate(row[mCols.ppAwal]);
          const vu = parseExcelDate(row[mCols.ppAkhir]);
          if (vf || vu) {
            documents.push({
              type: 'PP',
              description: 'PERATURAN PERUSAHAAN (PP)',
              location,
              validFrom: vf,
              validUntil: vu,
              pic: null,
              rawStatus: 'Aktif',
              remainingDays: 0,
              notes: null
            });
          }
        } else if (mCols.ppFlag !== undefined && Number(row[mCols.ppFlag]) === 1) {
          documents.push({
            type: 'PP',
            description: 'PERATURAN PERUSAHAAN (PP)',
            location,
            validFrom: null,
            validUntil: null,
            pic: null,
            rawStatus: 'Aktif',
            remainingDays: 0,
            notes: null
          });
        }

        if (mCols.wlkpAwal !== undefined || mCols.wlkpAkhir !== undefined) {
          const vf = parseExcelDate(row[mCols.wlkpAwal]);
          const vu = parseExcelDate(row[mCols.wlkpAkhir]);
          if (vf || vu) {
            documents.push({
              type: 'WLKP',
              description: 'WLKP KEMNAKER',
              location,
              validFrom: vf,
              validUntil: vu,
              pic: null,
              rawStatus: 'Aktif',
              remainingDays: 0,
              notes: null
            });
          }
        } else if (mCols.wlkpFlag !== undefined && (Number(row[mCols.wlkpFlag]) === 1 || row[mCols.periodeAwal] || row[mCols.periodeAkhir])) {
          const vf = parseExcelDate(row[mCols.periodeAwal]);
          const vu = parseExcelDate(row[mCols.periodeAkhir]);
          documents.push({
            type: 'WLKP',
            description: 'WLKP KEMNAKER',
            location,
            validFrom: vf,
            validUntil: vu,
            pic: null,
            rawStatus: 'Aktif',
            remainingDays: 0,
            notes: null
          });
        }

        if (mCols.gensetFlag !== undefined && Number(row[mCols.gensetFlag]) === 1) {
          const vf = parseExcelDate(row[mCols.gensetAwal]);
          documents.push({
            type: 'K3',
            description: 'SERTIFIKASI K3 / GENSET',
            location,
            validFrom: vf,
            validUntil: null,
            pic: null,
            rawStatus: 'Aktif',
            remainingDays: 0,
            notes: null
          });
        }

        if (documents.length > 0) {
          allData.push({
            storeName: isHo ? null : storeName,
            location,
            entityName: 'Biensi',
            documents
          });
        }
      }
      continue;
    }

    // Ekstrak baris data di bawah header
    for (let r = listHeaderRow + 1; r < rawMatrix.length; r++) {
      const row = rawMatrix[r] || [];
      const rawPermitType = listColMap.permitType !== undefined ? row[listColMap.permitType] : null;
      const rawDocName = listColMap.documentName !== undefined ? row[listColMap.documentName] : null;
      const rawStoreName = listColMap.storeName !== undefined ? row[listColMap.storeName] : null;
      const rawLocation = listColMap.location !== undefined ? row[listColMap.location] : null;

      if (!rawPermitType && !rawDocName && !rawStoreName) continue;

      const permitType = String(rawPermitType || rawDocName || 'Perijinan').trim();
      if (permitType.toUpperCase().includes('JENIS PERIJINAN')) continue;

      const storeName = rawStoreName ? String(rawStoreName).trim() : null;
      const location = rawLocation ? String(rawLocation).trim() : (storeName || 'HO');
      const rawSisaHari = listColMap.remainingDays !== undefined ? parseInt(row[listColMap.remainingDays], 10) : 0;

      allData.push({
        storeName,
        location,
        entityName: listColMap.entityName !== undefined && row[listColMap.entityName] ? String(row[listColMap.entityName]).trim() : 'Biensi',
        documents: [
          {
            type: permitType,
            description: rawDocName ? String(rawDocName).trim() : permitType,
            location,
            validFrom: listColMap.validFrom !== undefined ? parseExcelDate(row[listColMap.validFrom]) : null,
            validUntil: listColMap.validUntil !== undefined ? parseExcelDate(row[listColMap.validUntil]) : null,
            pic: listColMap.pic !== undefined && row[listColMap.pic] ? String(row[listColMap.pic]).trim() : null,
            rawStatus: listColMap.status !== undefined && row[listColMap.status] ? String(row[listColMap.status]).trim() : 'Aktif',
            remainingDays: isNaN(rawSisaHari) ? 0 : rawSisaHari,
            notes: listColMap.notes !== undefined && row[listColMap.notes] ? String(row[listColMap.notes]).trim() : null
          }
        ]
      });
    }
  }

  if (allData.length === 0) {
    throw new Error('Gagal membaca data. Pastikan format tabel memiliki kolom Jenis Perijinan / Nama Toko yang valid.');
  }

  return await repository.processBulkCompliance(allData);
};

module.exports = { importComplianceData, getDashboardData: repository.getDashboardData };