/**
 * Unit Tests: computePhaseState (ENG-183)
 *
 * Tests the phase-only computePhaseState function extracted from
 * computeProgressState as part of the ENG-E218 DB-state fix.
 */

import { describe, it, expect } from "vitest";
import { computePhaseState } from "../../src/services/sessionEventService.js";
import { SessionEventType } from "@dispatcher/shared";
import type { SessionEvent } from "@dispatcher/shared";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePhaseStartedEvent(phaseNumber: number, totalPhases: number): SessionEvent {
  return {
    epicId: "epic-1",
    sessionId: "session-1",
    timestamp: new Date().toISOString(),
    eventType: SessionEventType.SESSION_PHASE_STARTED,
    payload: {
      phaseNumber,
      totalPhases,
      featureIds: [],
    },
  };
}

function makePhaseCompletedEvent(phaseNumber: number, totalPhases: number): SessionEvent {
  return {
    epicId: "epic-1",
    sessionId: "session-1",
    timestamp: new Date().toISOString(),
    eventType: SessionEventType.SESSION_PHASE_COMPLETED,
    payload: {
      phaseNumber,
      totalPhases,
      featureIds: [],
    },
  };
}

function makeSessionStartedEvent(totalPhases?: number): SessionEvent {
  return {
    epicId: "epic-1",
    sessionId: "session-1",
    timestamp: new Date().toISOString(),
    eventType: SessionEventType.SESSION_STARTED,
    payload: {
      status: "active",
      totalFeatures: 3,
      totalTasks: 9,
      ...(totalPhases !== undefined ? { executionPlan: [] } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computePhaseState (ENG-183-1)", () => {
  it("returns null phase state for empty events array", () => {
    const result = computePhaseState([]);

    expect(result).toEqual({
      currentPhase: null,
      lastCompletedPhase: null,
      totalPhases: null,
    });
  });

  it("extracts currentPhase from SESSION_PHASE_STARTED event", () => {
    const events: SessionEvent[] = [
      makePhaseStartedEvent(1, 3),
    ];

    const result = computePhaseState(events);

    expect(result.currentPhase).toBe(1);
    expect(result.totalPhases).toBe(3);
    expect(result.lastCompletedPhase).toBeNull();
  });

  it("sets lastCompletedPhase and clears currentPhase on SESSION_PHASE_COMPLETED", () => {
    const events: SessionEvent[] = [
      makePhaseStartedEvent(1, 3),
      makePhaseCompletedEvent(1, 3),
    ];

    const result = computePhaseState(events);

    expect(result.currentPhase).toBeNull();
    expect(result.lastCompletedPhase).toBe(1);
    expect(result.totalPhases).toBe(3);
  });

  it("tracks multiple phase transitions correctly", () => {
    const events: SessionEvent[] = [
      makePhaseStartedEvent(1, 3),
      makePhaseCompletedEvent(1, 3),
      makePhaseStartedEvent(2, 3),
      makePhaseCompletedEvent(2, 3),
      makePhaseStartedEvent(3, 3),
    ];

    const result = computePhaseState(events);

    expect(result.currentPhase).toBe(3);
    expect(result.lastCompletedPhase).toBe(2);
    expect(result.totalPhases).toBe(3);
  });

  it("ignores non-phase events (SESSION_STARTED, feature/task events)", () => {
    const events: SessionEvent[] = [
      makeSessionStartedEvent(),
      {
        epicId: "epic-1",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        eventType: SessionEventType.SESSION_FEATURE_STARTED,
        payload: {
          featureId: "f1",
          identifier: "ENG-1",
          title: "Feature 1",
          taskCount: 3,
        },
      },
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
    ];

    const result = computePhaseState(events);

    expect(result.currentPhase).toBeNull();
    expect(result.lastCompletedPhase).toBeNull();
    expect(result.totalPhases).toBeNull();
  });

  it("reflects latest totalPhases from the most recent phase event", () => {
    const events: SessionEvent[] = [
      makePhaseStartedEvent(1, 2),
      makePhaseCompletedEvent(1, 2),
      makePhaseStartedEvent(2, 2),
    ];

    const result = computePhaseState(events);

    expect(result.totalPhases).toBe(2);
    expect(result.currentPhase).toBe(2);
    expect(result.lastCompletedPhase).toBe(1);
  });

  it("does NOT include task/feature count fields", () => {
    const events: SessionEvent[] = [
      makePhaseStartedEvent(1, 3),
    ];

    const result = computePhaseState(events);

    // Only these three fields should be present
    expect(Object.keys(result).sort()).toEqual(
      ["currentPhase", "lastCompletedPhase", "totalPhases"].sort()
    );
  });
});
