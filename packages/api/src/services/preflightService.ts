import { prisma } from "../lib/db.js";
import { validateEpicDescription } from "./descriptionValidator.js";
import { resolveDependencies } from "./dependencyService.js";
import type { PreflightCheckResult, PreflightResult } from "../schemas/preflight.js";

// ---------------------------------------------------------------------------
// Environment-configurable thresholds
// ---------------------------------------------------------------------------

const MIN_TASKS_PER_FEATURE = parseInt(process.env.PREFLIGHT_MIN_TASKS_PER_FEATURE ?? "3", 10) || 3;
const MIN_ACCEPTANCE_CRITERIA = parseInt(process.env.PREFLIGHT_MIN_ACCEPTANCE_CRITERIA ?? "3", 10) || 3;
const MIN_DESCRIPTION_SCORE = parseInt(process.env.PREFLIGHT_MIN_DESCRIPTION_SCORE ?? "95", 10) || 95;

// ---------------------------------------------------------------------------
// Structured description shape (shared across features and tasks)
// ---------------------------------------------------------------------------

interface ParsedStructuredDesc {
  aiInstructions?: string;
  acceptanceCriteria?: string[];
  [key: string]: unknown;
}

function parseStructuredDesc(raw: string | null | undefined): ParsedStructuredDesc {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ParsedStructuredDesc;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Individual check functions
// ---------------------------------------------------------------------------

interface FeatureWithTasks {
  identifier: string;
  structuredDesc: string | null;
  tasks: { identifier: string; structuredDesc: string | null }[];
}

export function checkScaffoldHints(features: FeatureWithTasks[]): PreflightCheckResult {
  const failingItems: { identifier: string; issue: string }[] = [];

  for (const feature of features) {
    for (const task of feature.tasks) {
      const desc = parseStructuredDesc(task.structuredDesc);
      if (!desc.aiInstructions || desc.aiInstructions.trim() === "") {
        failingItems.push({
          identifier: task.identifier,
          issue: "Task is missing aiInstructions in structuredDesc",
        });
      }
    }
  }

  return {
    checkName: "Scaffold Hints",
    passed: failingItems.length === 0,
    details:
      failingItems.length === 0
        ? "All tasks have AI instructions defined"
        : `${failingItems.length} task(s) are missing aiInstructions`,
    items: failingItems.length > 0 ? failingItems : undefined,
  };
}

export function checkAcceptanceCriteria(features: FeatureWithTasks[]): PreflightCheckResult {
  const failingItems: { identifier: string; issue: string }[] = [];

  for (const feature of features) {
    const desc = parseStructuredDesc(feature.structuredDesc);
    const criteria = desc.acceptanceCriteria;
    if (!Array.isArray(criteria) || criteria.length < MIN_ACCEPTANCE_CRITERIA) {
      failingItems.push({
        identifier: feature.identifier,
        issue: `Feature has ${Array.isArray(criteria) ? criteria.length : 0} acceptance criteria (minimum: ${MIN_ACCEPTANCE_CRITERIA})`,
      });
    }
  }

  return {
    checkName: "Acceptance Criteria",
    passed: failingItems.length === 0,
    details:
      failingItems.length === 0
        ? `All features have at least ${MIN_ACCEPTANCE_CRITERIA} acceptance criteria`
        : `${failingItems.length} feature(s) have fewer than ${MIN_ACCEPTANCE_CRITERIA} acceptance criteria`,
    items: failingItems.length > 0 ? failingItems : undefined,
  };
}

export function checkTaskDensity(features: FeatureWithTasks[]): PreflightCheckResult {
  const failingItems: { identifier: string; issue: string }[] = [];

  for (const feature of features) {
    if (feature.tasks.length < MIN_TASKS_PER_FEATURE) {
      failingItems.push({
        identifier: feature.identifier,
        issue: `Feature has ${feature.tasks.length} task(s) (minimum: ${MIN_TASKS_PER_FEATURE})`,
      });
    }
  }

  return {
    checkName: "Task Density",
    passed: failingItems.length === 0,
    details:
      failingItems.length === 0
        ? `All features have at least ${MIN_TASKS_PER_FEATURE} tasks`
        : `${failingItems.length} feature(s) have fewer than ${MIN_TASKS_PER_FEATURE} tasks`,
    items: failingItems.length > 0 ? failingItems : undefined,
  };
}

export function checkEpicDescription(description: string | null | undefined): PreflightCheckResult {
  if (!description) {
    return {
      checkName: "Epic Description",
      passed: false,
      details: "Epic has no description",
      items: [{ identifier: "epic", issue: "Description is empty or missing" }],
    };
  }

  const result = validateEpicDescription(description);
  // Compute a rough "score" — 100 minus 5 for each violation
  const score = Math.max(0, 100 - result.violations.length * 5);
  const passed = result.valid && score >= MIN_DESCRIPTION_SCORE;

  return {
    checkName: "Epic Description",
    passed,
    details: result.valid
      ? `Description passes all quality checks (score: ${score})`
      : `Description has ${result.violations.length} violation(s): ${result.violations.map((v) => v.message).join("; ")}`,
    items: !passed
      ? result.violations.map((v) => ({ identifier: "epic-description", issue: v.message }))
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function checkDependencies(epicId: string): Promise<PreflightCheckResult> {
  const result = await resolveDependencies(epicId);

  if (!result.blocked) {
    return {
      checkName: "Cross-Epic Dependencies",
      passed: true,
      details: "All epic dependencies are resolved (or no dependencies set)",
    };
  }

  return {
    checkName: "Cross-Epic Dependencies",
    passed: false,
    details: `Epic is blocked by ${result.blockingEpics.length} unresolved dependenc${result.blockingEpics.length === 1 ? "y" : "ies"}`,
    items: result.blockingEpics.map((e) => ({
      identifier: e.identifier,
      issue: `Dependency epic '${e.identifier}' (${e.name}) is not yet completed (status: ${e.status})`,
    })),
  };
}

export async function runPreflight(epicId: string): Promise<PreflightResult> {
  const epic = await prisma.epic.findUnique({
    where: { id: epicId },
    include: {
      features: {
        include: {
          tasks: {
            select: { identifier: true, structuredDesc: true },
          },
        },
      },
    },
  });

  if (!epic) {
    throw new Error(`Epic with id '${epicId}' not found`);
  }

  const depCheck = await checkDependencies(epicId);

  const checks: PreflightCheckResult[] = [
    depCheck,
    checkScaffoldHints(epic.features),
    checkAcceptanceCriteria(epic.features),
    checkTaskDensity(epic.features),
    checkEpicDescription(epic.description),
  ];

  const passed = checks.every((c) => c.passed);
  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  return {
    epicId,
    passed,
    score,
    checks,
    checkedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Override CRUD helpers
// ---------------------------------------------------------------------------

export async function recordOverride(
  epicId: string,
  userId: string,
  reason: string,
  issues: string[]
) {
  return prisma.preflightOverride.create({
    data: {
      epicId,
      userId,
      reason,
      overriddenIssues: JSON.stringify(issues),
    },
    include: {
      epic: { select: { id: true, name: true, identifier: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function listOverrides(options?: {
  epicId?: string;
  cursor?: string;
  limit?: number;
}) {
  const { epicId, cursor, limit = 20 } = options ?? {};

  const where = epicId ? { epicId } : {};

  const items = await prisma.preflightOverride.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      epic: { select: { id: true, name: true, identifier: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? data[data.length - 1]?.id : null;

  return { data, cursor: nextCursor, hasMore };
}

export async function getOverride(id: string) {
  return prisma.preflightOverride.findUnique({
    where: { id },
    include: {
      epic: { select: { id: true, name: true, identifier: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
}
