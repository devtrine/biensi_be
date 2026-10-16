-- CreateTable
CREATE TABLE "sp_aggregate_monthly" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'STORE',
    "total_employees" INTEGER NOT NULL DEFAULT 0,
    "tata_tertib_count" INTEGER NOT NULL DEFAULT 0,
    "non_tata_tertib_count" INTEGER NOT NULL DEFAULT 0,
    "total_sp_issued" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sp_aggregate_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sp_aggregate_monthly_period_id_scope_key" ON "sp_aggregate_monthly"("period_id", "scope");

-- AddForeignKey
ALTER TABLE "sp_aggregate_monthly" ADD CONSTRAINT "sp_aggregate_monthly_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
