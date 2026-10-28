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

  // 1. Identifikasi sheet yang berisi data karyawan (HO & Toko)
  let targetSheets = workbook.SheetNames.filter(name => {
    const lower = name.toLowerCase();
    return lower.includes('demografi') || lower.includes('karyawan') || lower.includes('pegawai');
  });

  // 2. Fallback: jika tidak ada kata 'demografi'/'karyawan' (misal template 1 sheet), cari sheet yang memiliki header NIK/Nama
  if (targetSheets.length === 0) {
    targetSheets = workbook.SheetNames.filter(name => {
      const lower = name.toLowerCase();
      // Lewati sheet non-karyawan
      if (lower.includes('turnover') || lower.includes('kehadiran') || lower.includes('sales') || 
          lower.includes('fraud') || lower.includes('kasus') || lower.includes('phase') || 
          lower.includes('wlkp') || lower.includes('critical') || lower.includes('visual')) {
        return false;
      }
      const preview = xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })[0] || [];
      const headerStr = preview.map(c => String(c || '').toUpperCase().replace(/\s+/g, '')).join(' ');
      return headerStr.includes('EMPLOYEENO') || headerStr.includes('NAMAKARYAWAN') || headerStr.includes('NIK');
    });
  }

  // 3. Fallback terakhir jika tetap tidak ditemukan (template standar polos)
  if (targetSheets.length === 0) {
    targetSheets = [workbook.SheetNames[0]];
  }

  let rawExcelData = [];
  for (const sheetName of targetSheets) {
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    rawExcelData.push(...sheetData);
  }

  const formattedData = rawExcelData.map(row => {
    // Tangani BPJS yang isinya bisa "Terdaftar" atau "Sudah Terdaftar"
    const bpjsKesehatanString = String(getValue(row, 'bpjskesehatan') || '');
    const bpjsKetenagakerjaanString = String(getValue(row, 'bpjsketenagakerjaan') || '');
    const isBpjsKesehatanValid = bpjsKesehatanString.toLowerCase().includes('terdaftar');
    const isBpjsKetenagakerjaanValid = bpjsKetenagakerjaanString.toLowerCase().includes('terdaftar');

    return {
      employeeNo: String(getValue(row, 'employeeno') || getValue(row, 'nik') || ''),
      fullName: getValue(row, 'namakaryawan') || getValue(row, 'nama') || 'TIDAK ADA NAMA',
      gender: getValue(row, 'jeniskelamin') || null,
      birthDate: excelDateToJSDate(getValue(row, 'tanggallahir')),
      educationLevel: getValue(row, 'pendidikanterakhir') || null,
      employmentType: getValue(row, 'statuskaryawan') || 'KONTRAK',
      joinDate: excelDateToJSDate(getValue(row, 'tglmskkrj') || getValue(row, 'tanggalmasukkerja')) || new Date(),
      endDate: excelDateToJSDate(getValue(row, 'tglhabiskontrak') || getValue(row, 'tanggalhabiskontrak')),
      baseSalary: getValue(row, 'labourcostperemployee') || getValue(row, 'basesalary') || getValue(row, 'gajipokok'),
      
      // Boolean cerdas
      bpjsKetenagakerjaan: isBpjsKetenagakerjaanValid,
      bpjsKesehatan: isBpjsKesehatanValid,
      
      // Relasi Master Data dengan Fallback (Bisa baca Sheet HO atau Sheet Toko)
      divisionName: getValue(row, 'divisinewsyfa') || getValue(row, 'divisinew') || getValue(row, 'divisi'),
      departmentName: getValue(row, 'departemennewbyhrbp') || getValue(row, 'departemen'),
      
      // Unit hanya ada di Sheet HO, Store hanya ada di Sheet Toko
      unitName: getValue(row, 'unitdeptbyhrbp') || getValue(row, 'unit'), 
      storeName: getValue(row, 'namatoko') || getValue(row, 'store') || getValue(row, 'showroom'),      
      
      positionName: getValue(row, 'jabatan') || getValue(row, 'posisi'),
      levelName: getValue(row, 'leveljabatan') || getValue(row, 'level')
    };
  }).filter(data => data.employeeNo && data.employeeNo !== 'undefined' && data.employeeNo.trim() !== '');

  if (formattedData.length === 0) {
    return { sukses: 0, gagal: 0, errorList: ["Tidak ada data valid yang bisa dibaca. Pastikan baris pertama adalah header dengan kolom Employee No dan Nama Karyawan."] };
  }

  // Lempar data ke Repository!
  const importResult = await repository.processBulkImport(formattedData);

  // Auto-generate reporting periods & snapshots agar langsung tampil di Dashboard
  await syncSnapshotsAfterEmployeeImport(workbook.SheetNames);

  return importResult;
};


