const service = require('./service');
const xlsx = require('xlsx');
const fs = require('fs');
const { success } = require('zod');
const { getAttendanceAggregate } = require('./repository');

const parseExcel = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0]; 
  const rawSheet = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }); // Baca sebagai Array 2D
  
  let headerRowIndex = -1;
  
  // 1. Cari baris yang mengandung kata "BULAN"
  for (let i = 0; i < rawSheet.length; i++) {
    if (rawSheet[i].some(cell => typeof cell === 'string' && cell.toUpperCase().includes('BULAN'))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) throw new Error("Format tidak dikenali, tidak ada kolom 'BULAN'");

  // 2. Jadikan baris itu sebagai Header, dan ambil data di bawahnya
  const headers = rawSheet[headerRowIndex];
  const dataRows = rawSheet.slice(headerRowIndex + 1);

  // 3. Mapping kembali menjadi JSON yang bersih (Abaikan kolom NaN/kosong)
  const cleanData = dataRows.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      if (header && typeof header === 'string') {
        // Hapus spasi berlebih dari nama header
        const cleanHeader = header.replace(/\s+/g, ' ').trim().toUpperCase();
        obj[cleanHeader] = row[index];
      }
    });
    return obj;
  }).filter(row => row['BULAN']); // Pastikan hanya baris yang punya nama bulan yang diambil

  return cleanData;
};

const parseExcel2D = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0]; 
  // { header: 1 } artinya jadikan Array di dalam Array, persis seperti grid Excel
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }); 
};

const createPeriod = async (req, res) => {
  try {
    const data = await service.openNewPeriod(req.body.year, req.body.month);
    res.status(201).json({ success: true, message: `Periode berhasil dibuka`, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getAllPeriods = async (req, res) => {
  try {
    const data = await service.getPeriods();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllAttendance = async (req, res) => {
  try {
    const data = await service.getAttendanceAggregate();
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllSales = async (req, res) => {
  try {
    const data = await service.getAllSales();
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAttendance = async (req, res) => {
  try {
    const { periodId } = req.params;
    const data = await service.getAttendance(periodId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

// Mengambil data sales
const getSales = async (req, res) => {
  try {
    const { periodId } = req.params;
    const data = await service.getSales(periodId);
    res.status(200).json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const generateMonthlySnapshot = async (req, res) => {
  try {
    const data = await service.generateSnapshot(req.params.periodId);
    res.status(200).json({ success: true, message: `Snapshot berhasil di-generate`, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSummary = async (req, res) => {
  try {
    const data = await service.getDashboardSummary(req.params.periodId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- HANDLER UPLOAD DENGAN PARSER ---

const uploadAttendance = async (req, res) => {
  try {
    if (!req.file) throw new Error("File Excel absensi wajib diunggah!");
    const rawData = parseExcel(req.file.path);
    // Ganti pemanggilan service
    const data = await service.importAttendanceAggregate(req.params.periodId, rawData);
    res.status(201).json({ success: true, message: `Data absensi global ter-import`, fileName: req.file.filename });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ success: false, message: error.message });
  }
};

const uploadActualLabourCost = async (req, res) => {
  try {
    if (!req.file) throw new Error("File Excel labour cost wajib diunggah!");
    const rawData = parseExcel(req.file.path);
    // Ganti pemanggilan service
    const data = await service.importActualLabourCost(req.params.periodId, rawData);
    res.status(201).json({ success: true, message: `Berhasil update gaji aktual untuk ${data.imported} karyawan`, fileName: req.file.filename });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ success: false, message: error.message });
  }
};

const uploadSales = async (req, res) => {
  try {
    if (!req.file) throw new Error("File Excel sales wajib diunggah!");
    const rawData = parseExcel(req.file.path);
    const data = await service.importSales(req.params.periodId, rawData);
    
    res.status(201).json({ 
      success: true, 
      message: `Berhasil import ${data.imported} data sales`,
      fileName: req.file.filename
    });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ success: false, message: error.message });
  }
};

// const uploadAttendanceUniversal = async (req, res) => {
//   try {
//     if (!req.file) throw new Error("File Excel absensi wajib diunggah!");
    
//     const rawData = parseExcel(req.file.path);
//     // Panggil Service TANPA mengirimkan periodId!
//     const data = await service.importAttendanceAggregate(rawData);
    
//     res.status(201).json({ 
//       success: true, 
//       message: `Berhasil memproses ${data.imported} bulan data absensi!`, 
//       fileName: req.file.filename 
//     });
//   } catch (error) {
//     if (req.file) fs.unlinkSync(req.file.path);
//     res.status(400).json({ success: false, message: error.message });
//   }
// };

const uploadAttendanceUniversal = async (req, res) => {
  try {
    if (!req.file) throw new Error("File Excel wajib diunggah!");
    const raw2DArray = parseExcel2D(req.file.path);
    const data = await service.importAttendanceUniversal(raw2DArray);
    res.status(201).json({ success: true, message: `Berhasil memproses ${data.imported} bulan absensi!` });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ success: false, message: error.message });
  }
};

const uploadSalesUniversal = async (req, res) => {
  try {
    if (!req.file) throw new Error("File Excel wajib diunggah!");
    const data = await service.importSalesUniversal(req.file.path);
    res.status(201).json({ success: true, message: `Berhasil memproses ${data.imported} data sales toko!` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { 
  createPeriod, getAllPeriods, generateMonthlySnapshot,
  uploadAttendance, uploadActualLabourCost, uploadSales, getSummary, 
  uploadAttendanceUniversal, uploadSalesUniversal, getAttendance, getSales,
  getAttendanceAggregate, getAllSales, getAllAttendance
};