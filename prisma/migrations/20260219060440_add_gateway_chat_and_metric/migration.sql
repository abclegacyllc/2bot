-- CreateTable
CREATE TABLE "gateway_chats" (
    "id" TEXT NOT NULL,
    "gateway_id" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "chat_type" TEXT NOT NULL,
    "chat_title" TEXT,
    "chat_username" TEXT,
    "member_count" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "bot_status" TEXT NOT NULL DEFAULT 'member',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_metrics" (
    "id" TEXT NOT NULL,
    "gateway_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "total_duration_ms" BIGINT NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gateway_chats_gateway_id_is_active_idx" ON "gateway_chats"("gateway_id", "is_active");

-- CreateIndex
CREATE INDEX "gateway_chats_chat_type_idx" ON "gateway_chats"("chat_type");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_chats_gateway_id_chat_id_key" ON "gateway_chats"("gateway_id", "chat_id");

-- CreateIndex
CREATE INDEX "gateway_metrics_gateway_id_period_idx" ON "gateway_metrics"("gateway_id", "period");

-- CreateIndex
CREATE INDEX "gateway_metrics_action_idx" ON "gateway_metrics"("action");

-- CreateIndex
CREATE INDEX "gateway_metrics_created_at_idx" ON "gateway_metrics"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_metrics_gateway_id_action_period_key" ON "gateway_metrics"("gateway_id", "action", "period");

-- AddForeignKey
ALTER TABLE "gateway_chats" ADD CONSTRAINT "gateway_chats_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_metrics" ADD CONSTRAINT "gateway_metrics_gateway_id_fkey" FOREIGN KEY ("gateway_id") REFERENCES "gateways"("id") ON DELETE CASCADE ON UPDATE CASCADE;
