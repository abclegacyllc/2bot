-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "workspace_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "iteration_count" INTEGER NOT NULL DEFAULT 0,
    "tool_call_count" INTEGER NOT NULL DEFAULT 0,
    "total_credits_used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "final_response" TEXT,
    "error" TEXT,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_calls" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" TEXT NOT NULL,
    "is_error" BOOLEAN NOT NULL DEFAULT false,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_sessions_user_id_started_at_idx" ON "agent_sessions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "agent_sessions_organization_id_started_at_idx" ON "agent_sessions"("organization_id", "started_at");

-- CreateIndex
CREATE INDEX "agent_sessions_workspace_id_idx" ON "agent_sessions"("workspace_id");

-- CreateIndex
CREATE INDEX "agent_sessions_status_idx" ON "agent_sessions"("status");

-- CreateIndex
CREATE INDEX "agent_sessions_started_at_idx" ON "agent_sessions"("started_at");

-- CreateIndex
CREATE INDEX "agent_tool_calls_session_id_sequence_idx" ON "agent_tool_calls"("session_id", "sequence");

-- CreateIndex
CREATE INDEX "agent_tool_calls_tool_name_idx" ON "agent_tool_calls"("tool_name");

-- CreateIndex
CREATE INDEX "agent_tool_calls_created_at_idx" ON "agent_tool_calls"("created_at");

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
