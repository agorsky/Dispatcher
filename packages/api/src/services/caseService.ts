import { prisma } from "../lib/db.js";
import type { Case } from "../generated/prisma/index.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import * as agentScoreService from "./agentScoreService.js";
import { spawn } from "child_process";
import { generateSortOrderBetween } from "../utils/ordering.js";

const OPENCLAW_BIN = "/opt/homebrew/bin/openclaw";

// =============================================================================
// Types
// =============================================================================

const CASE_VERDICTS = ["guilty", "not_guilty", "dismissed"] as const;
type CaseVerdict = (typeof CASE_VERDICTS)[number];

const DEDUCTION_LEVELS = ["none", "minor", "major", "critical"] as const;
type DeductionLevel = (typeof DEDUCTION_LEVELS)[number];

const SEVERITIES = ["minor", "major", "critical"] as const;

export interface FileCaseInput {
  accusedAgent: string;
  lawId: string;
  evidence: Array<{ type: string; reference: string; description: string }>;
  severity: string;
  filedBy?: string | undefined;
}

export interface IssueVerdictInput {
  verdict: string;
  verdictReason: string;
  deductionLevel: string;
}

export interface ListCasesOptions {
  status?: string;
  accusedAgent?: string;
  severity?: string;
  lawId?: string;
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

// =============================================================================
// State Machine — valid transitions
// =============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["hearing", "dismissed"],
  hearing: ["verdict", "dismissed"],
  verdict: ["corrected", "dismissed"],
  corrected: ["dismissed"],
  dismissed: [],
};

function assertValidTransition(current: string, next: string): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new ValidationError(
      `Invalid case transition: cannot move from '${current}' to '${next}'. ` +
        `Allowed transitions from '${current}': ${allowed?.join(", ") || "none"}`
    );
  }
}

// =============================================================================
// Helper: next case number
// =============================================================================

async function getNextCaseNumber(): Promise<number> {
  const last = await prisma.case.findFirst({
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });
  return (last?.caseNumber ?? 0) + 1;
}

// =============================================================================
// Helper: parse evidence (stored as JSON string in DB, must be array on output)
// =============================================================================

function parseEvidence(raw: unknown): Array<{ type: string; reference: string; description: string }> {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeCase<T extends { evidence: unknown }>(c: T): T {
  return { ...c, evidence: parseEvidence(c.evidence) };
}

// =============================================================================
// Helper: fetch case or throw
// =============================================================================

async function getCaseOrThrow(caseId: string): Promise<Case> {
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c) {
    throw new NotFoundError(`Case '${caseId}' not found`);
  }
  return normalizeCase(c);
}

// =============================================================================
// Service Methods
// =============================================================================

export async function listCases(
  options: ListCasesOptions = {}
): Promise<PaginatedResult<Case>> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  const whereClause: Record<string, unknown> = {};
  if (options.status !== undefined) whereClause.status = options.status;
  if (options.accusedAgent !== undefined) whereClause.accusedAgent = options.accusedAgent;
  if (options.severity !== undefined) whereClause.severity = options.severity;
  if (options.lawId !== undefined) whereClause.lawId = options.lawId;

  const cases = await prisma.case.findMany({
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor } } : {}),
    where: whereClause,
    orderBy: { filedAt: "desc" },
    include: { law: true },
  });

  const hasMore = cases.length > limit;
  if (hasMore) {
    cases.pop();
  }

  const lastCase = cases.at(-1);
  const nextCursor = hasMore && lastCase ? lastCase.id : null;

  return {
    data: cases.map(normalizeCase),
    meta: { cursor: nextCursor, hasMore },
  };
}

export async function getCase(caseId: string) {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: { law: true, remediationTask: true },
  });
  if (!c) {
    throw new NotFoundError(`Case '${caseId}' not found`);
  }
  return normalizeCase(c);
}

export async function fileCase(input: FileCaseInput): Promise<Case> {
  // Validate severity
  if (!SEVERITIES.includes(input.severity as (typeof SEVERITIES)[number])) {
    throw new ValidationError(
      `Invalid severity '${input.severity}'. Must be one of: ${SEVERITIES.join(", ")}`
    );
  }

  // Validate law exists
  const law = await prisma.law.findUnique({ where: { id: input.lawId } });
  if (!law) {
    throw new NotFoundError(`Law '${input.lawId}' not found`);
  }

  const caseNumber = await getNextCaseNumber();

  return prisma.case.create({
    data: {
      caseNumber,
      accusedAgent: input.accusedAgent,
      lawId: input.lawId,
      evidence: JSON.stringify(input.evidence),
      severity: input.severity,
      status: "open",
      filedBy: input.filedBy ?? "barney",
    },
  });
}

