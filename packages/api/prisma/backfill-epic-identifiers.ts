/**
 * Backfill script: assign identifier to all existing epics that don't have one.
 * Run with: npx tsx prisma/backfill-epic-identifiers.ts
 *
 * - Team epics:    ENG-E1, ENG-E2, ...  (using team.key)
 * - Personal epics: PERS-E1, PERS-E2, ...
 * - Ordered by createdAt asc so oldest epic gets the lowest number per scope.
 */

import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting epic identifier backfill...");

  // Fetch all epics without an identifier, ordered oldest-first
  const epics = await prisma.epic.findMany({
    where: { identifier: null },
    orderBy: { createdAt: "asc" },
    include: {
      team: { select: { id: true, key: true } },
    },
  });

  if (epics.length === 0) {
    console.log("No epics need backfilling.");
    return;
  }

  console.log(`Found ${epics.length} epics without identifiers.`);

  // Track the next number per scope so we don't query the DB inside the loop for each
  // Seed with existing max numbers so we don't collide with already-assigned identifiers
  const scopeCounters = new Map<string, number>();

  // Pre-seed counters from already-assigned identifiers
  const existingWithIds = await prisma.epic.findMany({
    where: { identifier: { not: null } },
    select: { identifier: true, teamId: true, personalScopeId: true },
  });

  for (const epic of existingWithIds) {
    const scopeKey = epic.teamId ?? epic.personalScopeId ?? "unknown";
    const identifier = epic.identifier!;
    // Extract trailing number from identifier (e.g., "ENG-E3" → 3)
    const match = identifier.match(/(\d+)(?:-\d+)?$/);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      const current = scopeCounters.get(scopeKey) ?? 0;
      if (num > current) {
        scopeCounters.set(scopeKey, num);
      }
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const epic of epics) {
    const scopeKey = epic.teamId ?? epic.personalScopeId ?? "unknown";
    const prefix = epic.team ? `${epic.team.key}-E` : "PERS-E";

    const nextNum = (scopeCounters.get(scopeKey) ?? 0) + 1;
    scopeCounters.set(scopeKey, nextNum);

    const identifier = `${prefix}${nextNum}`;

    // Check for collision (shouldn't happen with pre-seeded counters, but be safe)
    const collision = await prisma.epic.findUnique({
      where: { identifier },
      select: { id: true },
    });

    if (collision) {
      console.warn(`  Collision on ${identifier} for epic ${epic.id} — using timestamp fallback`);
      const fallbackIdentifier = `${prefix}${nextNum}-${Date.now()}`;
      await prisma.epic.update({
        where: { id: epic.id },
        data: { identifier: fallbackIdentifier },
      });
      console.log(`  Epic ${epic.id} → ${fallbackIdentifier}`);
      skipped++;
    } else {
      await prisma.epic.update({
        where: { id: epic.id },
        data: { identifier },
      });
      console.log(`  Epic ${epic.id} (${epic.name}) → ${identifier}`);
      updated++;
    }
  }

  console.log(`\nBackfill complete: ${updated} assigned, ${skipped} used timestamp fallback.`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
