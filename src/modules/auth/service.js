const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const repository = require('./repository');

const login = async (email, password) => {
  const user = await repository.findUserByEmail(email);
  if (!user || !user.isActive) {
    throw new Error('Email tidak terdaftar atau akun non-aktif');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Password salah');
  }

  // Buat Payload JWT
  const payload = {
    id: user.id,
    roleId: user.roleId,
    permissions: user.role.permissions
  };
  
  // Pastikan Anda sudah menambahkan JWT_SECRET di file .env
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name
    },
    token
  };
};

module.exports = {
  login
};