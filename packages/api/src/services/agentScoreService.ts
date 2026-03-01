import { prisma } from "../lib/db.js";
import { NotFoundError } from "../errors/index.js";

// =============================================================================
// Published Scoring Rubric — The Fed 2.0
// These values are canonical and referenced in barney.md and judge.md
// =============================================================================

export const MERIT_VALUES = {
  COMPLETED_SESSION: 2,         // All tasks done in session
  AI_NOTES_BONUS: 1,            // AI notes on every task
  DECISIONS_LOGGED_BONUS: 1,    // Decisions logged in session
  ZERO_VIOLATIONS_7DAY: 3,      // Zero violations rolling 7 days
  PROACTIVE_COMPLIANCE: 5,      // Exceptional proactive compliance
} as const;

export const DEDUCTION_VALUES = {
  minor: 2,
  major: 5,
  critical: 15,
  none: 0,
} as const;

export const REPEAT_VIOLATION_MULTIPLIER = 1.5;

export const SCORE_FLOOR = 0;
export const SCORE_CEILING = 100;
export const INITIAL_SCORE = 50;

// Legacy conviction/false-bust values for Barney's audit accuracy tracking
const CONVICTION_BONUS = 10;
const FALSE_BUST_PENALTY = 10;

// =============================================================================
// Utility: clamp score to valid range [0, 100]
// =============================================================================

export function clampScore(score: number): number {
  return Math.max(SCORE_FLOOR, Math.min(SCORE_CEILING, score));
}

// =============================================================================
// Helpers
// =============================================================================

async function getOrThrow(agentName: string) {
  const record = await prisma.agentScore.findUnique({
    where: { agentName },
  });
  if (!record) {
    throw new NotFoundError(`Agent score for '${agentName}' not found`);
  }
  return record;
}

// =============================================================================
// Service Methods
// =============================================================================

export async function getScore(agentName: string) {
  return getOrThrow(agentName);
}

export async function getLeaderboard() {
  return prisma.agentScore.findMany({
    orderBy: { totalScore: "desc" },
  });
}

/**
 * Award merit points to an agent for positive behavior.
 * Creates a ScoreEvent record and updates the agent's total score.
 */
export async function awardMerit(
  agentName: string,
  reason: string,
  points: number,
  caseId?: string
) {
  const agent = await getOrThrow(agentName);
  const newScore = clampScore(agent.totalScore + points);

  const [updated] = await Promise.all([
    prisma.agentScore.update({
      where: { agentName },
      data: { totalScore: newScore },
    }),
    prisma.scoreEvent.create({
      data: {
        agentName,
        type: "merit",
        points,
        reason,
        caseId: caseId ?? null,
      },
    }),
  ]);

  return updated;
}

/**
 * Apply a deduction to an agent's score.
 * Creates a ScoreEvent record and updates the agent's total score.
 * Applies the score floor (never below 0).
 */
export async function applyDeduction(
  agentName: string,
  deductionLevel: keyof typeof DEDUCTION_VALUES,
  reason: string,
  caseId?: string,
  isRepeat = false
) {
  const agent = await getOrThrow(agentName);
  let points: number = DEDUCTION_VALUES[deductionLevel];

  if (isRepeat && points > 0) {
    points = Math.round(points * REPEAT_VIOLATION_MULTIPLIER);
  }

  const newScore = clampScore(agent.totalScore - points);

  const [updated] = await Promise.all([
    prisma.agentScore.update({
      where: { agentName },
      data: {
        totalScore: newScore,
        bustsReceived: { increment: 1 },
      },
    }),
    prisma.scoreEvent.create({
      data: {
        agentName,
        type: "deduction",
        points: -points,
        reason: isRepeat ? `[REPEAT] ${reason}` : reason,
        caseId: caseId ?? null,
      },
    }),
  ]);

  return updated;
}

/**
 * Check if agent qualifies for the zero-violation 7-day bonus.
 * Returns true if no violations in the last 7 days.
 */
export async function checkZeroViolationBonus(agentName: string): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentDeductions = await prisma.scoreEvent.count({
    where: {
      agentName,
      type: "deduction",
      createdAt: { gte: sevenDaysAgo },
    },
  });

  if (recentDeductions === 0) {
    await awardMerit(
      agentName,
      "Zero violations in rolling 7-day window",
      MERIT_VALUES.ZERO_VIOLATIONS_7DAY
    );
    return true;
  }

  return false;
}

/**
 * Get score events for an agent (merit and deduction history).
 */
