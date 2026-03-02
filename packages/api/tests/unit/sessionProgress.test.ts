/**
 * Unit Tests: Session Progress Live Derivation (ENG-165-3)
 *
 * Tests that computeSessionProgress() derives accurate progress from DB state,
 * and that getSession() includes liveProgress in its response.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock prisma before importing
// ---------------------------------------------------------------------------
const mockSessionFindUnique = vi.fn();
const mockFeatureFindMany = vi.fn();

vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    aiSession: {
      findUnique: mockSessionFindUnique,
    },
    feature: {
      findMany: mockFeatureFindMany,
    },
  },
}));

vi.mock("../../src/services/debriefService.js", () => ({
  extractDebrief: vi.fn(),
  storeDebrief: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/services/pipelineService.js", () => ({
  transitionTo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/events/index.js", () => ({
  emitSessionEvent: vi.fn(),
}));

// Import after mocking
const { computeSessionProgress, getSession } = await import(
  "../../src/services/sessionService.js"
);

// ---------------------------------------------------------------------------
// Tests: computeSessionProgress
// ---------------------------------------------------------------------------

describe("computeSessionProgress (ENG-165-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns accurate counts when tasks have mixed statuses", async () => {
    mockFeatureFindMany.mockResolvedValueOnce([
      {
        id: "f1",
        status: { category: "completed" },
        tasks: [
          { id: "t1", status: { category: "completed" } },
          { id: "t2", status: { category: "completed" } },
          { id: "t3", status: { category: "completed" } },
        ],
      },
      {
        id: "f2",
        status: { category: "started" },
        tasks: [
          { id: "t4", status: { category: "completed" } },
          { id: "t5", status: { category: "started" } },
          { id: "t6", status: { category: "unstarted" } },
        ],
      },
      {
        id: "f3",
        status: { category: "unstarted" },
        tasks: [
          { id: "t7", status: { category: "unstarted" } },
        ],
      },
    ]);

    const result = await computeSessionProgress("epic-uuid-1");

    expect(result).toEqual({
      totalFeatures: 3,
      completedFeatures: 1,
      totalTasks: 7,
      completedTasks: 4,
    });
  });

  it("returns zeros for an epic with no features", async () => {
    mockFeatureFindMany.mockResolvedValueOnce([]);

    const result = await computeSessionProgress("epic-uuid-empty");

    expect(result).toEqual({
      totalFeatures: 0,
      completedFeatures: 0,
      totalTasks: 0,
      completedTasks: 0,
    });
  });

  it("counts tasks with null status as not completed", async () => {
    mockFeatureFindMany.mockResolvedValueOnce([
      {
        id: "f1",
        status: null, // no status set
        tasks: [
          { id: "t1", status: null },
          { id: "t2", status: { category: "completed" } },
        ],
      },
    ]);

    const result = await computeSessionProgress("epic-uuid-1");

    expect(result).toEqual({
      totalFeatures: 1,
      completedFeatures: 0,
      totalTasks: 2,
      completedTasks: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: getSession with liveProgress
// ---------------------------------------------------------------------------

describe("getSession — includes liveProgress (ENG-165-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes liveProgress in the session response", async () => {
    mockSessionFindUnique.mockResolvedValueOnce({
      id: "session-123",
      epicId: "epic-uuid-1",
      epic: { name: "Test Epic" },
      externalId: "bobby-test",
      startedAt: new Date("2026-03-01T10:00:00Z"),
      endedAt: null,
      status: "active",
      itemsWorkedOn: null,
      summary: null,
      nextSteps: null,
      blockers: null,
      decisions: null,
      contextBlob: null,
      createdAt: new Date("2026-03-01T10:00:00Z"),
      updatedAt: new Date("2026-03-01T10:00:00Z"),
    });

    mockFeatureFindMany.mockResolvedValueOnce([
      {
        id: "f1",
        status: { category: "completed" },
        tasks: [
          { id: "t1", status: { category: "completed" } },
          { id: "t2", status: { category: "completed" } },
        ],
      },
      {
        id: "f2",
        status: { category: "started" },
        tasks: [
          { id: "t3", status: { category: "started" } },
        ],
      },
    ]);

    const result = await getSession("session-123");

    expect(result.liveProgress).toEqual({
      totalFeatures: 2,
      completedFeatures: 1,
      totalTasks: 3,
      completedTasks: 2,
    });
    expect(result.id).toBe("session-123");
    expect(result.epicId).toBe("epic-uuid-1");
  });
});
