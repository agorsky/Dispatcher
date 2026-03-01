/**
 * Seed script for Agent Scores — The Fed 2.0
 *
 * Initializes the 9 named crew agents with totalScore=50 (the neutral midpoint).
 * New agents start at 50. They must earn their way up to 100 or lose points down to 0.
 * Idempotent — does NOT overwrite scores for existing agents that have earned scores > 0.
 *
 * Usage: npx tsx prisma/seed-agents.ts
 */

import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

// The Fed 2.0: new agents start at 50 (neutral midpoint)
const INITIAL_SCORE = 50;

interface AgentSeed {
  agentName: string;
  agentTitle: string;
}

const agents: AgentSeed[] = [
  { agentName: "barney", agentTitle: "The Fed" },
  { agentName: "bobby", agentTitle: "The Builder" },
  { agentName: "tommy", agentTitle: "The Consigliere" },
  { agentName: "silvio", agentTitle: "The Scribe" },
  { agentName: "sal", agentTitle: "The Keeper" },
  { agentName: "paulie", agentTitle: "The Tailor" },
  { agentName: "henry", agentTitle: "The Ghostwriter" },
  { agentName: "the-claw-father", agentTitle: "The Boss" },
  { agentName: "the-judge", agentTitle: "The Arbiter" },
];

async function seedAgents(): Promise<void> {
  console.log("Seeding agent scores (The Fed 2.0 — initial score: 50)...");

  for (const agent of agents) {
    const existing = await prisma.agentScore.findUnique({
      where: { agentName: agent.agentName },
    });

    if (existing) {
      // Only update title — never overwrite earned scores
      await prisma.agentScore.update({
        where: { agentName: agent.agentName },
        data: { agentTitle: agent.agentTitle },
      });
      console.log(
        `  ${agent.agentName} (${agent.agentTitle}) — score preserved: ${existing.totalScore}`
      );
    } else {
      await prisma.agentScore.create({
        data: {
          agentName: agent.agentName,
          agentTitle: agent.agentTitle,
          totalScore: INITIAL_SCORE,
        },
      });
      console.log(
        `  ${agent.agentName} (${agent.agentTitle}) — initialized at ${INITIAL_SCORE}`
      );
    }
  }

  console.log(`\nSeeded ${agents.length} agents successfully.`);
}

seedAgents()
  .catch((error) => {
    console.error("Failed to seed agents:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
