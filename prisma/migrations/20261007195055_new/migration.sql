/*
  Warnings:

  - You are about to drop the column `labour_cost` on the `employee_monthly_snapshots` table. All the data in the column will be lost.
  - You are about to drop the `attendance_monthly` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `labour_costs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "attendance_monthly" DROP CONSTRAINT "attendance_monthly_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_monthly" DROP CONSTRAINT "attendance_monthly_period_id_fkey";

-- DropForeignKey
ALTER TABLE "labour_costs" DROP CONSTRAINT "labour_costs_department_id_fkey";

-- DropForeignKey
ALTER TABLE "labour_costs" DROP CONSTRAINT "labour_costs_division_id_fkey";

-- DropForeignKey
ALTER TABLE "labour_costs" DROP CONSTRAINT "labour_costs_period_id_fkey";

-- DropForeignKey
ALTER TABLE "labour_costs" DROP CONSTRAINT "labour_costs_store_id_fkey";

-- AlterTable
ALTER TABLE "employee_monthly_snapshots" DROP COLUMN "labour_cost",
ADD COLUMN     "actual_labour_cost" DECIMAL(18,2),
ADD COLUMN     "budget_labour_cost" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "base_salary" DECIMAL(18,2);

-- DropTable
DROP TABLE "attendance_monthly";

-- DropTable
DROP TABLE "labour_costs";

-- CreateTable
CREATE TABLE "attendance_aggregate_monthly" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "total_employees" INTEGER NOT NULL,
    "sick_count" INTEGER NOT NULL DEFAULT 0,
    "permission_count" INTEGER NOT NULL DEFAULT 0,
    "annual_leave_count" INTEGER NOT NULL DEFAULT 0,
    "absent_count" INTEGER NOT NULL DEFAULT 0,
    "working_days" INTEGER,
    "attendance_rate" DECIMAL(5,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_aggregate_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_aggregate_monthly_period_id_key" ON "attendance_aggregate_monthly"("period_id");

-- AddForeignKey
ALTER TABLE "attendance_aggregate_monthly" ADD CONSTRAINT "attendance_aggregate_monthly_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