export async function startHearing(caseId: string): Promise<Case> {
  const c = await getCaseOrThrow(caseId);
  assertValidTransition(c.status, "hearing");

  return prisma.case.update({
    where: { id: caseId },
    data: { status: "hearing" },
  });
}

export async function issueVerdict(
  caseId: string,
  input: IssueVerdictInput
): Promise<Case> {
  const c = await getCaseOrThrow(caseId);
  assertValidTransition(c.status, "verdict");

  // Validate verdict value
  if (!CASE_VERDICTS.includes(input.verdict as CaseVerdict)) {
    throw new ValidationError(
      `Invalid verdict '${input.verdict}'. Must be one of: ${CASE_VERDICTS.join(", ")}`
    );
  }

  // Validate deduction level
  if (!DEDUCTION_LEVELS.includes(input.deductionLevel as DeductionLevel)) {
    throw new ValidationError(
      `Invalid deductionLevel '${input.deductionLevel}'. Must be one of: ${DEDUCTION_LEVELS.join(", ")}`
    );
  }

  if (input.verdict === "guilty") {
    // Update case verdict first
    const updatedCase = await prisma.case.update({
      where: { id: caseId },
      data: {
        status: "verdict",
        verdict: input.verdict,
        verdictReason: input.verdictReason,
        deductionLevel: input.deductionLevel,
      },
    });

    // Score updates are done outside the case update to avoid SQLite
    // interactive-transaction lock conflicts when agent scores don't exist yet.
    await agentScoreService.updateOnVerdict(
      c.accusedAgent,
      input.deductionLevel
    ).catch(() => {
      // Score record may not exist yet — don't block verdict
    });

    await agentScoreService.updateOnConviction(c.filedBy).catch(() => {
      // Score record may not exist yet — don't block verdict
    });

    // ENG-117-4: Auto-create remediation task for guilty verdicts (non-blocking)
    createRemediationTask(caseId, input.verdictReason).catch(() => {});

    return updatedCase;
  }

  if (input.verdict === "not_guilty") {
    const updatedCase = await prisma.case.update({
      where: { id: caseId },
      data: {
        status: "verdict",
        verdict: input.verdict,
        verdictReason: input.verdictReason,
        deductionLevel: "none",
        resolvedAt: new Date(),
      },
    });

    // Penalize Barney for filing a false case
    await agentScoreService.updateOnFalseBust(c.filedBy).catch(() => {
      // Score record may not exist yet — don't block verdict
    });

    return updatedCase;
  }

  // verdict === "dismissed"
  return prisma.case.update({
    where: { id: caseId },
    data: {
      status: "verdict",
      verdict: input.verdict,
      verdictReason: input.verdictReason,
      deductionLevel: input.deductionLevel,
      resolvedAt: new Date(),
    },
  });
}

export async function markCorrected(caseId: string): Promise<Case> {
  const c = await getCaseOrThrow(caseId);
  assertValidTransition(c.status, "corrected");

  const updated = await prisma.case.update({
    where: { id: caseId },
    data: {
      status: "corrected",
      resolvedAt: new Date(),
    },
  });

  // ENG-118-3: After correction, check if session compliance is clear
  // Import lazily to avoid circular dependency risk
  import("./epicService.js").then(async ({ checkSessionComplianceClear, fireComplianceClearNotification }) => {
    // Find the most recent completed session to check
    const recentSession = await prisma.aiSession.findFirst({
      where: { status: "completed" },
      orderBy: { endedAt: "desc" },
      select: { epicId: true, id: true },
    }).catch(() => null);

    if (!recentSession) return;

    const isClear = await checkSessionComplianceClear(recentSession.epicId);
    if (isClear) {
      await fireComplianceClearNotification(recentSession.epicId);
    }
  }).catch(() => {});

  return updated;
}

// =============================================================================
// Agent-to-law mapping
// Maps agent names to the appliesTo values that cover their activity surfaces
// =============================================================================

const AGENT_LAW_MAP: Record<string, string[]> = {
  tommy: ["tommy"],
  silvio: ["silvio"],
  sal: ["sal"],
  paulie: ["paulie"],
  henry: ["henry"],
  "the-claw-father": ["the-claw-father"],
  bobby: ["feature-worker", "bobby"],
  barney: ["barney"],
  planner: ["planner"],
  orchestrator: ["orchestrator"],
  "plan-reviewer": ["plan-reviewer"],
  "request-formulator": ["request-formulator"],
  "feature-worker": ["feature-worker"],
};

export async function getApplicableLaws(agentName: string) {
  const appliesValues = AGENT_LAW_MAP[agentName.toLowerCase()] ?? [agentName.toLowerCase()];

  return prisma.law.findMany({
    where: {
      isActive: true,
      appliesTo: { in: appliesValues },
    },
    orderBy: { lawCode: "asc" },
  });
}

