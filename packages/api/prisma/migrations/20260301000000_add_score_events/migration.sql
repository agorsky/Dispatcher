-- CreateTable
CREATE TABLE IF NOT EXISTS "score_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agent_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "case_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "score_events_agent_name_idx" ON "score_events"("agent_name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "score_events_agent_name_created_at_idx" ON "score_events"("agent_name", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "score_events_type_idx" ON "score_events"("type");
