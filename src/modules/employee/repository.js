const prisma = require('../../config/database');

const findAllEmployees = async (searchQuery = '') => {
  return await prisma.employee.findMany({
    where: searchQuery ? {
      OR: [
        { fullName: { contains: searchQuery, mode: 'insensitive' } },
        { employeeNo: { contains: searchQuery, mode: 'insensitive' } }
      ]
    } : {},
    include: {
      division: true,
      department: true,
      unit: true,        // Relasi baru
      position: true,
      store: true
    },
    orderBy: { fullName: 'asc' }
  });
};

const findEmployeeById = async (id) => {
  return await prisma.employee.findUnique({
    where: { id }, // UUID tidak perlu parseInt
    include: { division: true, department: true, unit: true, position: true, store: true }
  });
};

const findEmployeeByNo = async (employeeNo) => {
  return await prisma.employee.findUnique({ where: { employeeNo } });
};

const createEmployee = async (data) => {
  // 1. Ekstrak semua relasi ID keluar dari objek data, sisanya masuk ke 'basicData'
  const { 
    divisionId, 
    departmentId, 
    unitId, 
    positionId, 
    storeId, 
    ...basicData // Berisi employeeNo, fullName, birthDate, dll (tanpa Id relasi)
  } = data;

  // 2. Kirim ke Prisma dengan format 'connect' yang aman
  return await prisma.employee.create({
    data: {
      ...basicData, // Data bersih dimasukkan
      
      // Jika ID ada nilainya, kita buatkan objek connect-nya
      ...(divisionId ? { division: { connect: { id: divisionId } } } : {}),
      ...(departmentId ? { department: { connect: { id: departmentId } } } : {}),
      ...(unitId ? { unit: { connect: { id: unitId } } } : {}),
      ...(positionId ? { position: { connect: { id: positionId } } } : {}),
      ...(storeId ? { store: { connect: { id: storeId } } } : {})
    }
  });
};

const updateEmployee = async (id, data) => {
  // Sama, ekstrak dulu sebelum update
  const { 
    divisionId, 
    departmentId, 
    unitId, 
    positionId, 
    storeId, 
    ...basicData 
  } = data;

  return await prisma.employee.update({
    where: { id },
    data: {
      ...basicData,
      
      ...(divisionId !== undefined && { 
        division: divisionId ? { connect: { id: divisionId } } : { disconnect: true } 
      }),
      ...(departmentId !== undefined && { 
        department: departmentId ? { connect: { id: departmentId } } : { disconnect: true } 
      }),
      ...(unitId !== undefined && { 
        unit: unitId ? { connect: { id: unitId } } : { disconnect: true } 
      }),
      ...(positionId !== undefined && { 
        position: positionId ? { connect: { id: positionId } } : { disconnect: true } 
      }),
      ...(storeId !== undefined && { 
        store: storeId ? { connect: { id: storeId } } : { disconnect: true } 
      })
    }
  });
};

const deleteEmployee = async (id) => {
  return await prisma.employee.delete({ where: { id } });
};

module.exports = {
  findAllEmployees, findEmployeeById, findEmployeeByNo,
  createEmployee, updateEmployee, deleteEmployee
};