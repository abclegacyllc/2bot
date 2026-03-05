-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "user_plugin_id" TEXT;

-- CreateIndex
CREATE INDEX "ai_usage_user_plugin_id_billing_period_idx" ON "ai_usage"("user_plugin_id", "billing_period");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_plugin_id_fkey" FOREIGN KEY ("user_plugin_id") REFERENCES "user_plugins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
