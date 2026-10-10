-- AlterTable
ALTER TABLE "store_compliances" ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" VARCHAR(50),
ALTER COLUMN "valid_from" DROP NOT NULL,
ALTER COLUMN "valid_until" DROP NOT NULL;
