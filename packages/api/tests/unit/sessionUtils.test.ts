/**
 * Unit Tests: sessionUtils (ENG-162-3)
 *
 * Tests for getActiveSessionForEpic() and emitAutoSessionEvent().
 * Uses vitest mock to isolate from the real database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the prisma client before importing the module under test
// ---------------------------------------------------------------------------
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();

vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    aiSession: {
      findFirst: mockFindFirst,
    },
    sessionEvent: {
      create: mockCreate,
    },
  },
}));

// Import after mocking
const { getActiveSessionForEpic, emitAutoSessionEvent } = await import(
  "../../src/utils/sessionUtils.js"
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getActiveSessionForEpic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session id when an active session exists", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "session-123" });

    const result = await getActiveSessionForEpic("epic-abc");

    expect(result).toEqual({ id: "session-123" });
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { epicId: "epic-abc", status: "active" },
      select: { id: true },
      orderBy: { startedAt: "desc" },
    });
  });

  it("returns null when no active session exists", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    const result = await getActiveSessionForEpic("epic-abc");

    expect(result).toBeNull();
  });

  it("returns null and does not throw when prisma throws", async () => {
    mockFindFirst.mockRejectedValueOnce(new Error("DB connection failed"));

    const result = await getActiveSessionForEpic("epic-abc");

    expect(result).toBeNull();
  });
});

describe("emitAutoSessionEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a session event record when active session exists", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "session-456" });
    mockCreate.mockResolvedValueOnce({});

    await emitAutoSessionEvent("epic-abc", {
      type: "task_status_change",
      payload: { taskId: "task-1", title: "Do the thing" },
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        epicId: "epic-abc",
        sessionId: "session-456",
        eventType: "task_status_change",
        payload: JSON.stringify({ taskId: "task-1", title: "Do the thing" }),
      },
    });
  });

  it("does not create a session event when no active session exists", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await emitAutoSessionEvent("epic-abc", {
      type: "task_status_change",
      payload: { taskId: "task-1" },
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not throw when session event create fails", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "session-789" });
    mockCreate.mockRejectedValueOnce(new Error("Write failed"));

    await expect(
      emitAutoSessionEvent("epic-abc", {
        type: "task_status_change",
        payload: { taskId: "task-1" },
      })
    ).resolves.toBeUndefined();
  });
});
