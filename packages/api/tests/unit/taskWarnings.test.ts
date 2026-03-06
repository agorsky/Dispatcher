/**
 * Unit Tests: Task Warning Generation (ENG-E1)
 *
 * Tests generateTaskWarnings() for structuredDesc completeness warnings.
 */

import { describe, it, expect } from "vitest";
import { generateTaskWarnings } from "../../src/services/taskService.js";

// Helper to create a minimal task object for testing
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-id",
    featureId: "feat-id",
    identifier: "ENG-1-1",
    title: "Test task",
    description: null,
    statusId: null,
    assigneeId: null,
    sortOrder: 1,
    createdBy: "user-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    implementedBy: null,
    implementedDate: null,
    executionOrder: null,
    canParallelize: null,
    parallelGroup: null,
    dependencies: null,
    estimatedComplexity: null,
    aiContext: null,
    aiNotes: null,
    lastAiSessionId: null,
    lastAiUpdateAt: null,
    startedAt: null,
    completedAt: null,
    durationMinutes: null,
    percentComplete: null,
    blockerReason: null,
    structuredDesc: null,
    relatedFiles: null,
    relatedFunctions: null,
    gitBranch: null,
    gitCommits: null,
    gitPrNumber: null,
    gitPrUrl: null,
    ...overrides,
  } as never;
}

describe("generateTaskWarnings", () => {
  it("returns warning when structuredDesc is null", () => {
    const task = makeTask({ structuredDesc: null });
    const warnings = generateTaskWarnings(task);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("missing structuredDesc");
  });

  it("returns warning when aiInstructions is missing", () => {
    const task = makeTask({
      structuredDesc: JSON.stringify({
        summary: "Test summary",
        acceptanceCriteria: ["criterion 1"],
      }),
    });
    const warnings = generateTaskWarnings(task);
    expect(warnings.some((w: string) => w.includes("aiInstructions"))).toBe(true);
  });

  it("returns warning when acceptanceCriteria is missing", () => {
    const task = makeTask({
      structuredDesc: JSON.stringify({
        summary: "Test summary",
        aiInstructions: "Step 1: do X",
      }),
    });
    const warnings = generateTaskWarnings(task);
    expect(warnings.some((w: string) => w.includes("acceptanceCriteria"))).toBe(true);
  });

  it("returns empty warnings when structuredDesc is complete", () => {
    const task = makeTask({
      structuredDesc: JSON.stringify({
        summary: "Test summary",
        aiInstructions: "Step 1: do X",
        acceptanceCriteria: ["criterion 1", "criterion 2"],
      }),
    });
    const warnings = generateTaskWarnings(task);
    expect(warnings).toHaveLength(0);
  });

  it("returns warning for invalid JSON structuredDesc", () => {
    const task = makeTask({ structuredDesc: "not valid json{" });
    const warnings = generateTaskWarnings(task);
    expect(warnings.some((w: string) => w.includes("could not be parsed"))).toBe(true);
  });
});