export async function dismissCase(
  caseId: string,
  reason: string
): Promise<Case> {
  const c = await getCaseOrThrow(caseId);
  assertValidTransition(c.status, "dismissed");

  return prisma.case.update({
    where: { id: caseId },
    data: {
      status: "dismissed",
      verdict: "dismissed",
      verdictReason: reason,
      deductionLevel: "none",
      resolvedAt: new Date(),
    },
  });
}

// =============================================================================
// PATCH case — update arbitrary fields (ENG-117-3)
// =============================================================================

export async function patchCase(
  caseId: string,
  data: { remediationTaskId?: string }
): Promise<Case> {
  const c = await getCaseOrThrow(caseId);
  return prisma.case.update({
    where: { id: c.id },
    data,
  });
}

// =============================================================================
// Immediate Judge Trigger (ENG-115-1)
// =============================================================================

/**
 * Trigger The Judge to adjudicate a newly filed case. Non-blocking.
 * Also moves the case to 'hearing' status to prevent double-dispatch.
 */
export function triggerJudgeHearing(caseId: string): void {
  // Move to hearing status (fire-and-forget)
  prisma.case.update({
    where: { id: caseId },
    data: { status: "hearing" },
  }).catch(() => {});

  const prompt = [
    `You are The Judge. Case ${caseId} has been filed.`,
    "Read ~/Projects/SpecTree/.github/agents/judge.md and follow it exactly.",
    `Adjudicate case ${caseId} immediately via API.`,
    "Issue your verdict: read the case, verify evidence, consider context, then PUT /cases/:id/verdict.",
  ].join(" ");

  const child = spawn(OPENCLAW_BIN, ["system", "event", "--text", prompt, "--mode", "now"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

// =============================================================================
// Remediation Task Auto-Creation (ENG-117-1)
// =============================================================================

/**
 * Auto-create a remediation task in Dispatcher when a guilty verdict is issued.
 * Non-blocking — finds the most relevant epic from recent sessions.
 */
export async function createRemediationTask(
  caseId: string,
  violationSummary: string
): Promise<void> {
  try {
    const c = await prisma.case.findUnique({
      where: { id: caseId },
      include: { law: true },
    });
    if (!c || !c.law) return;

    // Find the most recently active/completed session for context (Barney audits epics)
    const recentSession = await prisma.aiSession.findFirst({
      where: { status: { in: ["active", "completed"] } },
      orderBy: { startedAt: "desc" },
      select: { epicId: true },
    });

    if (!recentSession) return;

    const epicId = recentSession.epicId;

    // Find the epic's first feature (for task attachment)
    const feature = await prisma.feature.findFirst({
      where: { epicId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, identifier: true },
    });

    if (!feature) return;

    // Generate unique task identifier
    const existingTasks = await prisma.task.findMany({
      where: { featureId: feature.id },
      select: { identifier: true },
    });

    const prefix = `${feature.identifier}-`;
    let maxNum = 0;
    for (const t of existingTasks) {
      if (t.identifier.startsWith(prefix)) {
        const n = parseInt(t.identifier.slice(prefix.length), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    const identifier = `${prefix}${maxNum + 1}`;

    // Generate sort order
    const lastTask = await prisma.task.findFirst({
      where: { featureId: feature.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = generateSortOrderBetween(lastTask?.sortOrder ?? null, null);

    // Get epic's backlog status
    const epic = await prisma.epic.findUnique({
      where: { id: epicId },
      select: { teamId: true },
    });
    const backlogStatus = epic?.teamId
      ? await prisma.status.findFirst({ where: { teamId: epic.teamId, category: "backlog" } })
      : null;

    const title = `[REMEDIATION] Fix ${c.law.lawCode} violation: ${c.law.title}`;
    const description = [
      `Violation: ${violationSummary}`,
      ``,
      `Law: ${c.law.lawCode} — ${c.law.title}`,
      `Case #${c.caseNumber} (${caseId})`,
      ``,
      `This task was auto-created by The Judge after a guilty verdict.`,
      `Mark this task Done once the violation has been corrected.`,
    ].join("\n");

    const task = await prisma.task.create({
      data: {
        title,
        featureId: feature.id,
        identifier,
        sortOrder,
        description,
        createdBy: "system",
        ...(backlogStatus ? { statusId: backlogStatus.id } : {}),
      },
    });

    // Link the remediation task to the case
    await prisma.case.update({
      where: { id: caseId },
      data: { remediationTaskId: task.id },
    });
  } catch {
    // Non-blocking — never propagate errors
  }
}
