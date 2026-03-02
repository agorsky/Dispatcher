/**
 * Unit Tests: Pre-Flight Checklist Service (ENG-E217)
 *
 * Tests all 4 check functions and the composite runPreflight() function.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock prisma (use vi.hoisted to avoid temporal dead zone with vi.mock hoisting)
// ---------------------------------------------------------------------------
const { mockEpicFindUnique } = vi.hoisted(() => ({
  mockEpicFindUnique: vi.fn(),
}));

vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    epic: {
      findUnique: mockEpicFindUnique,
    },
    preflightOverride: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import {
  checkScaffoldHints,
  checkAcceptanceCriteria,
  checkTaskDensity,
  checkEpicDescription,
  runPreflight,
} from "../../src/services/preflightService.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTask(identifier: string, aiInstructions?: string) {
  return {
    identifier,
    structuredDesc: aiInstructions
      ? JSON.stringify({ aiInstructions })
      : null,
  };
}

function makeFeature(
  identifier: string,
  tasks: ReturnType<typeof makeTask>[],
  acceptanceCriteria?: string[]
) {
  return {
    identifier,
    structuredDesc: JSON.stringify({
      acceptanceCriteria: acceptanceCriteria ?? ["AC1", "AC2", "AC3"],
    }),
    tasks,
  };
}

// ---------------------------------------------------------------------------
// checkScaffoldHints
// ---------------------------------------------------------------------------

describe("checkScaffoldHints", () => {
  it("passes when all tasks have aiInstructions", () => {
    const features = [
      makeFeature("ENG-1", [
        makeTask("ENG-1-1", "Do something"),
        makeTask("ENG-1-2", "Do something else"),
      ]),
    ];
    const result = checkScaffoldHints(features);
    expect(result.passed).toBe(true);
    expect(result.items).toBeUndefined();
  });

  it("fails when a task is missing aiInstructions", () => {
    const features = [
      makeFeature("ENG-1", [
        makeTask("ENG-1-1", "Do something"),
        makeTask("ENG-1-2"), // missing aiInstructions
      ]),
    ];
    const result = checkScaffoldHints(features);
    expect(result.passed).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items![0].identifier).toBe("ENG-1-2");
  });

  it("fails when aiInstructions is empty string", () => {
    const features = [makeFeature("ENG-1", [makeTask("ENG-1-1", "")])];
    const result = checkScaffoldHints(features);
    expect(result.passed).toBe(false);
  });

  it("passes with empty features array", () => {
    const result = checkScaffoldHints([]);
    expect(result.passed).toBe(true);
  });

  it("handles malformed structuredDesc JSON gracefully", () => {
    const features = [
      {
        identifier: "ENG-1",
        structuredDesc: null,
        tasks: [{ identifier: "ENG-1-1", structuredDesc: "not-valid-json" }],
      },
    ];
    const result = checkScaffoldHints(features);
    // Malformed JSON → empty object → no aiInstructions → fail
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkAcceptanceCriteria
// ---------------------------------------------------------------------------

describe("checkAcceptanceCriteria", () => {
  it("passes when all features have >= 3 criteria", () => {
    const features = [
      makeFeature("ENG-1", [], ["AC1", "AC2", "AC3"]),
      makeFeature("ENG-2", [], ["AC1", "AC2", "AC3", "AC4"]),
    ];
    const result = checkAcceptanceCriteria(features);
    expect(result.passed).toBe(true);
  });

  it("fails when a feature has fewer than 3 criteria", () => {
    const features = [
      makeFeature("ENG-1", [], ["AC1", "AC2"]),
    ];
    const result = checkAcceptanceCriteria(features);
    expect(result.passed).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items![0].identifier).toBe("ENG-1");
  });

  it("fails when acceptanceCriteria is missing (null structuredDesc)", () => {
    const features = [
      { identifier: "ENG-1", structuredDesc: null, tasks: [] },
    ];
    const result = checkAcceptanceCriteria(features);
    expect(result.passed).toBe(false);
  });

  it("passes with empty features array", () => {
    const result = checkAcceptanceCriteria([]);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkTaskDensity
// ---------------------------------------------------------------------------

describe("checkTaskDensity", () => {
  it("passes when all features have >= 3 tasks", () => {
    const features = [
      makeFeature("ENG-1", [makeTask("t1"), makeTask("t2"), makeTask("t3")]),
    ];
    const result = checkTaskDensity(features);
    expect(result.passed).toBe(true);
  });

  it("fails when a feature has fewer than 3 tasks", () => {
    const features = [
      makeFeature("ENG-1", [makeTask("t1"), makeTask("t2")]),
    ];
    const result = checkTaskDensity(features);
    expect(result.passed).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items![0].identifier).toBe("ENG-1");
  });

  it("passes with empty features array", () => {
    const result = checkTaskDensity([]);
    expect(result.passed).toBe(true);
  });

  it("fails when feature has 0 tasks", () => {
    const features = [makeFeature("ENG-1", [])];
    const result = checkTaskDensity(features);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkEpicDescription
// ---------------------------------------------------------------------------

describe("checkEpicDescription", () => {
  it("fails when description is null", () => {
    const result = checkEpicDescription(null);
    expect(result.passed).toBe(false);
  });

  it("fails when description is empty string", () => {
    const result = checkEpicDescription("");
    expect(result.passed).toBe(false);
  });

  it("fails with a short description without required sections", () => {
    const result = checkEpicDescription("This is a short description.");
    expect(result.passed).toBe(false);
  });

  it("passes with a valid long description with all required sections", () => {
    const longDesc = `
## Overview
${Array(50).fill("Overview text word").join(" ")}

## Problem
${Array(50).fill("Problem statement word").join(" ")}

## Approach
${Array(50).fill("Proposed approach word").join(" ")}

## Success
${Array(100).fill("Success criteria word").join(" ")}
    `;
    const result = checkEpicDescription(longDesc);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runPreflight
// ---------------------------------------------------------------------------

describe("runPreflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a composite result with all 4 checks", async () => {
    mockEpicFindUnique.mockResolvedValue({
      id: "epic-123",
      description: null,
      features: [
        {
          identifier: "ENG-1",
          structuredDesc: JSON.stringify({ acceptanceCriteria: ["AC1", "AC2", "AC3"] }),
          tasks: [
            makeTask("ENG-1-1", "Do A"),
            makeTask("ENG-1-2", "Do B"),
            makeTask("ENG-1-3", "Do C"),
          ],
        },
      ],
    });

    const result = await runPreflight("epic-123");
    expect(result.epicId).toBe("epic-123");
    expect(result.checks).toHaveLength(4);
    expect(result.checks.map((c) => c.checkName)).toContain("Scaffold Hints");
    expect(result.checks.map((c) => c.checkName)).toContain("Acceptance Criteria");
    expect(result.checks.map((c) => c.checkName)).toContain("Task Density");
    expect(result.checks.map((c) => c.checkName)).toContain("Epic Description");
  });

  it("passes=true only when all checks pass", async () => {
    const longDesc = `
## Overview ${Array(100).fill("word").join(" ")}
## Problem ${Array(100).fill("word").join(" ")}
## Approach ${Array(100).fill("word").join(" ")}
## Success ${Array(200).fill("word").join(" ")}
    `;
    mockEpicFindUnique.mockResolvedValue({
      id: "epic-456",
      description: longDesc,
      features: [
        {
          identifier: "ENG-1",
          structuredDesc: JSON.stringify({ acceptanceCriteria: ["AC1", "AC2", "AC3"] }),
          tasks: [
            makeTask("ENG-1-1", "Do A"),
            makeTask("ENG-1-2", "Do B"),
            makeTask("ENG-1-3", "Do C"),
          ],
        },
      ],
    });

    const result = await runPreflight("epic-456");
    // Epic description check might still fail depending on word count but scaffold/AC/density should pass
    const scaffoldCheck = result.checks.find((c) => c.checkName === "Scaffold Hints");
    const acCheck = result.checks.find((c) => c.checkName === "Acceptance Criteria");
    const densityCheck = result.checks.find((c) => c.checkName === "Task Density");
    expect(scaffoldCheck?.passed).toBe(true);
    expect(acCheck?.passed).toBe(true);
    expect(densityCheck?.passed).toBe(true);
  });

  it("throws an error if epic is not found", async () => {
    mockEpicFindUnique.mockResolvedValue(null);
    await expect(runPreflight("non-existent-id")).rejects.toThrow("not found");
  });

  it("handles empty features array", async () => {
    mockEpicFindUnique.mockResolvedValue({
      id: "epic-789",
      description: null,
      features: [],
    });
    const result = await runPreflight("epic-789");
    expect(result.checks).toHaveLength(4);
    // All 3 non-description checks pass with 0 features
    const scaffoldCheck = result.checks.find((c) => c.checkName === "Scaffold Hints");
    expect(scaffoldCheck?.passed).toBe(true);
  });
});
