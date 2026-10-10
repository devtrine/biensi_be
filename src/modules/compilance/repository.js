const prisma = require('../../config/database');

const processBulkCompliance = async (parsedData) => {
  let successCount = 0; let errorList = [];

  for (const row of parsedData) {
    try {
      // 1. Cari atau Buat Toko
      const cleanStoreName = String(row.storeName).trim();
      let store = await prisma.store.findFirst({
        where: { storeName: { equals: cleanStoreName, mode: 'insensitive' } }
      });
      if (!store) {
        store = await prisma.store.create({
          data: { storeName: cleanStoreName, storeCode: `STR-${Date.now()}` }
        });
      }

      // 2. Loop dokumen apa saja yang ada di baris toko ini
      for (const doc of row.documents) {
        // Logika Status Sederhana (KADALUARSA vs PATUH)
        let status = 'PATUH';
        if (doc.validUntil) {
           const expiry = new Date(doc.validUntil);
           if (expiry < new Date()) status = 'KADALUARSA';
        }

        // Hapus data lama untuk tipe dokumen & toko yang sama (Mencegah Duplikat)
        await prisma.storeCompliance.deleteMany({
          where: { storeId: store.id, documentType: doc.type }
        });

        // Insert dokumen baru
        await prisma.storeCompliance.create({
          data: {
            storeId: store.id,
            documentType: doc.type,
            validFrom: doc.validFrom || null,
            validUntil: doc.validUntil || null,
            status: status
          }
        });
        successCount++;
      }
    } catch (error) {
      errorList.push(`Gagal memproses '${row.storeName}': ${error.message}`);
    }
  }

  return { successCount, failCount: errorList.length, errors: errorList };
};

// Fungsi GET Data untuk Dashboard
const getDashboardData = async () => {
    // Ambil semua data compliance
    const compliances = await prisma.storeCompliance.findMany({
        include: { store: true }
    });

    // Menghitung KPI
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    let kpi = { patuh: 0, akanJatuhTempo: 0, kadaluarsa: 0 };
    let tableData = [];

    compliances.forEach(c => {
        let statusKalkulasi = c.status;
        
        if (c.validUntil) {
            const expiry = new Date(c.validUntil);
            if (expiry < today) {
                statusKalkulasi = 'KADALUARSA';
                kpi.kadaluarsa++;
            } else if (expiry <= thirtyDaysFromNow) {
                statusKalkulasi = 'SEGERA HABIS';
                kpi.akanJatuhTempo++;
            } else {
                 statusKalkulasi = 'PATUH';
                 kpi.patuh++;
            }
        } else {
             kpi.patuh++; // Asumsi patuh jika tidak ada tanggal
        }

        // Susun untuk Tabel UI
        tableData.push({
            id: c.id,
            area: c.documentType,
            description: `Perizinan ${c.documentType} untuk ${c.store.storeName}`,
            entity: c.store.storeName,
            validUntil: c.validUntil,
            status: statusKalkulasi
        });
    });

    return { kpi, tableData };
};

module.exports = { processBulkCompliance, getDashboardData };