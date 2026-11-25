-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "module" VARCHAR(50),
ADD COLUMN     "period_id" UUID,
ADD COLUMN     "period_month" INTEGER,
ADD COLUMN     "period_year" INTEGER;

-- CreateIndex
CREATE INDEX "import_batches_module_period_year_period_month_idx" ON "import_batches"("module", "period_year", "period_month");

-- CreateIndex
CREATE INDEX "import_batches_period_id_idx" ON "import_batches"("period_id");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
