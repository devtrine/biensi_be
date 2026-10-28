const prisma = require('../../config/database');

// Normalisasi nama toko untuk prevent duplicate
const resolveOrUpsertStore = async (rawStoreName) => {
  if (!rawStoreName) return null;
  const cleanName = String(rawStoreName).replace(/\s+/g, ' ').trim().toUpperCase();

  // Jangan buat baris Store jika kosong, "-", atau merupakan kode Head Office (HO)
  const invalidStoreNames = ['', '-', 'NULL', 'UNDEFINED', 'N/A', 'HO', 'HEAD OFFICE', 'KANTOR PUSAT'];
  if (invalidStoreNames.includes(cleanName)) {
    return null;
  }

  // Cari dengan exact case-insensitive
  let store = await prisma.store.findFirst({
    where: { storeName: { equals: cleanName, mode: 'insensitive' } }
  });

  // Buat toko baru HANYA jika benar-benar nama toko valid yang belum ada
  if (!store) {
    const randSuffix = Math.floor(100 + Math.random() * 900);
    store = await prisma.store.create({
      data: {
        storeName: cleanName,
        storeCode: `STR-${Date.now().toString().slice(-5)}${randSuffix}`
      }
    });
  }

  return store;
};

// Upsert dokumen wlkp
const upsertComplianceDoc = async (payload) => {
  const existing = await prisma.storeCompliance.findFirst({
    where: {
      storeId: payload.storeId,
      location: payload.location || null,
      documentType: { equals: payload.documentType, mode: 'insensitive' }
    }
  });

  if (existing) {
    return await prisma.storeCompliance.update({
      where: { id: existing.id },
      data: payload
    });
  }

  return await prisma.storeCompliance.create({
    data: payload
  });
};

const processBulkCompliance = async (parsedData) => {
  let successCount = 0;
  const errorList = [];

  for (const row of parsedData) {
    try {
      const store = await resolveOrUpsertStore(row.storeName);
      const storeId = store ? store.id : null;
      const defaultLocation = row.location || (store ? store.storeName : 'HO');

      for (const doc of row.documents) {
        const today = new Date();
        const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

        // Hitung sisa hari otomatis jika ada tanggal berakhir (validUntil)
        let calcRemainingDays = doc.remainingDays ?? 0;
        let status = 'PATUH';

        if (doc.validUntil) {
          const expiry = new Date(doc.validUntil);
          calcRemainingDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
          if (expiry < today) {
            status = 'KADALUARSA';
          } else if (expiry <= thirtyDaysFromNow) {
            status = 'SEGERA HABIS';
          }
        } else if (doc.rawStatus) {
          const stUpper = String(doc.rawStatus).toUpperCase();
          if (stUpper.includes('KADALUARSA') || stUpper.includes('EXPIRED')) status = 'KADALUARSA';
          else if (stUpper.includes('PROSES') || stUpper.includes('SEGERA')) status = 'SEGERA HABIS';
          else status = 'PATUH';
        }

        await upsertComplianceDoc({
          storeId,
          entityName: doc.entityName || row.entityName || 'Biensi',
          documentType: doc.type,
          description: doc.description || `Perizinan ${doc.type} (${defaultLocation})`,
          location: doc.location || defaultLocation,
          validFrom: doc.validFrom || null,
          validUntil: doc.validUntil || null,
          pic: doc.pic || null,
          status,
          remainingDays: calcRemainingDays,
          notes: doc.notes || null
        });
        successCount++;
      }
    } catch (error) {
      errorList.push(`Gagal memproses '${row.storeName || row.location || 'Baris Data'}': ${error.message}`);
    }
  }

  return { successCount, failCount: errorList.length, errors: errorList };
};

// Fungsi GET Data untuk Dashboard
const getDashboardData = async () => {
  const compliances = await prisma.storeCompliance.findMany({
    include: { store: true },
    orderBy: { createdAt: 'desc' }
  });

  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

  const kpi = { patuh: 0, akanJatuhTempo: 0, kadaluarsa: 0 };
  const tableData = [];

  compliances.forEach(c => {
    let statusKalkulasi = c.status || 'PATUH';
    let liveRemainingDays = c.remainingDays ?? 0;

    if (c.validUntil) {
      const expiry = new Date(c.validUntil);
      liveRemainingDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
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
      if (statusKalkulasi === 'KADALUARSA') kpi.kadaluarsa++;
      else if (statusKalkulasi === 'SEGERA HABIS') kpi.akanJatuhTempo++;
      else kpi.patuh++;
    }

    const displayEntity = c.store?.storeName || c.location || c.entityName || 'HO';
    const displayDesc = c.description || `Perizinan ${c.documentType} untuk ${displayEntity}`;

    tableData.push({
      id: c.id,
      area: c.documentType,
      description: displayDesc,
      entity: displayEntity,
      entityName: c.entityName || 'Biensi',
      storeName: c.store?.storeName || null,
      location: c.location || displayEntity,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      pic: c.pic || '-',
      remainingDays: Math.max(0, liveRemainingDays),
      notes: c.notes || '-',
      status: statusKalkulasi
    });
  });

  return { kpi, tableData };
};

module.exports = { processBulkCompliance, getDashboardData };