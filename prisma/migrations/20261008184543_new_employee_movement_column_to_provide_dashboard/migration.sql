-- AlterTable
ALTER TABLE "employee_movements" ADD COLUMN     "backfill_status" VARCHAR(100),
ADD COLUMN     "clearance_status" VARCHAR(50),
ADD COLUMN     "retention_action" VARCHAR(255);
