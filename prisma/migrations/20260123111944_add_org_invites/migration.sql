-- CreateEnum
CREATE TYPE "AllocationMode" AS ENUM ('UNLIMITED', 'SOFT_CAP', 'HARD_CAP', 'RESERVED');

-- CreateTable
CREATE TABLE "org_invites" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'ORG_MEMBER',
    "token" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dept_allocations" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "max_gateways" INTEGER,
    "max_workflows" INTEGER,
    "max_plugins" INTEGER,
    "ai_token_budget" INTEGER,
    "max_ram_mb" INTEGER,
    "max_cpu_cores" DOUBLE PRECISION,
    "max_storage_mb" INTEGER,
    "alloc_mode" "AllocationMode" NOT NULL DEFAULT 'SOFT_CAP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "set_by_id" TEXT NOT NULL,

    CONSTRAINT "dept_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_allocations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "max_gateways" INTEGER,
    "max_workflows" INTEGER,
    "ai_token_budget" INTEGER,
    "max_ram_mb" INTEGER,
    "max_cpu_cores" DOUBLE PRECISION,
    "max_storage_mb" INTEGER,
    "alloc_mode" "AllocationMode" NOT NULL DEFAULT 'SOFT_CAP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "set_by_id" TEXT NOT NULL,

    CONSTRAINT "member_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_invites_token_key" ON "org_invites"("token");

-- CreateIndex
CREATE INDEX "org_invites_email_idx" ON "org_invites"("email");

-- CreateIndex
CREATE INDEX "org_invites_token_idx" ON "org_invites"("token");

-- CreateIndex
CREATE INDEX "org_invites_expires_at_idx" ON "org_invites"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "org_invites_organization_id_email_key" ON "org_invites"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "dept_allocations_department_id_key" ON "dept_allocations"("department_id");

-- CreateIndex
CREATE INDEX "member_allocations_department_id_idx" ON "member_allocations"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_allocations_user_id_department_id_key" ON "member_allocations"("user_id", "department_id");

-- AddForeignKey
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dept_allocations" ADD CONSTRAINT "dept_allocations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dept_allocations" ADD CONSTRAINT "dept_allocations_set_by_id_fkey" FOREIGN KEY ("set_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_allocations" ADD CONSTRAINT "member_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_allocations" ADD CONSTRAINT "member_allocations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_allocations" ADD CONSTRAINT "member_allocations_set_by_id_fkey" FOREIGN KEY ("set_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