export async function getScoreEvents(
  agentName: string,
  options: { limit?: number; cursor?: string } = {}
) {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  const events = await prisma.scoreEvent.findMany({
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor } } : {}),
    where: { agentName },
    orderBy: { createdAt: "desc" },
  });

  const hasMore = events.length > limit;
  if (hasMore) events.pop();

  return {
    data: events,
    meta: {
      cursor: hasMore && events.at(-1) ? events.at(-1)!.id : null,
      hasMore,
    },
  };
}

/**
 * Get 7-day score delta for an agent.
 * Sums all score events in the last 7 days.
 */
export async function getScoreDelta7Day(agentName: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const events = await prisma.scoreEvent.findMany({
    where: {
      agentName,
      createdAt: { gte: sevenDaysAgo },
    },
    select: { points: true },
  });

  return events.reduce((sum, e) => sum + e.points, 0);
}

// =============================================================================
// Legacy methods — retained for backward compatibility with verdict/case flow
// =============================================================================

export async function updateOnVerdict(
  agentName: string,
  deductionLevel: string
) {
  const points = DEDUCTION_VALUES[deductionLevel as keyof typeof DEDUCTION_VALUES] ?? 0;

  await getOrThrow(agentName);

  if (points === 0) {
    return prisma.agentScore.update({
      where: { agentName },
      data: {
        bustsReceived: { increment: 1 },
      },
    });
  }

  const agent = await prisma.agentScore.findUnique({ where: { agentName } });
  const newScore = clampScore((agent?.totalScore ?? INITIAL_SCORE) - points);

  await prisma.scoreEvent.create({
    data: {
      agentName,
      type: "deduction",
      points: -points,
      reason: `Guilty verdict — ${deductionLevel} deduction`,
    },
  }).catch(() => {
    // ScoreEvent table may not exist yet in older migrations
  });

  return prisma.agentScore.update({
    where: { agentName },
    data: {
      totalScore: newScore,
      bustsReceived: { increment: 1 },
    },
  });
}

export async function updateOnConviction(barneyName: string) {
  await getOrThrow(barneyName);

  await prisma.scoreEvent.create({
    data: {
      agentName: barneyName,
      type: "merit",
      points: CONVICTION_BONUS,
      reason: "Successful conviction",
    },
  }).catch(() => {});

  const agent = await prisma.agentScore.findUnique({ where: { agentName: barneyName } });
  const newScore = clampScore((agent?.totalScore ?? INITIAL_SCORE) + CONVICTION_BONUS);

  return prisma.agentScore.update({
    where: { agentName: barneyName },
    data: {
      totalScore: newScore,
      bustsIssued: { increment: 1 },
    },
  });
}

export async function updateOnFalseBust(barneyName: string) {
  await getOrThrow(barneyName);

  await prisma.scoreEvent.create({
    data: {
      agentName: barneyName,
      type: "deduction",
      points: -FALSE_BUST_PENALTY,
      reason: "False bust — not guilty verdict",
    },
  }).catch(() => {});

  const agent = await prisma.agentScore.findUnique({ where: { agentName: barneyName } });
  const newScore = clampScore((agent?.totalScore ?? INITIAL_SCORE) - FALSE_BUST_PENALTY);

  return prisma.agentScore.update({
    where: { agentName: barneyName },
    data: {
      totalScore: newScore,
      bustsIssued: { increment: 1 },
    },
  });
}

export async function updateOnCleanCycle(agentName: string) {
  await getOrThrow(agentName);

  await prisma.scoreEvent.create({
    data: {
      agentName,
      type: "merit",
      points: MERIT_VALUES.ZERO_VIOLATIONS_7DAY,
      reason: "Clean audit cycle",
    },
  }).catch(() => {});

  const agent = await prisma.agentScore.findUnique({ where: { agentName } });
  const newScore = clampScore((agent?.totalScore ?? INITIAL_SCORE) + MERIT_VALUES.ZERO_VIOLATIONS_7DAY);

  return prisma.agentScore.update({
    where: { agentName },
    data: {
      totalScore: newScore,
      cleanCycles: { increment: 1 },
    },
  });
}

export async function setLastAudit(agentName: string) {
  await getOrThrow(agentName);

  return prisma.agentScore.update({
    where: { agentName },
    data: {
      lastAuditAt: new Date(),
    },
  });
}

export async function adjustScore(
  agentName: string,
  delta: number,
  reason: string
) {
  const agent = await getOrThrow(agentName);
  const newScore = clampScore(agent.totalScore + delta);

  await prisma.scoreEvent.create({
    data: {
      agentName,
      type: delta >= 0 ? "merit" : "deduction",
      points: delta,
      reason,
    },
  }).catch(() => {});

  return prisma.agentScore.update({
    where: { agentName },
    data: { totalScore: newScore },
  });
}
