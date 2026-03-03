/**
 * MCP Plan Scoring Tool Tests (ENG-E219)
 *
 * Unit tests for spectree__score_plan and spectree__validate_task_completeness
 * MCP tools. Verifies correct API client delegation and response formatting.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

const { mockApiClient } = vi.hoisted(() => {
  const mockApiClient = {
    scorePlan: vi.fn(),
    validateTaskCompleteness: vi.fn(),
    getEpicRequest: vi.fn(),
    listFeatures: vi.fn(),
  };
  return { mockApiClient };
});

vi.mock("../src/api-client.js", () => ({
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

const registeredTools = new Map<string, { config: unknown; handler: (input: unknown) => Promise<ToolResponse> }>();

const mockServer = {
  registerTool: (
    name: string,
    config: unknown,
    handler: (input: unknown) => Promise<ToolResponse>
  ) => {
    registeredTools.set(name, { config, handler });
  },
};

import { registerPlanScoringTools } from "../src/tools/plan-scoring.js";
import { registerPlanRequirementTools } from "../src/tools/plan-requirements.js";

beforeAll(() => {
  registerPlanScoringTools(mockServer as never);
  registerPlanRequirementTools(mockServer as never);
});

// ─────────────────────────────────────────────────────────────────────────────
// spectree__score_plan
// ─────────────────────────────────────────────────────────────────────────────

describe("spectree__score_plan", () => {
  beforeEach(() => vi.clearAllMocks());

  const getHandler = () => registeredTools.get("spectree__score_plan")?.handler;

  const MOCK_SCORE_RESULT = {
    epicId: "epic-1",
    epicName: "Test Epic",
    overallScore: 90,
    passed: true,
    epicDescriptionScore: { score: 95, checks: [] },
    featureScores: [],
    featureAvgScore: 0,
    taskScores: [],
    taskAvgScore: 0,
    executionPlanScore: { score: 100, checks: [] },
    feedback: [],
  };

  it("should be registered", () => {
    expect(registeredTools.has("spectree__score_plan")).toBe(true);
  });

  it("should call scorePlan with the provided epicId", async () => {
    mockApiClient.scorePlan.mockResolvedValue({ data: MOCK_SCORE_RESULT });

    const handler = getHandler();
    await handler!({ epicId: "epic-1" });

    expect(mockApiClient.scorePlan).toHaveBeenCalledWith("epic-1");
  });

  it("should return score data on success", async () => {
    mockApiClient.scorePlan.mockResolvedValue({ data: MOCK_SCORE_RESULT });

    const handler = getHandler();
    const result = await handler!({ epicId: "epic-1" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text) as typeof MOCK_SCORE_RESULT;
    expect(data.overallScore).toBe(90);
    expect(data.passed).toBe(true);
  });

  it("should return error response when API fails", async () => {
    const { ApiError } = await import("../src/api-client.js");
    mockApiClient.scorePlan.mockRejectedValue(
      new (ApiError as new (msg: string, status: number) => Error)("Epic not found", 404)
    );

    const handler = getHandler();
    const result = await handler!({ epicId: "nonexistent" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Error");
  });

  it("should have a description", () => {
    const tool = registeredTools.get("spectree__score_plan");
    expect(typeof (tool!.config as { description: string }).description).toBe("string");
    expect((tool!.config as { description: string }).description.length).toBeGreaterThan(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// spectree__validate_task_completeness
// ─────────────────────────────────────────────────────────────────────────────

describe("spectree__validate_task_completeness", () => {
  beforeEach(() => vi.clearAllMocks());

  const getHandler = () =>
    registeredTools.get("spectree__validate_task_completeness")?.handler;

  const MOCK_VALIDATION_RESULT = {
    epicId: "epic-1",
    epicName: "Test Epic",
    summary: {
      totalTasks: 5,
      passing: 4,
      failing: 1,
      totalViolations: 2,
    },
    tasks: [
      {
        taskId: "task-1",
        taskIdentifier: "ENG-186-1",
        title: "Implement plan scoring service",
        featureIdentifier: "ENG-186",
        passed: true,
        violations: [],
      },
    ],
  };

  it("should be registered", () => {
    expect(registeredTools.has("spectree__validate_task_completeness")).toBe(true);
  });

  it("should call validateTaskCompleteness with epicId", async () => {
    mockApiClient.validateTaskCompleteness.mockResolvedValue({
      data: MOCK_VALIDATION_RESULT,
    });

    const handler = getHandler();
    await handler!({ epicId: "epic-1" });

    expect(mockApiClient.validateTaskCompleteness).toHaveBeenCalledWith("epic-1");
  });

  it("should return validation report on success", async () => {
    mockApiClient.validateTaskCompleteness.mockResolvedValue({
      data: MOCK_VALIDATION_RESULT,
    });

    const handler = getHandler();
    const result = await handler!({ epicId: "epic-1" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text) as typeof MOCK_VALIDATION_RESULT;
    expect(data.summary.totalTasks).toBe(5);
    expect(data.summary.passing).toBe(4);
    expect(data.summary.failing).toBe(1);
  });

  it("should return error response when API fails", async () => {
    const { ApiError } = await import("../src/api-client.js");
    mockApiClient.validateTaskCompleteness.mockRejectedValue(
      new (ApiError as new (msg: string, status: number) => Error)("Epic not found", 404)
    );

    const handler = getHandler();
    const result = await handler!({ epicId: "nonexistent" });

    expect(result.isError).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// spectree__get_epic_requirements
// ─────────────────────────────────────────────────────────────────────────────

describe("spectree__get_epic_requirements", () => {
  beforeEach(() => vi.clearAllMocks());

  const getHandler = () =>
    registeredTools.get("spectree__get_epic_requirements")?.handler;

  const MOCK_EPIC_REQUEST = {
    id: "request-1",
    title: "Plan Scoring System",
    status: "approved",
    description: "We need a deterministic plan scoring system.",
    structuredDesc: {
      problemStatement: "Manual scoring is non-deterministic and produces inconsistent results.",
      proposedSolution: "Server-side deterministic scoring service with MCP tool integration.",
      impactAssessment: "Improves planner quality and reduces review time.",
      targetAudience: "Planner agents",
      successMetrics: "All plans score >= 85 before execution.",
      alternatives: "LLM-computed scoring was rejected.",
      dependencies: null,
      estimatedEffort: "medium",
    },
  };

  it("should be registered", () => {
    expect(registeredTools.has("spectree__get_epic_requirements")).toBe(true);
  });

  it("should fetch and return epic request structured fields", async () => {
    mockApiClient.getEpicRequest.mockResolvedValue({ data: MOCK_EPIC_REQUEST });

    const handler = getHandler();
    const result = await handler!({ epicRequestId: "request-1" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text) as {
      epicRequestId: string;
      structuredFields: {
        problemStatement: string;
        proposedSolution: string;
      };
    };
    expect(data.epicRequestId).toBe("request-1");
    expect(data.structuredFields.problemStatement).toContain("non-deterministic");
  });

  it("should include traceability report when epicId provided", async () => {
    mockApiClient.getEpicRequest.mockResolvedValue({ data: MOCK_EPIC_REQUEST });
    mockApiClient.listFeatures.mockResolvedValue({
      data: [
        {
          id: "feature-1",
          identifier: "ENG-186",
          title: "Score Plan Tool",
          _count: { tasks: 4 },
        },
      ],
      meta: { cursor: null, hasMore: false },
    });

    const handler = getHandler();
    const result = await handler!({
      epicRequestId: "request-1",
      epicId: "epic-1",
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text) as {
      traceabilityReport: {
        epicId: string;
        featureCount: number;
        features: unknown[];
      };
    };
    expect(data.traceabilityReport).toBeDefined();
    expect(data.traceabilityReport.epicId).toBe("epic-1");
    expect(data.traceabilityReport.featureCount).toBe(1);
  });

  it("should return error for invalid epicRequestId", async () => {
    const { ApiError } = await import("../src/api-client.js");
    mockApiClient.getEpicRequest.mockRejectedValue(
      new (ApiError as new (msg: string, status: number) => Error)("Epic request not found", 404)
    );

    const handler = getHandler();
    const result = await handler!({ epicRequestId: "nonexistent" });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Error");
  });

  it("should return null structuredFields when epic request has no structuredDesc", async () => {
    mockApiClient.getEpicRequest.mockResolvedValue({
      data: { ...MOCK_EPIC_REQUEST, structuredDesc: null },
    });

    const handler = getHandler();
    const result = await handler!({ epicRequestId: "request-1" });

    const data = JSON.parse(result.content[0]!.text) as { structuredFields: null };
    expect(data.structuredFields).toBeNull();
  });
});
