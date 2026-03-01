-- Add lifecycle status and completedAt to Epic model
-- status: 'active' | 'completed' (archived remains isArchived boolean)
-- completedAt: set automatically when epic is completed, cleared on reopen

ALTER TABLE "epics" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "epics" ADD COLUMN "completed_at" DATETIME;
