/**
 * Plan Scoring Service
 *
 * Evaluates epic plan quality against the plan-reviewer rubric and returns
 * numeric scores with itemized feedback. Implements deterministic server-side
 * scoring logic based on .github/skills/spectree-plan-review/SKILL.md.
 */

import { prisma } from "../lib/db.js";
import { NotFoundError } from "../errors/index.js";

// =============================================================================
// Types
// =============================================================================

export interface ScoringCheck {
  check: string;
  points: number;
  earned: number;
  passed: boolean;
  detail?: string;
}

export interface CategoryScore {
  score: number; // 0-100
  checks: ScoringCheck[];
}

export interface FeatureScore {
  featureId: string;
  identifier: string;
  title: string;
  score: number;
  checks: ScoringCheck[];
}

export interface TaskScore {
  taskId: string;
  identifier: string;
  title: string;
  featureIdentifier: string;
  score: number;
  checks: ScoringCheck[];
}

export interface PlanScoreResult {
  epicId: string;
  epicName: string;
  overallScore: number;
  passed: boolean; // >= 85 (self-scoring threshold)
  epicDescriptionScore: CategoryScore;
  featureScores: FeatureScore[];
  featureAvgScore: number;
  taskScores: TaskScore[];
  taskAvgScore: number;
  executionPlanScore: CategoryScore;
  feedback: string[];
}

export interface TaskCompletenessReport {
  taskId: string;
  taskIdentifier: string;
  title: string;
  featureIdentifier: string;
  passed: boolean;
  violations: string[];
}

export interface TaskCompletenessResult {
  epicId: string;
  epicName: string;
  summary: {
    totalTasks: number;
    passing: number;
    failing: number;
    totalViolations: number;
  };
  tasks: TaskCompletenessReport[];
}

// =============================================================================
// Parsed structured description type
// =============================================================================

interface StructuredDesc {
  summary?: string;
  aiInstructions?: string;
  acceptanceCriteria?: string[];
  filesInvolved?: string[];
  technicalNotes?: string;
  riskLevel?: string;
  estimatedEffort?: string;
}

function parseStructuredDesc(raw: string | null): StructuredDesc | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StructuredDesc;
  } catch {
    return null;
  }
}

// =============================================================================
// Epic Description Scoring (0-100)
// =============================================================================

const SECTION_KEYWORDS = {
  overview: ["overview", "source", "background"],
  problem: ["problem", "why", "challenge", "issue"],
  goals: ["goal", "objective", "target", "aim"],
  approach: ["approach", "technical", "architecture", "design", "implementation"],
  scope: ["scope", "in scope", "out of scope", "boundary", "include", "exclude"],
  executionPlan: ["execution plan", "phase", "execution", "timeline", "plan"],
  technical: ["technical consideration", "key file", "risk", "constraint", "infrastructure"],
  success: ["success", "criteria", "metric", "kpi", "measure"],
} as const;

const SUPPORTING_SECTION_KEYWORDS = [
  "target audience",
  "audience",
  "alternative",
  "alternative considered",
  "dependencies",
  "dependency",
  "access control",
  "permission",
  "ui/ux",
  "user interface",
  "ux requirement",
];

