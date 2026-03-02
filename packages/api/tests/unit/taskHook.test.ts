/**
 * Unit Tests: Task Status Change Auto-Instrumentation Hook (ENG-163-4)
 *
 * Tests that updateTask() emits session events with correct payloads
 * and includes progress summary on task completion.
 *
 * These are integration-style tests against the task hook logic.
 * The prisma client is mocked so no real database is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock prisma and epicService before importing
// ---------------------------------------------------------------------------
const mockTaskFindFirst = vi.fn();
const mockTaskFindUnique = vi.fn();
const mockTaskUpdate = vi.fn();
const mockTaskCount = vi.fn();
const mockStatusFindUnique = vi.fn();
const mockSessionFindFirst = vi.fn();
const mockEmitSessionEventToEpic = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    task: {
      findFirst: mockTaskFindFirst,
      findUnique: mockTaskFindUnique,
      update: mockTaskUpdate,
      count: mockTaskCount,
    },
    status: {
      findUnique: mockStatusFindUnique,
    },
    aiSession: {
      findFirst: mockSessionFindFirst,
    },
  },
}));

vi.mock("../../src/services/epicService.js", () => ({
  emitSessionEventToEpic: mockEmitSessionEventToEpic,
  triggerBarneyAudit: vi.fn().mockResolvedValue(undefined),
  checkEpicCompletion: vi.fn().mockResolvedValue(undefined),
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

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-uuid-1",
    identifier: "ENG-1-1",
    title: "Build the feature",
    statusId: "status-backlog",
    featureId: "feature-uuid-1",
    remediationCaseId: null,
    durationMinutes: null,
    completedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("task status change hook — completion progress summary (ENG-163-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes completedTaskCount and totalTaskCount when task is completed", async () => {
    const existingTask = makeTask({ statusId: "status-backlog" });
    const updatedTask = makeTask({ statusId: "status-done", completedAt: new Date() });

    // Task lookup (resolve existing)
    mockTaskFindFirst.mockResolvedValue(existingTask);
    // Before snapshot
    mockTaskFindUnique
      .mockResolvedValueOnce(existingTask) // beforeSnapshot
      .mockResolvedValueOnce({             // taskWithFeature (epicId lookup)
        feature: { epicId: "epic-uuid-1" },
        remediationCase: null,
      });
    // Status verify
    mockStatusFindUnique
      .mockResolvedValueOnce({ id: "status-done", teamId: "team-1" }) // status verify
      .mockResolvedValueOnce({ category: "completed" });              // newStatusInfo (hook)
    // Prisma update
    mockTaskUpdate.mockResolvedValue(updatedTask);
    // Task count queries: totalTaskCount=5, completedTaskCount=3
    mockTaskCount
      .mockResolvedValueOnce(5)  // totalTaskCount
      .mockResolvedValueOnce(3); // completedTaskCount (after this task completed = 3 including itself)

    const { updateTask } = await import("../../src/services/taskService.js");
    await updateTask("task-uuid-1", { statusId: "status-done" });

    // Verify the session event was emitted with progress summary
    expect(mockEmitSessionEventToEpic).toHaveBeenCalledWith(
      "epic-uuid-1",
      expect.objectContaining({
        type: "task_status_change",
        payload: expect.objectContaining({
          taskId: "task-uuid-1",
          newStatusId: "status-done",
          previousStatusId: "status-backlog",
          completedTaskCount: 3,
          totalTaskCount: 5,
        }),
      })
    );
  });

  it("does not include progress summary when task is not completed", async () => {
    const existingTask = makeTask({ statusId: "status-backlog" });
    const updatedTask = makeTask({ statusId: "status-in-progress" });

    mockTaskFindFirst.mockResolvedValue(existingTask);
    mockTaskFindUnique
      .mockResolvedValueOnce(existingTask)
      .mockResolvedValueOnce({
        feature: { epicId: "epic-uuid-1" },
        remediationCase: null,
      });
    mockStatusFindUnique
      .mockResolvedValueOnce({ id: "status-in-progress", teamId: "team-1" })
      .mockResolvedValueOnce({ category: "started" }); // not completed
    mockTaskUpdate.mockResolvedValue(updatedTask);

    const { updateTask } = await import("../../src/services/taskService.js");
    await updateTask("task-uuid-1", { statusId: "status-in-progress" });

    expect(mockEmitSessionEventToEpic).toHaveBeenCalledWith(
      "epic-uuid-1",
      expect.objectContaining({
        payload: expect.not.objectContaining({
          completedTaskCount: expect.anything(),
        }),
      })
    );
    // count should not be called for non-completion status
    expect(mockTaskCount).not.toHaveBeenCalled();
  });

  it("does not emit session event when status is unchanged", async () => {
    const existingTask = makeTask({ statusId: "status-backlog" });
    mockTaskFindFirst.mockResolvedValue(existingTask);
    mockTaskFindUnique
      .mockResolvedValueOnce(existingTask)
      .mockResolvedValueOnce({
        feature: { epicId: "epic-uuid-1" },
        remediationCase: null,
      });
    mockTaskUpdate.mockResolvedValue(existingTask);

    const { updateTask } = await import("../../src/services/taskService.js");
    // Pass same statusId as existing — no change
    await updateTask("task-uuid-1", { statusId: "status-backlog" });

    expect(mockEmitSessionEventToEpic).not.toHaveBeenCalled();
  });
});
