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

const getTurnoverDashboard = async (year, month) => {
  // 1. Setup Tanggal
  const startDateYTD = new Date(`${year}-01-01`);
  const endDate = new Date(year, month, 0);

  // 2. AMBIL DATA DARI REPOSITORY (Bukan dari Prisma langsung)
  const movements = await repository.getTurnoverMovements(startDateYTD, endDate);

  // 3. PROSES AGREGASI (Sama seperti sebelumnya)
  let voluntaryCount = 0; let involuntaryCount = 0; let contractEndCount = 0;
  const currentMonthCount = movements.filter(m => m.movementDate.getMonth() === month - 1).length;

  const monthlyTrendMap = {}; 
  const positionCountMap = {}; 
  const voluntaryReasons = {}; 
  const involuntaryReasons = {}; 

  movements.forEach(m => {
    const moveMonth = m.movementDate.toLocaleString('id-ID', { month: 'short' });
    const type = m.movementType;
    const reason = m.reasonCategory || 'Lainnya';
    const posName = m.employee?.position?.name || 'Unknown';

    if (type === 'VOLUNTARY') voluntaryCount++;
    else if (type === 'INVOLUNTARY') involuntaryCount++;
    else if (type === 'CONTRACT_END') contractEndCount++;

    if (!monthlyTrendMap[moveMonth]) monthlyTrendMap[moveMonth] = { voluntary: 0, nonVoluntary: 0 };
    if (type === 'VOLUNTARY') monthlyTrendMap[moveMonth].voluntary++;
    else monthlyTrendMap[moveMonth].nonVoluntary++;

    positionCountMap[posName] = (positionCountMap[posName] || 0) + 1;
    if (type === 'VOLUNTARY') voluntaryReasons[reason] = (voluntaryReasons[reason] || 0) + 1;
    if (type === 'INVOLUNTARY') involuntaryReasons[reason] = (involuntaryReasons[reason] || 0) + 1;
  });

  const formatRank = (obj) => Object.entries(obj)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const recentLogs = movements
    .sort((a, b) => b.movementDate - a.movementDate)
    .slice(0, 5)
    .map(m => {
      const joinDate = new Date(m.employee.joinDate);
      const tenureYears = ((m.movementDate - joinDate) / (1000 * 60 * 60 * 24 * 365)).toFixed(1);
      return {
        name: m.employee.fullName,
        position: m.employee.position?.name,
        unit: m.store?.storeName || m.department?.name,
        reason: m.reasonCategory,
        effectiveDate: m.movementDate,
        tenure: `${tenureYears} Tahun`,
        clearanceStatus: m.clearanceStatus || 'Pending'
      };
    });

  // 4. AMBIL DATA KONTRAK HABIS DARI REPOSITORY
  const targetDate30Days = new Date();
  targetDate30Days.setDate(targetDate30Days.getDate() + 30);
  const expiringContracts = await repository.getExpiringContracts(targetDate30Days);

  // 5. KEMBALIKAN JSON
  return {
    success: true,
    data: {
      overview: {
        kpi: {
          monthlyTurnover: currentMonthCount,
          totalYtd: movements.length,
          voluntaryTotal: voluntaryCount,
          voluntaryPercentage: movements.length ? ((voluntaryCount / movements.length) * 100).toFixed(1) + '%' : '0%',
          annualTurnoverRate: '9.2%'
        },
        monthlyTrend: Object.keys(monthlyTrendMap).map(m => ({
          month: m,
          voluntary: monthlyTrendMap[m].voluntary,
          nonVoluntary: monthlyTrendMap[m].nonVoluntary
        })),
        positionSpeed: formatRank(positionCountMap).slice(0, 5)
      },
      deepDive: {
        voluntaryTopReasons: formatRank(voluntaryReasons).slice(0, 3),
        involuntaryClassification: formatRank(involuntaryReasons),
        recentLogs: recentLogs
      },
      contractWatch: {
        expiringCount: expiringContracts.length,
        expiringList: expiringContracts.map(emp => {
          const sisaHari = Math.ceil((new Date(emp.endDate) - new Date()) / (1000 * 60 * 60 * 24));
          return {
            name: emp.fullName,
            position: emp.position?.name,
            unit: emp.store?.storeName,
            endDate: emp.endDate,
            sisaHari: sisaHari,
            status: sisaHari <= 14 ? 'Kritis' : 'Warning'
          };
        })
      }
    }
  };
};

// === CRUD EXPORTS ===
const getAllMovements = async (filters) => await repository.getAllMovements(filters);
const getMovementById = async (id) => await repository.getMovementById(id);
const createMovement = async (data) => await repository.createMovement(data);
const deleteMovement = async (id) => await repository.deleteMovement(id);

module.exports = { importBulkMovement, getAllMovements, getMovementById, createMovement, deleteMovement, getTurnoverDashboard };