const detectMonthYear = (sheetNames) => {
  const months = {
    'jan': 1, 'januari': 1, 'feb': 2, 'februari': 2, 'mar': 3, 'maret': 3,
    'apr': 4, 'april': 4, 'mei': 5, 'may': 5, 'jun': 6, 'juni': 6,
    'jul': 7, 'juli': 7, 'agu': 8, 'agustus': 8, 'aug': 8,
    'sep': 9, 'september': 9, 'okt': 10, 'oktober': 10, 'oct': 10,
    'nov': 11, 'november': 11, 'des': 12, 'desember': 12, 'dec': 12
  };

  for (const name of sheetNames) {
    const lower = name.toLowerCase();
    for (const [mName, mNum] of Object.entries(months)) {
      if (lower.includes(mName)) {
        const matchYear = lower.match(/202\d|2\d/);
        let year = 2026;
        if (matchYear) {
          year = matchYear[0].length === 2 ? 2000 + parseInt(matchYear[0], 10) : parseInt(matchYear[0], 10);
        }
        return { year, month: mNum };
      }
    }
  }
  return { year: 2026, month: 9 };
};

const syncSnapshotsAfterEmployeeImport = async (sheetNames) => {
  try {
    const prisma = require('../../config/database');
    const { year: yr, month: m } = detectMonthYear(sheetNames);

    // 1. Pastikan periode untuk bulan yang diimpor sudah ada
    let period = await prisma.reportingPeriod.findFirst({
      where: { year: yr, month: m }
    });
    if (!period) {
      const periodStart = new Date(Date.UTC(yr, m - 1, 1));
      const periodEnd = new Date(Date.UTC(yr, m, 0));
      period = await prisma.reportingPeriod.create({
        data: { year: yr, month: m, periodStart, periodEnd }
      });
    }

    // 2. Ambil seluruh karyawan aktif dari master data
    const activeEmployees = await prisma.employee.findMany({
      where: { status: 'ACTIVE', gender: { not: null } },
      include: { position: true }
    });

    if (activeEmployees.length === 0) return;

    // 3. Sinkronkan snapshot HANYA untuk periode bulan yang diimpor
    const snapRows = activeEmployees.map(emp => {
      let status = 'ACTIVE';
      if (emp.endDate && new Date(emp.endDate) < new Date(period.periodEnd)) status = 'INACTIVE';
      return {
        periodId: period.id,
        employeeId: emp.id,
        divisionId: emp.divisionId,
        departmentId: emp.departmentId,
        positionId: emp.positionId,
        storeId: emp.storeId,
        employeeLevel: emp.position?.employeeLevel || null,
        employmentType: emp.employmentType,
        ageYears: emp.birthDate ? (period.year - new Date(emp.birthDate).getFullYear()) : null,
        tenureYears: emp.joinDate ? Math.max(0, (new Date(period.periodEnd) - new Date(emp.joinDate)) / (1000 * 60 * 60 * 24 * 365.25)) : null,
        employmentStatus: status,
        bpjsKetenagakerjaan: Boolean(emp.bpjsKetenagakerjaan),
        bpjsKesehatan: Boolean(emp.bpjsKesehatan),
        budgetLabourCost: emp.baseSalary || 0,
        actualLabourCost: null
      };
    });

    await prisma.employeeMonthlySnapshot.createMany({
      data: snapRows,
      skipDuplicates: true
    });
  } catch (err) {
    console.error('Error auto-syncing snapshots after import:', err.message);
  }
};

module.exports = { processExcelImport };
