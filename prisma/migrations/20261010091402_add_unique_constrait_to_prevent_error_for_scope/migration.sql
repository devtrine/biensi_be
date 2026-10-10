/*
  Warnings:

  - A unique constraint covering the columns `[period_id,scope]` on the table `attendance_aggregate_monthly` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "attendance_aggregate_monthly_period_id_scope_key" ON "attendance_aggregate_monthly"("period_id", "scope");
