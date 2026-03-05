-- CreateTable
CREATE TABLE "admin_blocked_domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_blocked_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_blocked_domains_domain_key" ON "admin_blocked_domains"("domain");

-- CreateIndex
CREATE INDEX "admin_blocked_domains_domain_idx" ON "admin_blocked_domains"("domain");

-- AddForeignKey
ALTER TABLE "admin_blocked_domains" ADD CONSTRAINT "admin_blocked_domains_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
