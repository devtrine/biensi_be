const xlsx = require('xlsx');
const repository = require('./repository');

// Helper: Ubah serial Excel ke Tanggal dengan Anti-Poison
const excelDateToJSDate = (serial) => {
  if (!serial) return null;
  
  let date;
  if (typeof serial === 'string') {
    date = new Date(serial);
  } else {
    const utc_days = Math.floor(serial - 25569);
    date = new Date(utc_days * 86400 * 1000);
  }

  // Jika hasilnya Invalid Date (NaN), kembalikan null agar Prisma tidak crash
  return isNaN(date.getTime()) ? null : date;
};

// HELPER ANTI-BADAI: Menghapus semua spasi & enter dari nama kolom Excel
const getValue = (row, targetKey) => {
  const target = targetKey.replace(/\s+/g, '').toLowerCase(); // Cth: "employeeno"
  
  const exactKey = Object.keys(row).find(
    key => key.replace(/\s+/g, '').toLowerCase() === target
  );
  
  return exactKey ? row[exactKey] : undefined;
};

const processExcelImport = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rawExcelData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

const formattedData = rawExcelData.map(row => {
    // Tangani BPJS yang isinya bisa "Terdaftar" atau "Sudah Terdaftar"
    const bpjsKesehatanString = getValue(row, 'bpjskesehatan') || '';
    const bpjsKetenagakerjaanString = getValue(row, 'bpjsketenagakerjaan') || '';
    const isBpjsKesehatanValid = bpjsKesehatanString.toLowerCase().includes('terdaftar');
    const isBpjsKetenagakerjaanValid = bpjsKetenagakerjaanString.toLowerCase().includes('terdaftar');

    return {
      employeeNo: String(getValue(row, 'employeeno') || ''),
      fullName: getValue(row, 'namakaryawan') || 'TIDAK ADA NAMA',
      gender: getValue(row, 'jeniskelamin') || null,
      birthDate: excelDateToJSDate(getValue(row, 'tanggallahir')),
      educationLevel: getValue(row, 'pendidikanterakhir') || null,
      employmentType: getValue(row, 'statuskaryawan') || 'KONTRAK',
      joinDate: excelDateToJSDate(getValue(row, 'tglmskkrj')) || new Date(),
      endDate: excelDateToJSDate(getValue(row, 'tglhabiskontrak')),
      baseSalary: getValue(row, 'labourcostperemployee') || getValue(row, 'basesalary'),
      
      // Boolean cerdas
      bpjsKetenagakerjaan: isBpjsKetenagakerjaanValid,
      bpjsKesehatan: isBpjsKesehatanValid,
      
      // Relasi Master Data dengan Fallback (Bisa baca Sheet 1 atau Sheet 2)
      divisionName: getValue(row, 'divisinewsyfa') || getValue(row, 'divisinew'),
      departmentName: getValue(row, 'departemennewbyhrbp'),
      
      // Unit hanya ada di Sheet 1, Store hanya ada di Sheet 2
      unitName: getValue(row, 'unitdeptbyhrbp'), 
      storeName: getValue(row, 'namatoko'),      
      
      positionName: getValue(row, 'jabatan'),
      levelName: getValue(row, 'leveljabatan')
    };
  }).filter(data => data.employeeNo && data.employeeNo !== 'undefined' && data.employeeNo.trim() !== '');
  // Filter di atas mencegah NIK kosong atau 'undefined' masuk ke Prisma

  if (formattedData.length === 0) {
    return { sukses: 0, gagal: 0, errorList: ["Tidak ada data valid yang bisa dibaca. Pastikan baris pertama adalah header."] };
  }

  // Lempar data ke Repository!
  return await repository.processBulkImport(formattedData);
};

module.exports = { processExcelImport };