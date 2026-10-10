-- AlterTable
ALTER TABLE "disciplinary_cases" ADD COLUMN     "status" VARCHAR(50) DEFAULT 'AKTIF';

-- AlterTable
ALTER TABLE "fraud_cases" ADD COLUMN     "status" VARCHAR(50) DEFAULT 'OPEN';
