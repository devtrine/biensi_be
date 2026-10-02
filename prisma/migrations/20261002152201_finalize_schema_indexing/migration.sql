-- CreateIndex
CREATE INDEX "idx_attendance_period" ON "attendance_monthly"("period_id");

-- CreateIndex
CREATE INDEX "idx_discipline_employee" ON "disciplinary_cases"("employee_id");

-- CreateIndex
CREATE INDEX "idx_snapshot_period" ON "employee_monthly_snapshots"("period_id");

-- CreateIndex
CREATE INDEX "idx_employee_store" ON "employees"("store_id");

-- CreateIndex
CREATE INDEX "idx_employee_department" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "idx_ir_case_status" ON "industrial_relation_cases"("status");

-- CreateIndex
CREATE INDEX "idx_labour_cost_period" ON "labour_costs"("period_id");
