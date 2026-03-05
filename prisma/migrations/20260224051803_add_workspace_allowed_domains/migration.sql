-- CreateEnum
CREATE TYPE "DomainAllowStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "workspace_allowed_domains" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "DomainAllowStatus" NOT NULL DEFAULT 'APPROVED',
    "reason" TEXT,
    "consent_accepted" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_allowed_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_allowed_domains_user_id_idx" ON "workspace_allowed_domains"("user_id");

-- CreateIndex
CREATE INDEX "workspace_allowed_domains_status_idx" ON "workspace_allowed_domains"("status");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_allowed_domains_user_id_domain_key" ON "workspace_allowed_domains"("user_id", "domain");

-- AddForeignKey
ALTER TABLE "workspace_allowed_domains" ADD CONSTRAINT "workspace_allowed_domains_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
