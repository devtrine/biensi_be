# 🚀 Setup Guide Backend HR

Panduan singkat untuk melakukan instalasi dan menjalankan *backend* HR Management di lingkungan lokal.

## 1. Prasyarat Sistem
* [Node.js](https://nodejs.org/) (Versi 16.x atau lebih baru)
* npm atau yarn
* Database Server aktif (PostgreSQL / MySQL / sesuai konfigurasi Prisma Anda)

## 2. Instalasi
Buka terminal, lakukan kloning repositori, dan masuk ke folder proyek:
```bash
git clone <url-repositori-anda>
cd Hr_Backend
npm install

3. Konfigurasi Environment
Buat sebuah file bernama .env di root directory proyek Anda. Isi dengan konfigurasi koneksi database dan port berikut:

Cuplikan kode
PORT=5000
DATABASE_URL="postgresql://user:password@localhost:5432/hr_database_anda"

4. Inisialisasi Database (Prisma)
Jalankan perintah berikut untuk generate Prisma Client dan menyinkronkan skema ke database lokal Anda:

Bash
npx prisma generate
npx prisma migrate dev --name_migration
npx prisma db seed

5. Menjalankan Server
Nyalakan server untuk mode development (menggunakan Nodemon):

Bash
node src/server.js
Jika indikator di terminal menunjukkan server berhasil menyala, sistem sudah siap menerima request di http://localhost:5000.