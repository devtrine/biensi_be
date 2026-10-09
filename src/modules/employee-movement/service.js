const xlsx = require('xlsx');
const repository = require('./repository');

// === HELPER FUNCTIONS ===
const excelDateToJSDate = (serial) => {
  if (!serial) return null;
  let date = typeof serial === 'string' ? new Date(serial) : new Date((serial - 25569) * 86400 * 1000);
  return isNaN(date.getTime()) ? null : date;
};

const getValue = (row, targetKey) => {
  const target = targetKey.replace(/\s+/g, '').toLowerCase();
  const exactKey = Object.keys(row).find(key => key.replace(/\s+/g, '').toLowerCase() === target);
  return exactKey ? row[exactKey] : undefined;
};

const determineReasonToko = (row) => {
  if (getValue(row, 'resignsop')) return 'RESIGN SOP';
  if (getValue(row, 'resignkasus')) return 'RESIGN KASUS';
  if (getValue(row, 'habiskontrak')) return 'HABIS KONTRAK';
  if (getValue(row, 'closingtoko')) return 'CLOSING TOKO';
  if (getValue(row, 'phk')) return 'PHK';
  return 'LAINNYA';
};

const getMovementType = (reason) => {
  if (!reason) return 'VOLUNTARY';
  const involuntaryReasons = ['PHK', 'HABIS KONTRAK', 'CLOSING TOKO', 'RESIGN KASUS', 'EFISIENSI'];
  const isInv = involuntaryReasons.some(inv => reason.toUpperCase().includes(inv));
  return isInv ? 'INVOLUNTARY' : 'VOLUNTARY';
};

// === MAIN BULK IMPORT LOGIC ===
const importBulkMovement = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const allFormattedData = []; 

  for (const sheetName of workbook.SheetNames) {
    const rawMatrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    if (rawMatrix.length === 0) continue;

    let headerRowIndex = 0;
    for (let i = 0; i < rawMatrix.length; i++) {
      const rowString = (rawMatrix[i] || []).join('').toUpperCase().replace(/\s+/g, '');
      if (rowString.includes('NAMAKARYAWAN') || rowString.includes('NAMA')) {
        headerRowIndex = i;
        break;
      }
    }

    const headers1 = rawMatrix[headerRowIndex] || [];
    const headers2 = rawMatrix[headerRowIndex + 1] || [];
    
    const combinedHeaderStr = headers1.join('').toUpperCase() + headers2.join('').toUpperCase();
    const isFormatToko = combinedHeaderStr.includes('SHOWROOM') || combinedHeaderStr.includes('REGIONAL');
    const isFormatHO = combinedHeaderStr.includes('DIVISI') || combinedHeaderStr.includes('DEPARTEMEN') || combinedHeaderStr.includes('KATEGORIPHK');

    let rawExcelData = [];

    if (isFormatToko) {
      console.log(`-> [Employee Movement] Membaca Sheet '${sheetName}' (Format Toko)`);
      
      let cleanHeaders = [];
      const maxCols = Math.max(headers1.length, headers2.length);
      
      for (let c = 0; c < maxCols; c++) {
        const h1 = String(headers1[c] || '').trim();
        const h2 = String(headers2[c] || '').trim();
        
        if (h2 && (!h1 || h1.toUpperCase() === 'ALASAN')) {
          cleanHeaders.push(h2);
        } else {
          cleanHeaders.push(h1);
        }
      }

      for (let r = headerRowIndex + 2; r < rawMatrix.length; r++) { 
        let rowObj = {};
        for (let c = 0; c < cleanHeaders.length; c++) {
          if (cleanHeaders[c]) rowObj[cleanHeaders[c]] = rawMatrix[r][c];
        }
        if (Object.keys(rowObj).length > 0) rawExcelData.push(rowObj);
      }

      const mappedData = rawExcelData.map(row => {
        const reason = determineReasonToko(row);
        return {
          region: getValue(row, 'arearegional'),
          asstHead: getValue(row, 'assthead'),
          storeType: getValue(row, 'kategori') || getValue(row, 'katagori'),
          storeName: getValue(row, 'showroom/counter') || getValue(row, 'showroom'),
          employeeName: getValue(row, 'namakaryawan'),
          joinDate: excelDateToJSDate(getValue(row, 'tanggalmasukkerja')),
          movementDate: excelDateToJSDate(getValue(row, 'tglresign/habiskontrak')) || new Date(),
          reason: reason,
          movementType: getMovementType(reason)
        };
      });
      allFormattedData.push(...mappedData);

    } 
    else if (isFormatHO) {
      console.log(`-> [Employee Movement] Membaca Sheet '${sheetName}' (Format Head Office)`);
      
      rawExcelData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { range: headerRowIndex });
      
      const mappedData = rawExcelData.map(row => {
        const reason = getValue(row, 'kategoriphk') || 'LAINNYA';
        return {
          employeeName: getValue(row, 'namakaryawan'),
          divisionName: getValue(row, 'divisi'),
          departmentName: getValue(row, 'departemen'),
          joinDate: excelDateToJSDate(getValue(row, 'tanggalmasukkerja')),
          movementDate: excelDateToJSDate(getValue(row, 'tanggalresign/habiskontrak')) || new Date(),
          reason: reason,
          movementType: getMovementType(reason)
        };
      });
      allFormattedData.push(...mappedData);
    } 
    else {
      console.log(`-> [Skip] Sheet '${sheetName}' dilewati karena bukan Format Toko maupun HO.`);
    }
  }

  const finalData = allFormattedData.filter(data => data.employeeName && String(data.employeeName).trim() !== '');
  
  if (finalData.length === 0) {
    throw new Error("Tidak ada data valid yang bisa dibaca. Pastikan Excel mengandung kolom 'NAMA KARYAWAN'.");
  }

  return await repository.processBulkMovement(finalData);
};

// === CRUD EXPORTS ===
const getAllMovements = async (filters) => await repository.getAllMovements(filters);
const getMovementById = async (id) => await repository.getMovementById(id);
const createMovement = async (data) => await repository.createMovement(data);
const deleteMovement = async (id) => await repository.deleteMovement(id);

module.exports = { importBulkMovement, getAllMovements, getMovementById, createMovement, deleteMovement };