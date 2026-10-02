/*
  Warnings:

  - You are about to drop the `AttendanceMonthly` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Department` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DisciplinaryCase` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Division` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Employee` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EmployeeMonthlySnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EmployeeMovement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FraudCase` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ImportBatch` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IndustrialRelationCase` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `KpiPosition` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LabourCost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Position` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RecruitmentHire` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RecruitmentRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReportingPeriod` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SalesMonthly` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StagingEmployeeImport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Store` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StoreCompliance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AttendanceMonthly" DROP CONSTRAINT "AttendanceMonthly_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "AttendanceMonthly" DROP CONSTRAINT "AttendanceMonthly_periodId_fkey";

-- DropForeignKey
ALTER TABLE "Department" DROP CONSTRAINT "Department_divisionId_fkey";

-- DropForeignKey
ALTER TABLE "DisciplinaryCase" DROP CONSTRAINT "DisciplinaryCase_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "DisciplinaryCase" DROP CONSTRAINT "DisciplinaryCase_divisionId_fkey";

-- DropForeignKey
ALTER TABLE "DisciplinaryCase" DROP CONSTRAINT "DisciplinaryCase_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "DisciplinaryCase" DROP CONSTRAINT "DisciplinaryCase_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_divisionId_fkey";

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_positionId_fkey";

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_storeId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMonthlySnapshot" DROP CONSTRAINT "EmployeeMonthlySnapshot_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMonthlySnapshot" DROP CONSTRAINT "EmployeeMonthlySnapshot_divisionId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMonthlySnapshot" DROP CONSTRAINT "EmployeeMonthlySnapshot_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMonthlySnapshot" DROP CONSTRAINT "EmployeeMonthlySnapshot_periodId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMonthlySnapshot" DROP CONSTRAINT "EmployeeMonthlySnapshot_positionId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMonthlySnapshot" DROP CONSTRAINT "EmployeeMonthlySnapshot_storeId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMovement" DROP CONSTRAINT "EmployeeMovement_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMovement" DROP CONSTRAINT "EmployeeMovement_divisionId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMovement" DROP CONSTRAINT "EmployeeMovement_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "EmployeeMovement" DROP CONSTRAINT "EmployeeMovement_storeId_fkey";

-- DropForeignKey
ALTER TABLE "FraudCase" DROP CONSTRAINT "FraudCase_disciplineId_fkey";

-- DropForeignKey
ALTER TABLE "FraudCase" DROP CONSTRAINT "FraudCase_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "FraudCase" DROP CONSTRAINT "FraudCase_storeId_fkey";

-- DropForeignKey
ALTER TABLE "IndustrialRelationCase" DROP CONSTRAINT "IndustrialRelationCase_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "IndustrialRelationCase" DROP CONSTRAINT "IndustrialRelationCase_storeId_fkey";

-- DropForeignKey
ALTER TABLE "KpiPosition" DROP CONSTRAINT "KpiPosition_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "KpiPosition" DROP CONSTRAINT "KpiPosition_periodId_fkey";

-- DropForeignKey
ALTER TABLE "KpiPosition" DROP CONSTRAINT "KpiPosition_positionId_fkey";

-- DropForeignKey
ALTER TABLE "LabourCost" DROP CONSTRAINT "LabourCost_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "LabourCost" DROP CONSTRAINT "LabourCost_divisionId_fkey";

-- DropForeignKey
ALTER TABLE "LabourCost" DROP CONSTRAINT "LabourCost_periodId_fkey";

-- DropForeignKey
ALTER TABLE "LabourCost" DROP CONSTRAINT "LabourCost_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RecruitmentHire" DROP CONSTRAINT "RecruitmentHire_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "RecruitmentHire" DROP CONSTRAINT "RecruitmentHire_recruitmentRequestId_fkey";

-- DropForeignKey
ALTER TABLE "RecruitmentRequest" DROP CONSTRAINT "RecruitmentRequest_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "RecruitmentRequest" DROP CONSTRAINT "RecruitmentRequest_divisionId_fkey";

-- DropForeignKey
ALTER TABLE "RecruitmentRequest" DROP CONSTRAINT "RecruitmentRequest_positionId_fkey";

-- DropForeignKey
ALTER TABLE "RecruitmentRequest" DROP CONSTRAINT "RecruitmentRequest_storeId_fkey";

-- DropForeignKey
ALTER TABLE "SalesMonthly" DROP CONSTRAINT "SalesMonthly_periodId_fkey";

-- DropForeignKey
ALTER TABLE "SalesMonthly" DROP CONSTRAINT "SalesMonthly_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StagingEmployeeImport" DROP CONSTRAINT "StagingEmployeeImport_importBatchId_fkey";

-- DropForeignKey
ALTER TABLE "StoreCompliance" DROP CONSTRAINT "StoreCompliance_storeId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- DropTable
DROP TABLE "AttendanceMonthly";

-- DropTable
DROP TABLE "Department";

-- DropTable
DROP TABLE "DisciplinaryCase";

-- DropTable
DROP TABLE "Division";

-- DropTable
DROP TABLE "Employee";

-- DropTable
DROP TABLE "EmployeeMonthlySnapshot";

-- DropTable
DROP TABLE "EmployeeMovement";

-- DropTable
DROP TABLE "FraudCase";

-- DropTable
DROP TABLE "ImportBatch";

-- DropTable
DROP TABLE "IndustrialRelationCase";

-- DropTable
DROP TABLE "KpiPosition";

-- DropTable
DROP TABLE "LabourCost";

-- DropTable
DROP TABLE "Position";

-- DropTable
DROP TABLE "RecruitmentHire";

-- DropTable
DROP TABLE "RecruitmentRequest";

-- DropTable
DROP TABLE "ReportingPeriod";

-- DropTable
DROP TABLE "Role";

-- DropTable
DROP TABLE "SalesMonthly";

-- DropTable
DROP TABLE "StagingEmployeeImport";

-- DropTable
DROP TABLE "Store";

-- DropTable
DROP TABLE "StoreCompliance";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "permissions" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "password" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "division_id" INTEGER NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "employee_level" VARCHAR(50),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" SERIAL NOT NULL,
    "store_code" VARCHAR(50) NOT NULL,
    "store_name" VARCHAR(150) NOT NULL,
    "store_type" VARCHAR(50),
    "region" VARCHAR(50),
    "area" VARCHAR(100),
    "is_active" BOOLEAN DEFAULT true,
    "opened_at" DATE,
    "closed_at" DATE,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_compliances" (
    "id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_compliances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employee_no" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "gender" VARCHAR(20),
    "birth_date" DATE,
    "division_id" INTEGER,
    "department_id" INTEGER,
    "position_id" INTEGER,
    "store_id" INTEGER,
    "employment_type" VARCHAR(30),
    "join_date" DATE NOT NULL,
    "end_date" DATE,
    "status" VARCHAR(30) DEFAULT 'ACTIVE',
    "bpjs_ketenagakerjaan" BOOLEAN DEFAULT false,
    "bpjs_kesehatan" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_movements" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "movement_type" VARCHAR(50) NOT NULL,
    "movement_date" DATE NOT NULL,
    "reason_category" VARCHAR(100),
    "reason_detail" TEXT,
    "division_id" INTEGER,
    "department_id" INTEGER,
    "store_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_periods" (
    "id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,

    CONSTRAINT "reporting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_monthly_snapshots" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "division_id" INTEGER,
    "department_id" INTEGER,
    "position_id" INTEGER,
    "store_id" INTEGER,
    "employee_level" VARCHAR(50),
    "employment_type" VARCHAR(30),
    "age_years" DECIMAL(5,2),
    "tenure_years" DECIMAL(5,2),
    "employment_status" VARCHAR(30),
    "bpjs_ketenagakerjaan" BOOLEAN,
    "bpjs_kesehatan" BOOLEAN,
    "labour_cost" DECIMAL(18,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_monthly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_monthly" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "sick_days" DECIMAL(5,2) DEFAULT 0,
    "permission_days" DECIMAL(5,2) DEFAULT 0,
    "annual_leave_days" DECIMAL(5,2) DEFAULT 0,
    "absent_days" DECIMAL(5,2) DEFAULT 0,
    "working_days" DECIMAL(5,2) DEFAULT 0,
    "present_days" DECIMAL(5,2) DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labour_costs" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "division_id" INTEGER,
    "department_id" INTEGER,
    "store_id" INTEGER,
    "budget_amount" DECIMAL(18,2) DEFAULT 0,
    "actual_amount" DECIMAL(18,2) DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labour_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_monthly" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "store_id" INTEGER NOT NULL,
    "sales_qty" DECIMAL(18,2) DEFAULT 0,
    "net_sales" DECIMAL(18,2) DEFAULT 0,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_monthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_requests" (
    "id" UUID NOT NULL,
    "request_code" VARCHAR(50) NOT NULL,
    "requested_at" DATE,
    "division_id" INTEGER,
    "department_id" INTEGER,
    "position_id" INTEGER,
    "store_id" INTEGER,
    "requested_headcount" INTEGER DEFAULT 0,
    "filled_headcount" INTEGER DEFAULT 0,
    "status" VARCHAR(30),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recruitment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_hires" (
    "id" UUID NOT NULL,
    "recruitment_request_id" UUID NOT NULL,
    "employee_id" UUID,
    "applied_at" DATE,
    "hired_at" DATE,
    "recruitment_cost" DECIMAL(18,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recruitment_hires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_positions" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "position_id" INTEGER,
    "kpi_status" VARCHAR(50),
    "completion_date" DATE,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_cases" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reference_no" VARCHAR(100),
    "discipline_type" VARCHAR(50),
    "category" VARCHAR(100),
    "start_date" DATE,
    "end_date" DATE,
    "remark" TEXT,
    "division_id" INTEGER,
    "department_id" INTEGER,
    "store_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disciplinary_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_cases" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "store_id" INTEGER,
    "case_date" DATE,
    "audit_date" DATE,
    "discipline_id" UUID,
    "fraud_category" VARCHAR(100),
    "remark" TEXT,
    "discrepancy_qty" DECIMAL(18,2),
    "bakb_amount" DECIMAL(18,2),
    "sales_target" DECIMAL(18,2),
    "sales_actual" DECIMAL(18,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industrial_relation_cases" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "store_id" INTEGER,
    "case_category" VARCHAR(100),
    "status" VARCHAR(50),
    "start_date" DATE,
    "end_date" DATE,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "industrial_relation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "source_type" VARCHAR(50),
    "status" VARCHAR(30),
    "total_rows" INTEGER DEFAULT 0,
    "successRows" INTEGER DEFAULT 0,
    "failed_rows" INTEGER DEFAULT 0,
    "started_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_employee_import" (
    "id" BIGSERIAL NOT NULL,
    "import_batch_id" UUID,
    "employee_no" TEXT,
    "full_name" TEXT,
    "position_name" TEXT,
    "store_name" TEXT,
    "join_date" TEXT,
    "row_number" INTEGER,
    "validation_status" VARCHAR(30),
    "validation_error" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staging_employee_import_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "divisions_code_key" ON "divisions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stores_store_code_key" ON "stores"("store_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_no_key" ON "employees"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_periods_year_month_key" ON "reporting_periods"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "employee_monthly_snapshots_period_id_employee_id_key" ON "employee_monthly_snapshots"("period_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_monthly_period_id_employee_id_key" ON "attendance_monthly"("period_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_monthly_period_id_store_id_key" ON "sales_monthly"("period_id", "store_id");

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_requests_request_code_key" ON "recruitment_requests"("request_code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_compliances" ADD CONSTRAINT "store_compliances_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_movements" ADD CONSTRAINT "employee_movements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_movements" ADD CONSTRAINT "employee_movements_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_movements" ADD CONSTRAINT "employee_movements_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_movements" ADD CONSTRAINT "employee_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_monthly_snapshots" ADD CONSTRAINT "employee_monthly_snapshots_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_monthly_snapshots" ADD CONSTRAINT "employee_monthly_snapshots_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_monthly_snapshots" ADD CONSTRAINT "employee_monthly_snapshots_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_monthly_snapshots" ADD CONSTRAINT "employee_monthly_snapshots_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_monthly_snapshots" ADD CONSTRAINT "employee_monthly_snapshots_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_monthly_snapshots" ADD CONSTRAINT "employee_monthly_snapshots_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_monthly" ADD CONSTRAINT "attendance_monthly_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_monthly" ADD CONSTRAINT "attendance_monthly_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_costs" ADD CONSTRAINT "labour_costs_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_costs" ADD CONSTRAINT "labour_costs_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_costs" ADD CONSTRAINT "labour_costs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_costs" ADD CONSTRAINT "labour_costs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_monthly" ADD CONSTRAINT "sales_monthly_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_monthly" ADD CONSTRAINT "sales_monthly_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_requests" ADD CONSTRAINT "recruitment_requests_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_requests" ADD CONSTRAINT "recruitment_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_requests" ADD CONSTRAINT "recruitment_requests_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_requests" ADD CONSTRAINT "recruitment_requests_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_hires" ADD CONSTRAINT "recruitment_hires_recruitment_request_id_fkey" FOREIGN KEY ("recruitment_request_id") REFERENCES "recruitment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_hires" ADD CONSTRAINT "recruitment_hires_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_positions" ADD CONSTRAINT "kpi_positions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_positions" ADD CONSTRAINT "kpi_positions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_positions" ADD CONSTRAINT "kpi_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplinary_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industrial_relation_cases" ADD CONSTRAINT "industrial_relation_cases_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industrial_relation_cases" ADD CONSTRAINT "industrial_relation_cases_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_employee_import" ADD CONSTRAINT "staging_employee_import_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
