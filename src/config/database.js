require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// 1. Buat koneksi Pool bawaan Node.js ke PostgreSQL
// Pastikan Anda memiliki DATABASE_URL di file .env Anda
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

// 2. Hubungkan Pool tersebut dengan Prisma Adapter
const adapter = new PrismaPg(pool);

// 3. Masukkan adapter ke dalam Prisma Client
const prisma = new PrismaClient({ adapter });

module.exports = prisma;