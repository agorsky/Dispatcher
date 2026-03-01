-- AlterTable
ALTER TABLE "ai_sessions" ADD COLUMN "audited_at" DATETIME;

-- CreateTable
CREATE TABLE "patterns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "epic_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "examples" TEXT,
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_agent_scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agent_name" TEXT NOT NULL,
    "agent_title" TEXT NOT NULL,
    "total_score" INTEGER NOT NULL DEFAULT 50,
    "busts_received" INTEGER NOT NULL DEFAULT 0,
    "busts_issued" INTEGER NOT NULL DEFAULT 0,
    "clean_cycles" INTEGER NOT NULL DEFAULT 0,
    "last_audit_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_agent_scores" ("agent_name", "agent_title", "busts_issued", "busts_received", "clean_cycles", "created_at", "id", "last_audit_at", "total_score", "updated_at") SELECT "agent_name", "agent_title", "busts_issued", "busts_received", "clean_cycles", "created_at", "id", "last_audit_at", "total_score", "updated_at" FROM "agent_scores";
DROP TABLE "agent_scores";
ALTER TABLE "new_agent_scores" RENAME TO "agent_scores";
CREATE UNIQUE INDEX "agent_scores_agent_name_key" ON "agent_scores"("agent_name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "patterns_epic_id_idx" ON "patterns"("epic_id");

-- CreateIndex
CREATE INDEX "patterns_category_idx" ON "patterns"("category");

-- CreateIndex
CREATE INDEX "patterns_name_idx" ON "patterns"("name");
