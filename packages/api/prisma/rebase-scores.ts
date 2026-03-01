/**
 * Score Rebase Script — The Fed 2.0
 *
 * Sets all agents with totalScore = 0 to the new starting baseline of 50.
 * Agents with scores > 0 are NOT touched — they earned those points.
 *
 * This is a one-time migration script to align existing zero-score agents
 * with The Fed 2.0 policy (new agents start at 50, not 0 or 100).
 *
 * Usage: npx tsx prisma/rebase-scores.ts
 */

import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const NEW_BASELINE = 50;

async function rebaseScores(): Promise<void> {
  console.log("Running score rebase — The Fed 2.0...");

  const zeroScoreAgents = await prisma.agentScore.findMany({
    where: { totalScore: 0 },
  });

  if (zeroScoreAgents.length === 0) {
    console.log("No zero-score agents found. Nothing to rebase.");
    return;
  }

  console.log(`Found ${zeroScoreAgents.length} zero-score agent(s) to rebase:`);

  for (const agent of zeroScoreAgents) {
    await prisma.agentScore.update({
      where: { agentName: agent.agentName },
      data: { totalScore: NEW_BASELINE },
    });
    console.log(`  ${agent.agentName}: 0 → ${NEW_BASELINE}`);
  }

  console.log(`\nRebase complete. ${zeroScoreAgents.length} agent(s) updated to ${NEW_BASELINE}.`);
  console.log("Agents with scores > 0 were not modified.");
}

rebaseScores()
  .catch((error) => {
    console.error("Failed to rebase scores:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
