-- CreateTable
CREATE TABLE "cursor_chat_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_thread_id" TEXT NOT NULL,
    "markdown" TEXT,
    "items" JSONB,
    "author_agent" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cursor_chat_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cursor_chat_plans_user_id_chat_thread_id_key" ON "cursor_chat_plans"("user_id", "chat_thread_id");

-- CreateIndex
CREATE INDEX "cursor_chat_plans_user_id_idx" ON "cursor_chat_plans"("user_id");

-- AddForeignKey
ALTER TABLE "cursor_chat_plans" ADD CONSTRAINT "cursor_chat_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