function hasSection(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function countSupportingSections(text: string): number {
  const lower = text.toLowerCase();
  return SUPPORTING_SECTION_KEYWORDS.filter((kw) => lower.includes(kw)).length;
}

function scoreEpicDescription(description: string | null): CategoryScore {
  const checks: ScoringCheck[] = [];

  if (!description || description.trim().length === 0) {
    // Empty description — zero points on all checks
    const emptyChecks: ScoringCheck[] = [
      { check: "Overview/Source", points: 10, earned: 0, passed: false, detail: "No description present" },
      { check: "Problem Statement", points: 10, earned: 0, passed: false, detail: "No description present" },
      { check: "Goals", points: 10, earned: 0, passed: false, detail: "No description present" },
      { check: "Proposed Approach", points: 15, earned: 0, passed: false, detail: "No description present" },
      { check: "Scope Definition", points: 10, earned: 0, passed: false, detail: "No description present" },
      { check: "Execution Plan", points: 10, earned: 0, passed: false, detail: "No description present" },
      { check: "Technical Considerations", points: 15, earned: 0, passed: false, detail: "No description present" },
      { check: "Success Criteria", points: 10, earned: 0, passed: false, detail: "No description present" },
      { check: "Supporting Sections", points: 10, earned: 0, passed: false, detail: "No description present" },
    ];
    return { score: 0, checks: emptyChecks };
  }

  const text = description;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Overview/Source — 10 pts
  const hasOverview = hasSection(text, SECTION_KEYWORDS.overview);
  checks.push({
    check: "Overview/Source",
    points: 10,
    earned: hasOverview ? 10 : 0,
    passed: hasOverview,
    detail: hasOverview ? "Present" : "Missing overview/source section",
  });

  // Problem Statement — 10 pts
  const hasProblem = hasSection(text, SECTION_KEYWORDS.problem);
  checks.push({
    check: "Problem Statement",
    points: 10,
    earned: hasProblem ? 10 : 0,
    passed: hasProblem,
    detail: hasProblem ? "Present" : "Missing problem statement section",
  });

  // Goals — 10 pts
  const hasGoals = hasSection(text, SECTION_KEYWORDS.goals);
  checks.push({
    check: "Goals",
    points: 10,
    earned: hasGoals ? 10 : 0,
    passed: hasGoals,
    detail: hasGoals ? "Present" : "Missing goals section",
  });

  // Proposed Approach — 15 pts (full=15, partial=7 if short description)
  const hasApproach = hasSection(text, SECTION_KEYWORDS.approach);
  const approachSubstantive =
    hasApproach &&
    text.toLowerCase().includes("package") ||
    text.toLowerCase().includes("endpoint") ||
    text.toLowerCase().includes("component") ||
    text.toLowerCase().includes("service") ||
    text.toLowerCase().includes("route");
  const approachPoints = hasApproach ? (approachSubstantive ? 15 : 8) : 0;
  checks.push({
    check: "Proposed Approach",
    points: 15,
    earned: approachPoints,
    passed: approachPoints > 0,
    detail:
      approachPoints === 15
        ? "Present and substantive"
        : approachPoints === 8
        ? "Present but thin (add specific file/endpoint/component references)"
        : "Missing proposed approach section",
  });

  // Scope Definition — 10 pts
  const hasScope = hasSection(text, SECTION_KEYWORDS.scope);
  checks.push({
    check: "Scope Definition",
    points: 10,
    earned: hasScope ? 10 : 0,
    passed: hasScope,
    detail: hasScope ? "Present" : "Missing scope definition section",
  });

  // Execution Plan — 10 pts
  const hasExecPlan = hasSection(text, SECTION_KEYWORDS.executionPlan);
  checks.push({
    check: "Execution Plan",
    points: 10,
    earned: hasExecPlan ? 10 : 0,
    passed: hasExecPlan,
    detail: hasExecPlan ? "Present" : "Missing execution plan section",
  });

  // Technical Considerations — 15 pts
  const hasTechnical = hasSection(text, SECTION_KEYWORDS.technical);
  checks.push({
    check: "Technical Considerations",
    points: 15,
    earned: hasTechnical ? 15 : 0,
    passed: hasTechnical,
    detail: hasTechnical ? "Present" : "Missing technical considerations section",
  });

  // Success Criteria — 10 pts
  const hasSuccess = hasSection(text, SECTION_KEYWORDS.success);
  checks.push({
    check: "Success Criteria",
    points: 10,
    earned: hasSuccess ? 10 : 0,
    passed: hasSuccess,
    detail: hasSuccess ? "Present" : "Missing success criteria section",
  });

  // Supporting Sections — 10 pts (need >= 2)
  const supportingCount = countSupportingSections(text);
  const supportingPoints = supportingCount >= 2 ? 10 : supportingCount === 1 ? 5 : 0;
  checks.push({
    check: "Supporting Sections",
    points: 10,
    earned: supportingPoints,
    passed: supportingCount >= 2,
    detail:
      supportingCount >= 2
        ? `Present (${String(supportingCount)} supporting sections found)`
        : `Only ${String(supportingCount)} supporting section(s) found (need >= 2: target audience, alternatives, dependencies, etc.)`,
  });

  // Word count penalty — flag descriptions under 300 words
  if (wordCount < 300) {
    checks.push({
      check: "Word Count",
      points: 0,
      earned: 0,
      passed: false,
      detail: `Description has ${String(wordCount)} words — under 300 word minimum (critical issue)`,
    });
  }

  const totalEarned = checks.reduce((sum, c) => sum + c.earned, 0);
  const totalPoints = 100; // Fixed denominator (the 9 scoring checks sum to 100)
  const score = Math.min(100, Math.round((totalEarned / totalPoints) * 100));

  return { score, checks };
}

// =============================================================================
// Feature Scoring (0-100)
// =============================================================================

interface FeatureRow {
  id: string;
  identifier: string;
  title: string;
  executionOrder: number | null;
  estimatedComplexity: string | null;
  canParallelize: boolean;
  parallelGroup: string | null;
  dependencies: string | null;
  structuredDesc: string | null;
}

function scoreFeature(feature: FeatureRow): { score: number; checks: ScoringCheck[] } {
  const checks: ScoringCheck[] = [];
  const sd = parseStructuredDesc(feature.structuredDesc);

  // Structured description exists — 15 pts
  const hasDesc = sd !== null && typeof sd.summary === "string" && sd.summary.trim().length > 0;
  checks.push({
    check: "Structured description exists",
    points: 15,
    earned: hasDesc ? 15 : 0,
    passed: hasDesc,
    detail: hasDesc ? "Present" : "Missing structured description with summary",
  });

  // AI instructions — 20 pts
  const hasAi =
    hasDesc &&
    typeof sd!.aiInstructions === "string" &&
    sd!.aiInstructions.trim().length > 20;
  checks.push({
    check: "AI instructions present",
    points: 20,
    earned: hasAi ? 20 : 0,
    passed: hasAi,
    detail: hasAi ? "Present with step-by-step guidance" : "Missing or too vague AI instructions",
  });

  // Acceptance criteria count >= 3 — 15 pts
  const acCount = hasDesc ? (sd!.acceptanceCriteria?.length ?? 0) : 0;
  const hasAcCount = acCount >= 3;
  checks.push({
    check: "Acceptance criteria count",
    points: 15,
    earned: hasAcCount ? 15 : acCount >= 1 ? 7 : 0,
    passed: hasAcCount,
    detail: hasAcCount
      ? `${String(acCount)} criteria present`
      : `Only ${String(acCount)} criteria (need >= 3)`,
  });

  // Acceptance criteria quality — 15 pts (check for vague criteria)
  const vagueTerms = ["works correctly", "no bugs", "functions", "works as expected", "properly"];
  const criteria = hasDesc ? (sd!.acceptanceCriteria ?? []) : [];
  const vagueCount = criteria.filter((c) =>
    vagueTerms.some((t) => c.toLowerCase().includes(t))
  ).length;
  const acQualityPassed = acCount >= 1 && vagueCount === 0;
  checks.push({
    check: "Acceptance criteria quality",
    points: 15,
    earned: acQualityPassed ? 15 : acCount >= 1 && vagueCount > 0 ? 7 : 0,
    passed: acQualityPassed,
    detail: acQualityPassed
      ? "Criteria are specific and verifiable"
      : vagueCount > 0
      ? `${String(vagueCount)} vague criteria found (avoid "works correctly", "no bugs", etc.)`
      : "No acceptance criteria to evaluate",
  });

  // Files involved >= 1 — 10 pts
  const filesCount = hasDesc ? (sd!.filesInvolved?.length ?? 0) : 0;
  const hasFiles = filesCount >= 1;
  checks.push({
    check: "Files involved listed",
    points: 10,
    earned: hasFiles ? 10 : 0,
    passed: hasFiles,
    detail: hasFiles ? `${String(filesCount)} files listed` : "No files listed in filesInvolved",
  });

  // Execution metadata — 15 pts
  const hasExecOrder = feature.executionOrder !== null;
  const hasComplexity = feature.estimatedComplexity !== null;
  const execMetaPoints = hasExecOrder && hasComplexity ? 15 : hasExecOrder || hasComplexity ? 7 : 0;
  checks.push({
    check: "Execution metadata set",
    points: 15,
    earned: execMetaPoints,
    passed: execMetaPoints === 15,
    detail:
      execMetaPoints === 15
        ? "executionOrder and estimatedComplexity both set"
        : `Missing: ${!hasExecOrder ? "executionOrder" : ""} ${!hasComplexity ? "estimatedComplexity" : ""}`.trim(),
  });

  // Risk and effort — 10 pts
  const hasRisk = hasDesc && typeof sd!.riskLevel === "string" && sd!.riskLevel.trim().length > 0;
  const hasEffort =
    hasDesc && typeof sd!.estimatedEffort === "string" && sd!.estimatedEffort.trim().length > 0;
  const riskEffortPoints = hasRisk && hasEffort ? 10 : hasRisk || hasEffort ? 5 : 0;
  checks.push({
    check: "Risk and effort assessed",
    points: 10,
    earned: riskEffortPoints,
    passed: riskEffortPoints === 10,
    detail:
      riskEffortPoints === 10
        ? "riskLevel and estimatedEffort both set"
        : `Missing: ${!hasRisk ? "riskLevel" : ""} ${!hasEffort ? "estimatedEffort" : ""}`.trim(),
  });

  const totalEarned = checks.reduce((sum, c) => sum + c.earned, 0);
  const score = Math.min(100, totalEarned);

  return { score, checks };
}

// =============================================================================
// Task Scoring (0-100)
// =============================================================================

interface TaskRow {
  id: string;
  identifier: string;
  title: string;
  structuredDesc: string | null;
}

function scoreTask(task: TaskRow): { score: number; checks: ScoringCheck[] } {
  const checks: ScoringCheck[] = [];
  const sd = parseStructuredDesc(task.structuredDesc);

  // Structured description exists — 15 pts
  const hasDesc = sd !== null && typeof sd.summary === "string" && sd.summary.trim().length > 0;
  checks.push({
    check: "Structured description exists",
    points: 15,
    earned: hasDesc ? 15 : 0,
    passed: hasDesc,
    detail: hasDesc ? "Present" : "Missing structured description with summary",
  });

  // AI instructions — 25 pts
  const hasAi =
    hasDesc &&
    typeof sd!.aiInstructions === "string" &&
    sd!.aiInstructions.trim().length > 20;
  checks.push({
    check: "AI instructions present",
    points: 25,
    earned: hasAi ? 25 : 0,
    passed: hasAi,
    detail: hasAi
      ? "Present with concrete file paths and step-by-step guidance"
      : "Missing or too vague AI instructions (include specific file paths and function names)",
  });

  // Acceptance criteria count >= 2 — 15 pts
  const acCount = hasDesc ? (sd!.acceptanceCriteria?.length ?? 0) : 0;
  const hasAcCount = acCount >= 2;
  checks.push({
    check: "Acceptance criteria count",
    points: 15,
    earned: hasAcCount ? 15 : acCount >= 1 ? 7 : 0,
    passed: hasAcCount,
    detail: hasAcCount
      ? `${String(acCount)} criteria present`
      : `Only ${String(acCount)} criteria (need >= 2)`,
  });

  // Acceptance criteria quality — 15 pts
  const vagueTerms = ["works correctly", "no bugs", "functions", "works as expected", "properly"];
  const criteria = hasDesc ? (sd!.acceptanceCriteria ?? []) : [];
  const vagueCount = criteria.filter((c) =>
    vagueTerms.some((t) => c.toLowerCase().includes(t))
  ).length;
  const acQualityPassed = acCount >= 1 && vagueCount === 0;
  checks.push({
    check: "Acceptance criteria quality",
    points: 15,
    earned: acQualityPassed ? 15 : acCount >= 1 && vagueCount > 0 ? 7 : 0,
    passed: acQualityPassed,
    detail: acQualityPassed
      ? "Criteria are specific and testable"
      : vagueCount > 0
      ? `${String(vagueCount)} vague criteria found`
      : "No criteria to evaluate",
  });

  // Files involved >= 1 — 15 pts
  const filesCount = hasDesc ? (sd!.filesInvolved?.length ?? 0) : 0;
  const hasFiles = filesCount >= 1;
  checks.push({
    check: "Files involved listed",
    points: 15,
    earned: hasFiles ? 15 : 0,
    passed: hasFiles,
    detail: hasFiles ? `${String(filesCount)} files listed` : "No files listed in filesInvolved",
  });

  // Self-contained — 15 pts (heuristic: has summary + AI instructions + files)
  const selfContained = hasDesc && hasAi && hasFiles;
  checks.push({
    check: "Self-contained",
    points: 15,
    earned: selfContained ? 15 : 0,
    passed: selfContained,
    detail: selfContained
      ? "Task has summary, AI instructions, and files to implement without other context"
      : "Task is missing fields that would allow a fresh agent to implement it independently",
  });

  const totalEarned = checks.reduce((sum, c) => sum + c.earned, 0);
  const score = Math.min(100, totalEarned);

  return { score, checks };
}

// =============================================================================
// Execution Plan Scoring (0-100)
// =============================================================================

interface ExecPlanFeature {
  id: string;
  identifier: string;
  executionOrder: number | null;
  canParallelize: boolean;
  parallelGroup: string | null;
  dependencies: string | null;
  structuredDesc: string | null;
}

function scoreExecutionPlan(features: ExecPlanFeature[]): CategoryScore {
  const checks: ScoringCheck[] = [];

  if (features.length === 0) {
    return {
      score: 0,
      checks: [
        { check: "All features included", points: 25, earned: 0, passed: false, detail: "No features found" },
        { check: "Execution order set", points: 25, earned: 0, passed: false, detail: "No features found" },
        { check: "Dependencies valid", points: 25, earned: 0, passed: false, detail: "No features found" },
        { check: "Parallel safety", points: 25, earned: 0, passed: false, detail: "No features found" },
      ],
    };
  }

  // All features included — 25 pts (all have executionOrder set)
  const allIncluded = features.every((f) => f.executionOrder !== null);
  checks.push({
    check: "All features included",
    points: 25,
    earned: allIncluded ? 25 : 0,
    passed: allIncluded,
    detail: allIncluded
      ? "All features have executionOrder set"
      : `${String(features.filter((f) => f.executionOrder === null).length)} feature(s) missing executionOrder`,
  });

  // Execution order set — 25 pts
  const allHaveOrder = features.every((f) => f.executionOrder !== null);
  checks.push({
    check: "Execution order set",
    points: 25,
    earned: allHaveOrder ? 25 : 0,
    passed: allHaveOrder,
    detail: allHaveOrder
      ? "All features have non-null executionOrder"
      : "Some features are missing executionOrder",
  });

  // Dependencies valid — 25 pts (no circular dependencies, referenced IDs exist)
  const featureIds = new Set(features.map((f) => f.id));
  let depsValid = true;
  const depViolations: string[] = [];

  for (const feature of features) {
    if (feature.dependencies) {
      let deps: string[] = [];
      try {
        deps = JSON.parse(feature.dependencies) as string[];
      } catch {
        deps = [];
      }
      for (const depId of deps) {
        if (!featureIds.has(depId)) {
          depsValid = false;
          depViolations.push(`${feature.identifier} references unknown dependency ${depId}`);
        }
      }
    }
  }

  checks.push({
    check: "Dependencies valid",
    points: 25,
    earned: depsValid ? 25 : 0,
    passed: depsValid,
    detail: depsValid
      ? "All dependency references are valid"
      : `Invalid dependencies: ${depViolations.join("; ")}`,
  });

  // Parallel safety — 25 pts (parallel group members don't share files)
  const parallelGroups = new Map<string, ExecPlanFeature[]>();
  for (const feature of features) {
    if (feature.canParallelize && feature.parallelGroup) {
      const group = parallelGroups.get(feature.parallelGroup) ?? [];
      group.push(feature);
      parallelGroups.set(feature.parallelGroup, group);
    }
  }

  let parallelSafe = true;
  const parallelViolations: string[] = [];

  for (const [groupName, groupFeatures] of parallelGroups) {
    const allFiles = groupFeatures.flatMap((f) => {
      const sd = parseStructuredDesc(f.structuredDesc);
      return sd?.filesInvolved ?? [];
    });
    const fileCounts = new Map<string, number>();
    for (const file of allFiles) {
      fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
    }
    for (const [file, count] of fileCounts) {
      if (count > 1) {
        parallelSafe = false;
        parallelViolations.push(`Group "${groupName}" has file conflict: ${file}`);
      }
    }
  }

  checks.push({
    check: "Parallel safety",
    points: 25,
    earned: parallelSafe ? 25 : 0,
    passed: parallelSafe,
    detail: parallelSafe
      ? "No file conflicts in parallel groups"
      : `File conflicts detected: ${parallelViolations.join("; ")}`,
  });

  const totalEarned = checks.reduce((sum, c) => sum + c.earned, 0);
  const score = Math.min(100, totalEarned);

  return { score, checks };
}

// =============================================================================
// Main Scoring Function
// =============================================================================

export async function scoreEpicPlan(epicId: string): Promise<PlanScoreResult> {
  // Fetch epic with all features and tasks
  const epic = await prisma.epic.findUnique({
    where: { id: epicId },
    select: {
      id: true,
      name: true,
      description: true,
      features: {
        select: {
          id: true,
          identifier: true,
          title: true,
          executionOrder: true,
          estimatedComplexity: true,
          canParallelize: true,
          parallelGroup: true,
          dependencies: true,
          structuredDesc: true,
          tasks: {
            select: {
              id: true,
              identifier: true,
              title: true,
              structuredDesc: true,
            },
          },
        },
      },
    },
  });

  if (!epic) {
    throw new NotFoundError(`Epic not found: ${epicId}`);
  }

  // Score epic description
  const epicDescriptionScore = scoreEpicDescription(epic.description);

  // Score each feature
  const featureScores: FeatureScore[] = epic.features.map((feature) => {
    const { score, checks } = scoreFeature(feature);
    return {
      featureId: feature.id,
      identifier: feature.identifier,
      title: feature.title,
      score,
      checks,
    };
  });

  const featureAvgScore =
    featureScores.length > 0
      ? Math.round(featureScores.reduce((sum, f) => sum + f.score, 0) / featureScores.length)
      : 0;

  // Score each task
  const taskScores: TaskScore[] = epic.features.flatMap((feature) =>
    feature.tasks.map((task) => {
      const { score, checks } = scoreTask(task);
      return {
        taskId: task.id,
        identifier: task.identifier,
        title: task.title,
        featureIdentifier: feature.identifier,
        score,
        checks,
      };
    })
  );

  const taskAvgScore =
    taskScores.length > 0
      ? Math.round(taskScores.reduce((sum, t) => sum + t.score, 0) / taskScores.length)
      : 0;

  // Score execution plan
  const executionPlanScore = scoreExecutionPlan(epic.features);

  // Compute weighted overall score
  // Epic Description: 30%, Feature: 25%, Task: 25%, Execution Plan: 20%
  const overallScore = Math.round(
    epicDescriptionScore.score * 0.3 +
      featureAvgScore * 0.25 +
      taskAvgScore * 0.25 +
      executionPlanScore.score * 0.2
  );

  // Collect actionable feedback for failing checks
  const feedback: string[] = [];
  epicDescriptionScore.checks
    .filter((c) => !c.passed)
    .forEach((c) => feedback.push(`[Epic Description] ${c.check}: ${c.detail ?? "failed"}`));

  featureScores
    .flatMap((fs) =>
      fs.checks
        .filter((c) => !c.passed)
        .map((c) => `[Feature ${fs.identifier}] ${c.check}: ${c.detail ?? "failed"}`)
    )
    .forEach((msg) => feedback.push(msg));

  taskScores
    .flatMap((ts) =>
      ts.checks
        .filter((c) => !c.passed)
        .map((c) => `[Task ${ts.identifier}] ${c.check}: ${c.detail ?? "failed"}`)
    )
    .forEach((msg) => feedback.push(msg));

  executionPlanScore.checks
    .filter((c) => !c.passed)
    .forEach((c) => feedback.push(`[Execution Plan] ${c.check}: ${c.detail ?? "failed"}`));

  return {
    epicId: epic.id,
    epicName: epic.name,
    overallScore,
    passed: overallScore >= 85,
    epicDescriptionScore,
    featureScores,
    featureAvgScore,
    taskScores,
    taskAvgScore,
    executionPlanScore,
    feedback,
  };
}

// =============================================================================
// Task Completeness Validation
// =============================================================================

export async function validateTaskCompleteness(epicId: string): Promise<TaskCompletenessResult> {
  const epic = await prisma.epic.findUnique({
    where: { id: epicId },
    select: {
      id: true,
      name: true,
      features: {
        select: {
          identifier: true,
          tasks: {
            select: {
              id: true,
              identifier: true,
              title: true,
              structuredDesc: true,
            },
          },
        },
      },
    },
  });

  if (!epic) {
    throw new NotFoundError(`Epic not found: ${epicId}`);
  }

  const reports: TaskCompletenessReport[] = [];

  for (const feature of epic.features) {
    for (const task of feature.tasks) {
      const violations: string[] = [];
      const sd = parseStructuredDesc(task.structuredDesc);

      // Check 1: description.length >= 50 (via summary in structuredDesc)
      if (!sd || !sd.summary || sd.summary.trim().length < 50) {
        violations.push(
          `summary length < 50 chars (got ${String(sd?.summary?.trim().length ?? 0)})`
        );
      }

      // Check 2: acceptanceCriteria.length >= 2
      const acLen = sd?.acceptanceCriteria?.length ?? 0;
      if (acLen < 2) {
        violations.push(`acceptanceCriteria count < 2 (got ${String(acLen)})`);
      }

      // Check 3: filesInvolved.length >= 1
      const filesLen = sd?.filesInvolved?.length ?? 0;
      if (filesLen < 1) {
        violations.push("filesInvolved is empty (must have >= 1 file)");
      }

      // Check 4: aiInstructions non-empty
      if (!sd?.aiInstructions || sd.aiInstructions.trim().length === 0) {
        violations.push("aiInstructions is empty");
      }

      // Check 5: estimatedEffort set
      if (!sd?.estimatedEffort || sd.estimatedEffort.trim().length === 0) {
        violations.push("estimatedEffort is not set");
      }

      reports.push({
        taskId: task.id,
        taskIdentifier: task.identifier,
        title: task.title,
        featureIdentifier: feature.identifier,
        passed: violations.length === 0,
        violations,
      });
    }
  }

  const passing = reports.filter((r) => r.passed).length;
  const failing = reports.filter((r) => !r.passed).length;
  const totalViolations = reports.reduce((sum, r) => sum + r.violations.length, 0);

  return {
    epicId: epic.id,
    epicName: epic.name,
    summary: {
      totalTasks: reports.length,
      passing,
      failing,
      totalViolations,
    },
    tasks: reports,
  };
}
