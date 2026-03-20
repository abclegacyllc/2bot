-- DropIndex
DROP INDEX "user_plugins_user_id_plugin_id_organization_id_key";

-- CreateIndex
CREATE INDEX "user_plugins_gateway_id_idx" ON "user_plugins"("gateway_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_plugins_user_id_plugin_id_organization_id_gateway_id_key" ON "user_plugins"("user_id", "plugin_id", "organization_id", "gateway_id");
