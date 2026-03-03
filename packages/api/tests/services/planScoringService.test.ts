/**
 * Unit tests for Plan Scoring Service (ENG-E219)
 *
 * Tests scoring logic determinism against hand-computed expected scores.
 * Covers happy path, edge cases, and rubric accuracy.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock the db module
// ─────────────────────────────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    epic: {
      findUnique: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock("../../src/lib/db.js", () => ({
  prisma: mockPrisma,
}));

import {
  scoreEpicPlan,
  validateTaskCompleteness,
} from "../../src/services/plan-scoring.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const GOOD_EPIC_DESCRIPTION = `
## Overview
This epic adds a comprehensive plan scoring system to Dispatcher.

## Problem Statement
Planners currently compute quality scores manually via LLM reasoning, which is
non-deterministic and slow. We need a server-side deterministic scoring engine.

## Goals
| Goal | Description |
|------|-------------|
| Deterministic scoring | Same plan always gets same score |
| MCP integration | Scores callable from planner agent |

## Proposed Approach
Server-side service in packages/api/src/services/plan-scoring.ts reads epic
and computes scores against rubric. Exposed via REST endpoint and MCP tool.
Key packages: api, mcp. Routes: GET /api/v1/epics/:id/score.
Services: plan-scoring.ts. Components: score_plan MCP tool.

## Scope Definition
In scope: scoring, task validation, requirement traceability.
Out of scope: AI-powered suggestions, score history.

## Execution Plan
| Phase | Feature | Identifier | Complexity |
|-------|---------|------------|------------|
| 1 | Score Plan MCP Tool | ENG-186 | Moderate |
| 2 | Planner Integration | ENG-189 | Moderate |

## Technical Considerations
Key files: packages/api/src/services/plan-scoring.ts, packages/mcp/src/tools/plan-scoring.ts.
Risk areas: scoring rubric drift. Existing infrastructure: Fastify + Prisma.
Constraint: scoring must be deterministic.

## Success Criteria
1. score_plan tool returns deterministic scores
2. All 9 epic description checks evaluated
3. Overall score = weighted average of 4 categories

## Target Audience
Planner agents running the Stage 4 EVALUATE pipeline.

## Alternatives Considered
LLM-computed scoring was rejected due to non-determinism.
`;

const EMPTY_DESCRIPTION = "";

const GOOD_STRUCTURED_DESC = JSON.stringify({
  summary: "Implement plan scoring service with full rubric evaluation logic",
  aiInstructions:
    "1. Read packages/api/src/services/plan-scoring.ts\n" +
    "2. Study the rubric in .github/skills/spectree-plan-review/SKILL.md\n" +
    "3. Implement scoreEpicPlan function using Prisma to fetch data\n" +
    "4. Return PlanScoreResult with per-category scores",
  acceptanceCriteria: [
    "Function returns overallScore between 0-100",
    "epicDescriptionScore has 9 checks with correct point allocations",
    "featureScores has one entry per feature with passed/failed checks",
  ],
  filesInvolved: [
    "packages/api/src/services/plan-scoring.ts",
    "packages/api/src/routes/plan-scoring.ts",
  ],
  riskLevel: "medium",
  estimatedEffort: "medium",
});

const INCOMPLETE_STRUCTURED_DESC = JSON.stringify({
  summary: "Short desc",
  acceptanceCriteria: ["One criterion only"],
  // missing aiInstructions, filesInvolved, riskLevel, estimatedEffort
});

function makeEpic(overrides: Record<string, unknown> = {}) {
  return {
    id: "epic-1",
    name: "Test Epic",
    description: GOOD_EPIC_DESCRIPTION,
    features: [],
    ...overrides,
  };
}

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: "feature-1",
    identifier: "ENG-186",
    title: "Score Plan Tool",
    executionOrder: 1,
    estimatedComplexity: "moderate",
    canParallelize: false,
    parallelGroup: null,
    dependencies: null,
    structuredDesc: GOOD_STRUCTURED_DESC,
    tasks: [],
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    identifier: "ENG-186-1",
    title: "Implement plan scoring service",
    structuredDesc: GOOD_STRUCTURED_DESC,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Plan Scoring Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scoreEpicPlan", () => {
    it("throws NotFoundError for missing epic", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(null);
      await expect(scoreEpicPlan("nonexistent-id")).rejects.toThrow("Epic not found");
    });

    it("returns 0 score for epic with empty description", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: EMPTY_DESCRIPTION, features: [] })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.epicDescriptionScore.score).toBe(0);
      expect(result.overallScore).toBe(0);
    });

    it("returns high epic description score for comprehensive description", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: GOOD_EPIC_DESCRIPTION, features: [] })
      );
      const result = await scoreEpicPlan("epic-1");
      // Good description should score >= 85 on epic description
      expect(result.epicDescriptionScore.score).toBeGreaterThanOrEqual(85);
    });

    it("scores feature with complete structured description highly", async () => {
      const feature = makeFeature({
        tasks: [makeTask()],
      });
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ features: [feature] })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.featureScores).toHaveLength(1);
      expect(result.featureScores[0]!.score).toBeGreaterThanOrEqual(70);
    });

    it("scores feature with missing structured description at 0", async () => {
      const feature = makeFeature({
        structuredDesc: null,
        executionOrder: null,
        estimatedComplexity: null,
        tasks: [],
      });
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ features: [feature] })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.featureScores[0]!.score).toBe(0);
    });

    it("scores task with complete structured description highly", async () => {
      const task = makeTask();
      const feature = makeFeature({ tasks: [task] });
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ features: [feature] })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.taskScores).toHaveLength(1);
      expect(result.taskScores[0]!.score).toBeGreaterThanOrEqual(70);
    });

    it("scores task with missing fields at low score", async () => {
      const task = makeTask({ structuredDesc: null });
      const feature = makeFeature({ tasks: [task] });
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ features: [feature] })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.taskScores[0]!.score).toBe(0);
    });

    it("returns passed=true when overallScore >= 85", async () => {
      // Perfect epic: good description + good features + good tasks + good exec plan
      const task = makeTask();
      const feature = makeFeature({ tasks: [task] });
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: GOOD_EPIC_DESCRIPTION, features: [feature] })
      );
      const result = await scoreEpicPlan("epic-1");
      // Check that passed boolean matches overallScore
      expect(result.passed).toBe(result.overallScore >= 85);
    });

    it("returns passed=false for empty epic", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: "", features: [] })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.passed).toBe(false);
      expect(result.overallScore).toBe(0);
    });

    it("computes weighted overall score correctly", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: GOOD_EPIC_DESCRIPTION, features: [] })
      );
      const result = await scoreEpicPlan("epic-1");
      // With no features/tasks, feature and task scores are 0
      // Overall = epicDesc*0.30 + feature*0.25 + task*0.25 + execPlan*0.20
      // execPlan should be 0 (no features = score 0)
      const expected = Math.round(result.epicDescriptionScore.score * 0.3);
      expect(result.overallScore).toBe(expected);
    });

    it("detects execution plan issues with missing executionOrder", async () => {
      const feature = makeFeature({
        executionOrder: null,
        tasks: [],
      });
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ features: [feature] })
      );
      const result = await scoreEpicPlan("epic-1");
      // All features included check fails since executionOrder is null
      const allIncludedCheck = result.executionPlanScore.checks.find(
        (c) => c.check === "All features included"
      );
      expect(allIncludedCheck?.passed).toBe(false);
    });

    it("detects invalid dependency references in execution plan", async () => {
      const feature = makeFeature({
        dependencies: JSON.stringify(["nonexistent-feature-id"]),
        tasks: [],
      });
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ features: [feature] })
      );
      const result = await scoreEpicPlan("epic-1");
      const depsCheck = result.executionPlanScore.checks.find(
        (c) => c.check === "Dependencies valid"
      );
      expect(depsCheck?.passed).toBe(false);
    });

    it("detects parallel file conflicts", async () => {
      const sharedFile = "packages/api/src/routes/epics.ts";
      const feature1 = makeFeature({
        id: "feature-1",
        identifier: "ENG-10",
        canParallelize: true,
        parallelGroup: "phase-1",
        structuredDesc: JSON.stringify({
          summary: "Feature 1 - modifies shared file",
          filesInvolved: [sharedFile],
        }),
        tasks: [],
      });
      const feature2 = makeFeature({
        id: "feature-2",
        identifier: "ENG-11",
        canParallelize: true,
        parallelGroup: "phase-1",
        structuredDesc: JSON.stringify({
          summary: "Feature 2 - also modifies shared file",
          filesInvolved: [sharedFile],
        }),
        tasks: [],
      });
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ features: [feature1, feature2] })
      );
      const result = await scoreEpicPlan("epic-1");
      const parallelCheck = result.executionPlanScore.checks.find(
        (c) => c.check === "Parallel safety"
      );
      expect(parallelCheck?.passed).toBe(false);
    });

    it("populates feedback array with all failing checks", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: "", features: [] })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.feedback.length).toBeGreaterThan(0);
      // All epic description checks should appear in feedback
      expect(result.feedback.some((f) => f.includes("[Epic Description]"))).toBe(true);
    });
  });

  describe("validateTaskCompleteness", () => {
    it("throws NotFoundError for missing epic", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(null);
      await expect(validateTaskCompleteness("nonexistent-id")).rejects.toThrow("Epic not found");
    });

    it("returns passing=true for task with all mandatory fields", async () => {
      const task = makeTask({
        structuredDesc: JSON.stringify({
          summary: "A" .repeat(55), // >= 50 chars
          acceptanceCriteria: ["Criterion 1", "Criterion 2"],
          filesInvolved: ["packages/api/src/services/plan-scoring.ts"],
          aiInstructions: "Read files and implement the function",
          estimatedEffort: "medium",
        }),
      });
      const feature = makeFeature({ tasks: [task] });
      mockPrisma.epic.findUnique.mockResolvedValue(makeEpic({ features: [feature] }));

      const result = await validateTaskCompleteness("epic-1");
      expect(result.summary.totalTasks).toBe(1);
      expect(result.summary.passing).toBe(1);
      expect(result.summary.failing).toBe(0);
      expect(result.tasks[0]!.passed).toBe(true);
      expect(result.tasks[0]!.violations).toHaveLength(0);
    });

    it("reports all 5 violations for task with empty structuredDesc", async () => {
      const task = makeTask({ structuredDesc: null });
      const feature = makeFeature({ tasks: [task] });
      mockPrisma.epic.findUnique.mockResolvedValue(makeEpic({ features: [feature] }));

      const result = await validateTaskCompleteness("epic-1");
      expect(result.tasks[0]!.passed).toBe(false);
      expect(result.tasks[0]!.violations).toHaveLength(5);
    });

    it("reports specific violations for partial structured desc", async () => {
      const task = makeTask({
        structuredDesc: JSON.stringify({
          summary: "A".repeat(55), // passes
          acceptanceCriteria: ["Only one criterion"], // fails (< 2)
          // filesInvolved missing — fails
          aiInstructions: "Some instructions", // passes
          // estimatedEffort missing — fails
        }),
      });
      const feature = makeFeature({ tasks: [task] });
      mockPrisma.epic.findUnique.mockResolvedValue(makeEpic({ features: [feature] }));

      const result = await validateTaskCompleteness("epic-1");
      expect(result.tasks[0]!.passed).toBe(false);
      const violations = result.tasks[0]!.violations;
      expect(violations.some((v) => v.includes("acceptanceCriteria"))).toBe(true);
      expect(violations.some((v) => v.includes("filesInvolved"))).toBe(true);
      expect(violations.some((v) => v.includes("estimatedEffort"))).toBe(true);
    });

    it("computes correct summary statistics", async () => {
      const passingTask = makeTask({
        id: "task-pass",
        identifier: "ENG-1-1",
        structuredDesc: JSON.stringify({
          summary: "A".repeat(55),
          acceptanceCriteria: ["Criterion 1", "Criterion 2"],
          filesInvolved: ["packages/api/src/services/plan-scoring.ts"],
          aiInstructions: "Step by step instructions",
          estimatedEffort: "small",
        }),
      });
      const failingTask = makeTask({
        id: "task-fail",
        identifier: "ENG-1-2",
        structuredDesc: null,
      });
      const feature = makeFeature({ tasks: [passingTask, failingTask] });
      mockPrisma.epic.findUnique.mockResolvedValue(makeEpic({ features: [feature] }));

      const result = await validateTaskCompleteness("epic-1");
      expect(result.summary.totalTasks).toBe(2);
      expect(result.summary.passing).toBe(1);
      expect(result.summary.failing).toBe(1);
      expect(result.summary.totalViolations).toBe(5); // all 5 violations for the failing task
    });

    it("returns empty tasks array for epic with no features", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(makeEpic({ features: [] }));
      const result = await validateTaskCompleteness("epic-1");
      expect(result.summary.totalTasks).toBe(0);
      expect(result.summary.passing).toBe(0);
      expect(result.summary.failing).toBe(0);
      expect(result.tasks).toHaveLength(0);
    });
  });

  describe("Epic Description Scoring Rubric Accuracy", () => {
    // Fixture 1: Sparse description — expected ~20/100
    it("Fixture 1: sparse description scores <= 30", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({
          description: "## Overview\nAdd filtering.\n\n## Problem\nUsers need filters.",
          features: [],
        })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.epicDescriptionScore.score).toBeLessThanOrEqual(30);
    });

    // Fixture 2: Missing several sections — expected 60-75/100
    it("Fixture 2: partial description with 5 of 9 sections scores 50-70", async () => {
      const partialDesc = `
## Overview
A plan scoring system that evaluates epic quality.

## Problem Statement
Manual scoring is non-deterministic and slow.

## Goals
| Goal | Score |
|------|-------|
| Automate scoring | via MCP tool |

## Proposed Approach
Create packages/api/src/services/plan-scoring.ts.
Expose via REST route. Create MCP tool.
Services and components involved.

## Success Criteria
1. Returns deterministic scores
2. Passes TypeScript compilation
      `;
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: partialDesc, features: [] })
      );
      const result = await scoreEpicPlan("epic-1");
      // Has overview, problem, goals, approach, success but missing scope, exec plan, technical, supporting
      expect(result.epicDescriptionScore.score).toBeGreaterThanOrEqual(50);
      expect(result.epicDescriptionScore.score).toBeLessThanOrEqual(75);
    });

    // Fixture 3: Comprehensive description — expected >= 85/100
    it("Fixture 3: comprehensive description (GOOD_EPIC_DESCRIPTION) scores >= 85", async () => {
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: GOOD_EPIC_DESCRIPTION, features: [] })
      );
      const result = await scoreEpicPlan("epic-1");
      expect(result.epicDescriptionScore.score).toBeGreaterThanOrEqual(85);
    });

    it("rewards approach with specific technical artifacts (services, routes, components)", async () => {
      const descWithApproach = `
## Overview
Test epic overview.
## Problem Statement
The problem is clearly articulated.
## Goals
- Goal 1
## Proposed Approach
Create a new service at packages/api/src/services/plan-scoring.ts.
Add a route at packages/api/src/routes/plan-scoring.ts.
Register the endpoint in packages/api/src/index.ts.
Create MCP tool component in packages/mcp/src/tools/plan-scoring.ts.
## Technical Considerations
Key files: packages/api/src/services/plan-scoring.ts. Risk: scoring rubric drift.
## Success Criteria
All tests pass with >= 90% coverage.
      `;
      mockPrisma.epic.findUnique.mockResolvedValue(
        makeEpic({ description: descWithApproach, features: [] })
      );
      const result = await scoreEpicPlan("epic-1");
      const approachCheck = result.epicDescriptionScore.checks.find(
        (c) => c.check === "Proposed Approach"
      );
      expect(approachCheck?.earned).toBe(15); // substantive approach = full points
    });
  });
});
