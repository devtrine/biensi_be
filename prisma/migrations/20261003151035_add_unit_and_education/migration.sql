-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "education_level" VARCHAR(50),
ADD COLUMN     "unit_id" INTEGER;

-- CreateTable
CREATE TABLE "units" (
    "id" SERIAL NOT NULL,
    "department_id" INTEGER NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE INDEX "idx_employee_unit" ON "employees"("unit_id");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
