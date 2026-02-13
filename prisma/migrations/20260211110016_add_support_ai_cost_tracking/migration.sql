-- CreateTable
CREATE TABLE "support_ai_costs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "api_cost_usd" DOUBLE PRECISION NOT NULL,
    "credits_charged" DOUBLE PRECISION NOT NULL,
    "billing_period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ai_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_ai_costs_billing_period_idx" ON "support_ai_costs"("billing_period");

-- CreateIndex
CREATE INDEX "support_ai_costs_created_at_idx" ON "support_ai_costs"("created_at");

-- CreateIndex
CREATE INDEX "support_ai_costs_user_id_idx" ON "support_ai_costs"("user_id");
