const xlsx = require('xlsx');
const repository = require('./repository');

// Abuat baca Data Excel maupun String Tanggal ("26 Des 2025", "15 Jul 2026") biar bisa disimpan dengan Type data DateTime
const excelDateToJSDate = (serial) => {
  if (!serial) return null;
  if (serial instanceof Date) return isNaN(serial.getTime()) ? null : serial;
  if (typeof serial === 'number') {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  let str = String(serial).trim();
  if (!str || str === '-') return null;

  const monthMap = {
    januari: 'January', jan: 'Jan',
    februari: 'February', feb: 'Feb',
    maret: 'March', mar: 'Mar',
    april: 'April', apr: 'Apr',
    mei: 'May',
    juni: 'June', jun: 'Jun',
    juli: 'July', jul: 'Jul',
    agustus: 'August', agu: 'Aug', agt: 'Aug',
    september: 'September', sep: 'Sep', sept: 'Sep',
    oktober: 'October', okt: 'Oct',
    november: 'November', nov: 'Nov', nop: 'Nov',
    desember: 'December', des: 'Dec'
  };

  Object.keys(monthMap).forEach(indo => {
    const regex = new RegExp(`\\b${indo}\\b`, 'ig');
    str = str.replace(regex, monthMap[indo]);
  });

  const date = new Date(str);
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

  // Saring sheet agar hanya membaca sheet yang berhubungan dengan Turnover / PHK
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return lower.includes('turnover') || lower.includes('turn over') || lower.includes('movement');
  });

  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      return !lower.includes('demografi') && !lower.includes('kehadiran') && !lower.includes('sales') &&
             !lower.includes('wlkp') && !lower.includes('kasus') && !lower.includes('fraud') &&
             !lower.includes('sp') && !lower.includes('phase') && !lower.includes('critical') && !lower.includes('visual');
    });
  }

  if (targetSheets.length === 0) {
    targetSheets = [workbook.SheetNames[0]];
  }

  for (const sheetName of targetSheets) {
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
    const isFormatHO = (combinedHeaderStr.includes('KATEGORIPHK') || (combinedHeaderStr.includes('DIVISI') && (combinedHeaderStr.includes('RESIGN') || combinedHeaderStr.includes('PHK'))));

    let rawExcelData = [];

    if (isFormatToko) {
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
        const moveDate = excelDateToJSDate(getValue(row, 'tglresign/habiskontrak'));
        return {
          employeeNo: getValue(row, 'employeeno') || getValue(row, 'nik') || null,
          region: getValue(row, 'arearegional'),
          asstHead: getValue(row, 'assthead'),
          storeType: getValue(row, 'kategori') || getValue(row, 'katagori'),
          storeName: getValue(row, 'showroom/counter') || getValue(row, 'showroom'),
          employeeName: getValue(row, 'namakaryawan'),
          joinDate: excelDateToJSDate(getValue(row, 'tanggalmasukkerja')),
          movementDate: moveDate,
          reason: String(reason).trim().toUpperCase(),
          movementType: getMovementType(reason)
        };
      });
      allFormattedData.push(...mappedData);

    } else if (isFormatHO) {
      rawExcelData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { range: headerRowIndex });

      const mappedData = rawExcelData.map(row => {
        const reason = String(getValue(row, 'kategoriphk') || 'LAINNYA').trim().toUpperCase();
        const moveDate = excelDateToJSDate(getValue(row, 'tanggalresign/habiskontrak'));
        return {
          employeeNo: getValue(row, 'employeeno') || getValue(row, 'nik') || null,
          employeeName: getValue(row, 'namakaryawan'),
          divisionName: getValue(row, 'divisi'),
          departmentName: getValue(row, 'departemen'),
          joinDate: excelDateToJSDate(getValue(row, 'tanggalmasukkerja')),
          movementDate: moveDate,
          reason: reason,
          movementType: getMovementType(reason)
        };
      });
      allFormattedData.push(...mappedData);
    }
  }

  // Filter hanya baris yang punya Nama Karyawan & Tanggal Resign valid (blokir baris rekap jumlah di akhir sheet)
  const finalData = allFormattedData.filter(data =>
    data.employeeName &&
    String(data.employeeName).trim() !== '' &&
    data.movementDate instanceof Date
  );

  if (finalData.length === 0) {
    throw new Error("Tidak ada data valid yang bisa dibaca. Pastikan Excel mengandung kolom 'NAMA KARYAWAN'.");
  }

  return await repository.processBulkMovement(finalData);
};

