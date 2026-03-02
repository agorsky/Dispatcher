/**
 * Unit Tests: Feature Status Change Auto-Instrumentation Hook (ENG-164-3)
 *
 * Tests that updateFeature() emits session events with correct payloads
 * and includes task progress summary on feature completion.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock prisma and epicService before importing
// ---------------------------------------------------------------------------
const mockFeatureFindFirst = vi.fn();
const mockFeatureFindUnique = vi.fn();
const mockFeatureUpdate = vi.fn();
const mockTaskCount = vi.fn();
const mockStatusFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockEmitSessionEventToEpic = vi.fn().mockResolvedValue(undefined);
const mockCheckEpicCompletion = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    feature: {
      findFirst: mockFeatureFindFirst,
      findUnique: mockFeatureFindUnique,
      update: mockFeatureUpdate,
    },
    status: {
      findUnique: mockStatusFindUnique,
    },
    task: {
      count: mockTaskCount,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

vi.mock("../../src/services/epicService.js", () => ({
  emitSessionEventToEpic: mockEmitSessionEventToEpic,
  checkEpicCompletion: mockCheckEpicCompletion,
  triggerBarneyAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/events/index.js", () => ({
  emitEntityUpdated: vi.fn(),
  emitEntityDeleted: vi.fn(),
  emitStatusChanged: vi.fn(),
}));

vi.mock("../../src/services/changelogService.js", () => ({
  diffAndRecord: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: "feature-uuid-1",
    identifier: "ENG-162",
    title: "Active Session Lookup",
    statusId: "status-backlog",
    epicId: "epic-uuid-1",
    teamId: "team-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("feature status change hook — completion progress summary (ENG-164-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes completedTaskCount and totalTaskCount when feature is completed", async () => {
    const existingFeature = makeFeature({ statusId: "status-backlog" });
    const updatedFeature = makeFeature({ statusId: "status-done" });

    mockFeatureFindFirst.mockResolvedValue(existingFeature);
    mockFeatureFindUnique.mockResolvedValue(existingFeature); // beforeSnapshot
    mockStatusFindUnique
      .mockResolvedValueOnce({ id: "status-done", teamId: "team-1" }) // status verify
      .mockResolvedValueOnce({ category: "completed" });              // newStatusInfo
    mockFeatureUpdate.mockResolvedValue(updatedFeature);
    // totalTaskCount=4, completedTaskCount=4 (all tasks done)
    mockTaskCount
      .mockResolvedValueOnce(4) // total
      .mockResolvedValueOnce(4); // completed

    const { updateFeature } = await import("../../src/services/featureService.js");
    await updateFeature("feature-uuid-1", { statusId: "status-done" });

    expect(mockEmitSessionEventToEpic).toHaveBeenCalledWith(
      "epic-uuid-1",
      expect.objectContaining({
        type: "feature_status_change",
        payload: expect.objectContaining({
          featureId: "feature-uuid-1",
          newStatusId: "status-done",
          previousStatusId: "status-backlog",
          completedTaskCount: 4,
          totalTaskCount: 4,
        }),
      })
    );
    expect(mockCheckEpicCompletion).toHaveBeenCalledWith("epic-uuid-1");
  });

  it("does not include progress summary when feature is not completed", async () => {
    const existingFeature = makeFeature({ statusId: "status-backlog" });
    const updatedFeature = makeFeature({ statusId: "status-in-progress" });

    mockFeatureFindFirst.mockResolvedValue(existingFeature);
    mockFeatureFindUnique.mockResolvedValue(existingFeature);
    mockStatusFindUnique
      .mockResolvedValueOnce({ id: "status-in-progress", teamId: "team-1" })
      .mockResolvedValueOnce({ category: "started" });
    mockFeatureUpdate.mockResolvedValue(updatedFeature);

    const { updateFeature } = await import("../../src/services/featureService.js");
    await updateFeature("feature-uuid-1", { statusId: "status-in-progress" });

    expect(mockEmitSessionEventToEpic).toHaveBeenCalledWith(
      "epic-uuid-1",
      expect.objectContaining({
        payload: expect.not.objectContaining({
          completedTaskCount: expect.anything(),
        }),
      })
    );
    expect(mockTaskCount).not.toHaveBeenCalled();
  });

  it("still fires checkEpicCompletion even when feature is not completed", async () => {
    const existingFeature = makeFeature({ statusId: "status-backlog" });
    const updatedFeature = makeFeature({ statusId: "status-in-progress" });

    mockFeatureFindFirst.mockResolvedValue(existingFeature);
    mockFeatureFindUnique.mockResolvedValue(existingFeature);
    mockStatusFindUnique
      .mockResolvedValueOnce({ id: "status-in-progress", teamId: "team-1" })
      .mockResolvedValueOnce({ category: "started" });
    mockFeatureUpdate.mockResolvedValue(updatedFeature);

    const { updateFeature } = await import("../../src/services/featureService.js");
    await updateFeature("feature-uuid-1", { statusId: "status-in-progress" });

    expect(mockCheckEpicCompletion).toHaveBeenCalledWith("epic-uuid-1");
  });
});
