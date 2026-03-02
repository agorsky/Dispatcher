/**
 * Unit Tests: Merged ProgressState Assembly (ENG-183-3)
 *
 * Verifies that the merged ProgressState correctly combines DB-sourced
 * task/feature counts with event-sourced phase data. This represents
 * the core fix for the ENG-E217 regression where events endpoint
 * showed wrong task counts.
 */

import { describe, it, expect } from "vitest";
import { computePhaseState } from "../../src/services/sessionEventService.js";
import { SessionEventType } from "@dispatcher/shared";
import type { SessionEvent } from "@dispatcher/shared";
import type { ProgressState } from "../../src/services/sessionEventService.js";

// ---------------------------------------------------------------------------
// Helper: assemble merged ProgressState (mirrors the logic in sessions route)
// ---------------------------------------------------------------------------

function assembleMergedProgressState(
  events: SessionEvent[],
  dbProgress: {
    totalFeatures: number;
    completedFeatures: number;
    totalTasks: number;
    completedTasks: number;
  }
): ProgressState {
  const phaseState = computePhaseState(events);

  return {
    ...phaseState,
    totalFeatures: dbProgress.totalFeatures,
    completedFeatures: dbProgress.completedFeatures,
    totalTasks: dbProgress.totalTasks,
    completedTasks: dbProgress.completedTasks,
    progressPercentage:
      dbProgress.totalTasks > 0
        ? Math.round((dbProgress.completedTasks / dbProgress.totalTasks) * 100)
        : dbProgress.totalFeatures > 0
        ? Math.round((dbProgress.completedFeatures / dbProgress.totalFeatures) * 100)
        : 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Merged ProgressState assembly (ENG-183-3)", () => {
  it("uses DB counts over event-derived counts when both are present", () => {
    // Simulate: 2 SESSION_TASK_COMPLETED events but 10 tasks completed in DB
    const events: SessionEvent[] = [
      {
        epicId: "epic-1",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        eventType: SessionEventType.SESSION_TASK_COMPLETED,
        payload: {
          taskId: "t1",
          identifier: "ENG-1-1",
          title: "Task 1",
          featureId: "f1",
          featureIdentifier: "ENG-1",
        },
      },
      {
        epicId: "epic-1",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        eventType: SessionEventType.SESSION_TASK_COMPLETED,
        payload: {
          taskId: "t2",
          identifier: "ENG-1-2",
          title: "Task 2",
          featureId: "f1",
          featureIdentifier: "ENG-1",
        },
      },
    ];

    const dbProgress = {
      totalFeatures: 5,
      completedFeatures: 3,
      totalTasks: 18,
      completedTasks: 10, // DB says 10, not 2 from events
    };

    const result = assembleMergedProgressState(events, dbProgress);

    // DB counts should win over event-derived counts
    expect(result.totalTasks).toBe(18);
    expect(result.completedTasks).toBe(10);
    expect(result.totalFeatures).toBe(5);
    expect(result.completedFeatures).toBe(3);
    expect(result.progressPercentage).toBe(56); // 10/18 = 55.5% -> 56%
  });

  it("preserves phase data from events while using DB counts", () => {
    const events: SessionEvent[] = [
      {
        epicId: "epic-1",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        eventType: SessionEventType.SESSION_PHASE_STARTED,
        payload: {
          phaseNumber: 2,
          totalPhases: 4,
          featureIds: [],
        },
      },
    ];

    const dbProgress = {
      totalFeatures: 8,
      completedFeatures: 4,
      totalTasks: 32,
      completedTasks: 16,
    };

    const result = assembleMergedProgressState(events, dbProgress);

    // Phase data from events
    expect(result.currentPhase).toBe(2);
    expect(result.totalPhases).toBe(4);
    expect(result.lastCompletedPhase).toBeNull();

    // Counts from DB
    expect(result.totalTasks).toBe(32);
    expect(result.completedTasks).toBe(16);
    expect(result.progressPercentage).toBe(50); // 16/32 = 50%
  });

  it("returns correct progress for full completion scenario (18/18)", () => {
    const events: SessionEvent[] = []; // No events at all

    const dbProgress = {
      totalFeatures: 5,
      completedFeatures: 5,
      totalTasks: 18,
      completedTasks: 18,
    };

    const result = assembleMergedProgressState(events, dbProgress);

    expect(result.completedTasks).toBe(18);
    expect(result.totalTasks).toBe(18);
    expect(result.completedFeatures).toBe(5);
    expect(result.totalFeatures).toBe(5);
    expect(result.progressPercentage).toBe(100);
    expect(result.currentPhase).toBeNull();
    expect(result.totalPhases).toBeNull();
  });

  it("falls back to feature-based percentage when no tasks", () => {
    const events: SessionEvent[] = [];

    const dbProgress = {
      totalFeatures: 4,
      completedFeatures: 2,
      totalTasks: 0,
      completedTasks: 0,
    };

    const result = assembleMergedProgressState(events, dbProgress);

    expect(result.progressPercentage).toBe(50); // 2/4 features = 50%
  });

  it("returns 0 progressPercentage when both tasks and features are zero", () => {
    const events: SessionEvent[] = [];

    const dbProgress = {
      totalFeatures: 0,
      completedFeatures: 0,
      totalTasks: 0,
      completedTasks: 0,
    };

    const result = assembleMergedProgressState(events, dbProgress);

    expect(result.progressPercentage).toBe(0);
  });
});
