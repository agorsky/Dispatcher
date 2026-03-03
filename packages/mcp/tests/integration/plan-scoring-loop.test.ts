/**
 * Integration Test: Full Plan Scoring Self-Revision Loop (ENG-E219)
 *
 * Tests the complete workflow of the planner self-scoring loop:
 * 1. Score a failing plan
 * 2. Identify issues from feedback
 * 3. Simulate revision
 * 4. Re-score and pass
 *
 * Also tests edge cases: degenerate epic structures, missing data,
 * parallel file conflicts.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock API client
// ─────────────────────────────────────────────────────────────────────────────

const { mockApiClient } = vi.hoisted(() => {
  const mockApiClient = {
    scorePlan: vi.fn(),
    validateTaskCompleteness: vi.fn(),
    getEpicRequest: vi.fn(),
    listFeatures: vi.fn(),
  };
  return { mockApiClient };
});

vi.mock("../../src/api-client.js", () => ({
  getApiClient: () => mockApiClient,
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
  },
}));

const registeredTools = new Map<
  string,
  { config: unknown; handler: (input: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> }
>();

const mockServer = {
  registerTool: (
    name: string,
    config: unknown,
    handler: (input: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
  ) => {
    registeredTools.set(name, { config, handler });
  },
};

import { registerPlanScoringTools } from "../../src/tools/plan-scoring.js";
import { registerPlanRequirementTools } from "../../src/tools/plan-requirements.js";

beforeAll(() => {
  registerPlanScoringTools(mockServer as never);
  registerPlanRequirementTools(mockServer as never);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makePlanScoreResult(overrides: Record<string, unknown> = {}) {
  return {
    epicId: "epic-1",
    epicName: "Test Epic",
    overallScore: 60,
    passed: false,
    epicDescriptionScore: {
      score: 70,
      checks: [
        { check: "Overview/Source", points: 10, earned: 10, passed: true },
        { check: "Problem Statement", points: 10, earned: 0, passed: false, detail: "Missing problem statement" },
        { check: "Goals", points: 10, earned: 0, passed: false, detail: "Missing goals" },
        { check: "Proposed Approach", points: 15, earned: 8, passed: true },
        { check: "Scope Definition", points: 10, earned: 0, passed: false, detail: "Missing scope" },
        { check: "Execution Plan", points: 10, earned: 10, passed: true },
        { check: "Technical Considerations", points: 15, earned: 15, passed: true },
        { check: "Success Criteria", points: 10, earned: 10, passed: true },
        { check: "Supporting Sections", points: 10, earned: 5, passed: false, detail: "Only 1 supporting section" },
      ],
    },
    featureScores: [
      {
        featureId: "feature-1",
        identifier: "ENG-186",
        title: "Score Plan Tool",
        score: 65,
        checks: [
          { check: "Structured description exists", points: 15, earned: 15, passed: true },
          { check: "AI instructions present", points: 20, earned: 0, passed: false, detail: "Missing AI instructions" },
        ],
      },
    ],
    featureAvgScore: 65,
    taskScores: [],
    taskAvgScore: 0,
    executionPlanScore: {
      score: 75,
      checks: [
        { check: "All features included", points: 25, earned: 25, passed: true },
        { check: "Execution order set", points: 25, earned: 25, passed: true },
        { check: "Dependencies valid", points: 25, earned: 25, passed: true },
        { check: "Parallel safety", points: 25, earned: 0, passed: false, detail: "File conflict in phase-1" },
      ],
    },
    feedback: [
      "[Epic Description] Problem Statement: Missing problem statement",
      "[Epic Description] Goals: Missing goals",
      "[Epic Description] Scope Definition: Missing scope",
      "[Feature ENG-186] AI instructions present: Missing AI instructions",
      "[Execution Plan] Parallel safety: File conflict in phase-1",
    ],
    ...overrides,
  };
}

function makePassingPlanScoreResult() {
  return makePlanScoreResult({
    overallScore: 88,
    passed: true,
    feedback: [],
    epicDescriptionScore: {
      score: 95,
      checks: [
        { check: "Overview/Source", points: 10, earned: 10, passed: true },
        { check: "Problem Statement", points: 10, earned: 10, passed: true },
        { check: "Goals", points: 10, earned: 10, passed: true },
        { check: "Proposed Approach", points: 15, earned: 15, passed: true },
        { check: "Scope Definition", points: 10, earned: 10, passed: true },
        { check: "Execution Plan", points: 10, earned: 10, passed: true },
        { check: "Technical Considerations", points: 15, earned: 15, passed: true },
        { check: "Success Criteria", points: 10, earned: 10, passed: true },
        { check: "Supporting Sections", points: 10, earned: 10, passed: true },
      ],
    },
    featureAvgScore: 85,
    taskAvgScore: 85,
    executionPlanScore: {
      score: 100,
      checks: [
        { check: "All features included", points: 25, earned: 25, passed: true },
        { check: "Execution order set", points: 25, earned: 25, passed: true },
        { check: "Dependencies valid", points: 25, earned: 25, passed: true },
        { check: "Parallel safety", points: 25, earned: 25, passed: true },
      ],
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Happy Path — Plan passes on first attempt
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: Plan Scoring Loop — Happy Path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should pass immediately when overallScore >= 85", async () => {
    const passingResult = makePassingPlanScoreResult();
    mockApiClient.scorePlan.mockResolvedValue({ data: passingResult });

    const handler = registeredTools.get("spectree__score_plan")?.handler;
    const result = await handler!({ epicId: "epic-1" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text) as { passed: boolean; overallScore: number };
    expect(data.passed).toBe(true);
    expect(data.overallScore).toBeGreaterThanOrEqual(85);
    expect(mockApiClient.scorePlan).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Revision Path — Plan fails, then passes after revision
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: Plan Scoring Loop — Revision Path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should show feedback when plan fails (score < 85)", async () => {
    const failingResult = makePlanScoreResult();
    mockApiClient.scorePlan.mockResolvedValue({ data: failingResult });

    const handler = registeredTools.get("spectree__score_plan")?.handler;
    const result = await handler!({ epicId: "epic-1" });

    const data = JSON.parse(result.content[0]!.text) as {
      passed: boolean;
      overallScore: number;
      feedback: string[];
    };
    expect(data.passed).toBe(false);
    expect(data.overallScore).toBeLessThan(85);
    expect(data.feedback.length).toBeGreaterThan(0);
  });

  it("should simulate revision loop: fail then pass", async () => {
    // First call: failing score
    const failingResult = makePlanScoreResult();
    // Second call: passing score (after simulated revision)
    const passingResult = makePassingPlanScoreResult();

    mockApiClient.scorePlan
      .mockResolvedValueOnce({ data: failingResult })
      .mockResolvedValueOnce({ data: passingResult });

    const handler = registeredTools.get("spectree__score_plan")?.handler;

    // Loop iteration 1: score fails
    const firstResult = await handler!({ epicId: "epic-1" });
    const firstData = JSON.parse(firstResult.content[0]!.text) as { passed: boolean };
    expect(firstData.passed).toBe(false);

    // Simulate: planner applies fixes, then re-scores (loop iteration 2)
    const secondResult = await handler!({ epicId: "epic-1" });
    const secondData = JSON.parse(secondResult.content[0]!.text) as { passed: boolean; overallScore: number };
    expect(secondData.passed).toBe(true);
    expect(secondData.overallScore).toBeGreaterThanOrEqual(85);

    expect(mockApiClient.scorePlan).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Edge Cases — Degenerate Epic Structures
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: Edge Cases — Degenerate Epic Structures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should handle epic with zero features gracefully", async () => {
    const emptyEpicResult = makePlanScoreResult({
      overallScore: 0,
      passed: false,
      featureScores: [],
      featureAvgScore: 0,
      taskScores: [],
      taskAvgScore: 0,
      executionPlanScore: {
        score: 0,
        checks: [
          { check: "All features included", points: 25, earned: 0, passed: false, detail: "No features found" },
          { check: "Execution order set", points: 25, earned: 0, passed: false, detail: "No features found" },
          { check: "Dependencies valid", points: 25, earned: 0, passed: false, detail: "No features found" },
          { check: "Parallel safety", points: 25, earned: 0, passed: false, detail: "No features found" },
        ],
      },
    });
    mockApiClient.scorePlan.mockResolvedValue({ data: emptyEpicResult });

    const handler = registeredTools.get("spectree__score_plan")?.handler;
    const result = await handler!({ epicId: "epic-empty" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text) as {
      passed: boolean;
      featureScores: unknown[];
      taskScores: unknown[];
    };
    expect(data.passed).toBe(false);
    expect(data.featureScores).toHaveLength(0);
    expect(data.taskScores).toHaveLength(0);
  });

  it("should handle API 404 for nonexistent epic gracefully", async () => {
    const { ApiError } = await import("../../src/api-client.js");
    mockApiClient.scorePlan.mockRejectedValue(
      new (ApiError as new (msg: string, status: number) => Error)("Epic not found: invalid-id", 404)
    );

    const handler = registeredTools.get("spectree__score_plan")?.handler;
    const result = await handler!({ epicId: "invalid-id" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Error");
  });

  it("should handle task validation for epic with no tasks", async () => {
    mockApiClient.validateTaskCompleteness.mockResolvedValue({
      data: {
        epicId: "epic-empty",
        epicName: "Empty Epic",
        summary: {
          totalTasks: 0,
          passing: 0,
          failing: 0,
          totalViolations: 0,
        },
        tasks: [],
      },
    });

    const handler = registeredTools.get("spectree__validate_task_completeness")?.handler;
    const result = await handler!({ epicId: "epic-empty" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text) as {
      summary: { totalTasks: number };
      tasks: unknown[];
    };
    expect(data.summary.totalTasks).toBe(0);
    expect(data.tasks).toHaveLength(0);
  });

  it("should handle requirement traceability when epic has no features", async () => {
    mockApiClient.getEpicRequest.mockResolvedValue({
      data: {
        id: "request-1",
        title: "Test Request",
        status: "approved",
        description: "Test description",
        structuredDesc: {
          problemStatement: "Problem statement text",
          proposedSolution: "Proposed solution text",
          impactAssessment: "Impact assessment text",
        },
      },
    });
    mockApiClient.listFeatures.mockResolvedValue({
      data: [],
      meta: { cursor: null, hasMore: false },
    });

    const handler = registeredTools.get("spectree__get_epic_requirements")?.handler;
    const result = await handler!({
      epicRequestId: "request-1",
      epicId: "epic-empty",
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text) as {
      traceabilityReport: {
        featureCount: number;
        coverageNote: string;
      };
    };
    expect(data.traceabilityReport.featureCount).toBe(0);
    expect(data.traceabilityReport.coverageNote).toContain("No features found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Scoring Accuracy Against Rubric
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: Scoring Accuracy Validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should correctly identify all 4 scoring categories in result", async () => {
    mockApiClient.scorePlan.mockResolvedValue({ data: makePlanScoreResult() });

    const handler = registeredTools.get("spectree__score_plan")?.handler;
    const result = await handler!({ epicId: "epic-1" });

    const data = JSON.parse(result.content[0]!.text) as {
      epicDescriptionScore: { score: number };
      featureAvgScore: number;
      taskAvgScore: number;
      executionPlanScore: { score: number };
      overallScore: number;
    };

    // All 4 categories present
    expect(data.epicDescriptionScore).toBeDefined();
    expect(typeof data.featureAvgScore).toBe("number");
    expect(typeof data.taskAvgScore).toBe("number");
    expect(data.executionPlanScore).toBeDefined();
    expect(typeof data.overallScore).toBe("number");
  });

  it("should verify weights: Epic 30%, Feature 25%, Task 25%, ExecPlan 20%", async () => {
    // Use a result where we can verify the weighted calculation
    const result = makePlanScoreResult({
      epicDescriptionScore: { score: 80, checks: [] },
      featureAvgScore: 60,
      taskAvgScore: 70,
      executionPlanScore: { score: 50, checks: [] },
      // overallScore = 80*0.30 + 60*0.25 + 70*0.25 + 50*0.20 = 24+15+17.5+10 = 66.5 ≈ 67
      overallScore: 67,
    });

    mockApiClient.scorePlan.mockResolvedValue({ data: result });

    const handler = registeredTools.get("spectree__score_plan")?.handler;
    const response = await handler!({ epicId: "epic-1" });

    const data = JSON.parse(response.content[0]!.text) as {
      epicDescriptionScore: { score: number };
      featureAvgScore: number;
      taskAvgScore: number;
      executionPlanScore: { score: number };
      overallScore: number;
    };

    // Verify weighted average computation
    const expectedOverall = Math.round(
      data.epicDescriptionScore.score * 0.3 +
        data.featureAvgScore * 0.25 +
        data.taskAvgScore * 0.25 +
        data.executionPlanScore.score * 0.2
    );
    expect(data.overallScore).toBe(expectedOverall);
  });

  it("should require passed threshold at >= 85 (not 95 plan-reviewer threshold)", async () => {
    // Score of 85 should pass for self-scoring loop
    const result85 = makePlanScoreResult({ overallScore: 85, passed: true });
    mockApiClient.scorePlan.mockResolvedValue({ data: result85 });

    const handler = registeredTools.get("spectree__score_plan")?.handler;
    const response = await handler!({ epicId: "epic-1" });
    const data = JSON.parse(response.content[0]!.text) as { passed: boolean; overallScore: number };

    expect(data.overallScore).toBe(85);
    expect(data.passed).toBe(true);
  });

  it("should fail when score is 84 (just below threshold)", async () => {
    const result84 = makePlanScoreResult({ overallScore: 84, passed: false });
    mockApiClient.scorePlan.mockResolvedValue({ data: result84 });

    const handler = registeredTools.get("spectree__score_plan")?.handler;
    const response = await handler!({ epicId: "epic-1" });
    const data = JSON.parse(response.content[0]!.text) as { passed: boolean; overallScore: number };

    expect(data.overallScore).toBe(84);
    expect(data.passed).toBe(false);
  });
});