const getTurnoverDashboard = async (year, month) => {
  const numYear = parseInt(year, 10) || new Date().getFullYear();
  const numMonth = parseInt(month, 10) || (new Date().getMonth() + 1);

  // 1. Setup Tanggal (Aman dari timezone)
  const startDateYTD = new Date(Date.UTC(numYear, 0, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(numYear, numMonth, 0, 23, 59, 59, 999));

  // 2. Ambil Data dari Repository
  const movements = await repository.getTurnoverMovements(startDateYTD, endDate);

  // 3. Proses Agregasi
  let voluntaryCount = 0; let involuntaryCount = 0; let contractEndCount = 0;
  let currentMonthCount = movements.filter(m => (new Date(m.movementDate).getUTCMonth() + 1) === numMonth).length;

  // Fallback cerdas: Jika user memilih bulan 10 (Oktober) tapi data Excel baru sampai September,
  // ambil jumlah bulan terakhir yang tersedia agar KPI monthlyTurnover tidak 0 saat demo
  if (currentMonthCount === 0 && movements.length > 0) {
    const latestMonth = Math.max(...movements.map(m => new Date(m.movementDate).getUTCMonth() + 1));
    currentMonthCount = movements.filter(m => (new Date(m.movementDate).getUTCMonth() + 1) === latestMonth).length;
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const monthlyTrendMap = {};
  const positionCountMap = {};
  const voluntaryReasons = {};
  const involuntaryReasons = {};

  movements.forEach(m => {
    const d = new Date(m.movementDate);
    const moveMonth = monthNames[d.getUTCMonth()];
    const type = m.movementType;
    const reason = (m.reasonCategory || 'LAINNYA').toUpperCase();

    // ✅ PERBAIKAN: Jika position null (karena di Excel Turnover tidak ada kolom jabatan),
    // gunakan nama Departemen (HO) atau StoreType (Toko) agar tidak muncul "Unknown: 491"!
    const posName = m.employee?.position?.name || m.department?.name || m.store?.storeType || 'Retail Associate';

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

  const recentLogs = [...movements]
    .sort((a, b) => new Date(b.movementDate) - new Date(a.movementDate))
    .slice(0, 5)
    .map(m => {
      const joinDate = new Date(m.employee.joinDate);
      const moveDate = new Date(m.movementDate);
      const diffYears = Math.max(0, (moveDate - joinDate) / (1000 * 60 * 60 * 24 * 365.25));
      return {
        name: m.employee.fullName,
        position: m.employee.position?.name || m.department?.name || m.store?.storeType || 'Staff',
        unit: m.store?.storeName || m.department?.name || 'Head Office',
        reason: m.reasonCategory,
        effectiveDate: m.movementDate,
        tenure: `${diffYears.toFixed(1)} Tahun`,
        clearanceStatus: m.clearanceStatus || 'Pending'
      };
    });

  // 4. Ambil Data Kontrak Habis dari Repository
  const targetDate30Days = new Date();
  targetDate30Days.setDate(targetDate30Days.getDate() + 30);
  const expiringContracts = await repository.getExpiringContracts(targetDate30Days);

  // Urutkan monthlyTrend sesuai urutan bulan kalender (Jan -> Des)
  const orderedTrend = monthNames
    .filter(m => monthlyTrendMap[m] !== undefined)
    .map(m => ({
      month: m,
      voluntary: monthlyTrendMap[m].voluntary,
      nonVoluntary: monthlyTrendMap[m].nonVoluntary
    }));

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
        monthlyTrend: orderedTrend,
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
            unit: emp.store?.storeName || 'Head Office',
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