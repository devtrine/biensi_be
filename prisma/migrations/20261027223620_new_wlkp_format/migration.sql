-- DropForeignKey
ALTER TABLE "store_compliances" DROP CONSTRAINT "store_compliances_store_id_fkey";

-- AlterTable
ALTER TABLE "store_compliances" ADD COLUMN     "entity_name" VARCHAR(100),
ADD COLUMN     "location" VARCHAR(100),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "pic" VARCHAR(100),
ADD COLUMN     "remaining_days" INTEGER DEFAULT 0,
ALTER COLUMN "store_id" DROP NOT NULL,
ALTER COLUMN "document_type" SET DATA TYPE VARCHAR(100);

-- AddForeignKey
ALTER TABLE "store_compliances" ADD CONSTRAINT "store_compliances_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
