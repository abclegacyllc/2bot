-- AddForeignKey
ALTER TABLE "user_plugins" ADD CONSTRAINT "user_plugins_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;
