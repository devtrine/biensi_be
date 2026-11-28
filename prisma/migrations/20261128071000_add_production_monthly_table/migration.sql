-- CreateTable
CREATE TABLE "production_monthly" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "production_qty" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "production_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_monthly_period_id_key" ON "production_monthly"("period_id");

-- AddForeignKey
ALTER TABLE "production_monthly" ADD CONSTRAINT "production_monthly_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
