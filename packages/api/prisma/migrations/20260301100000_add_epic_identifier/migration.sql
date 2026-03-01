-- AlterTable: Add identifier column to epics
ALTER TABLE "epics" ADD COLUMN "identifier" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "epics_identifier_key" ON "epics"("identifier");
