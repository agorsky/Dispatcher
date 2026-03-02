/**
 * Session Event Service
 * 
 * Provides service layer for persisting and querying session events.
 * Bridges the gap between event emission (EventEmitter) and database storage.
 * 
 * Capabilities:
 * 1. Write: persistSessionEvent() - fire-and-forget DB write on each emitted event
 * 2. Read: getSessionEvents() - query with filtering by time/session/type
 */

import { prisma } from "../lib/db.js";
import type { SessionEvent } from "@dispatcher/shared";
import {
  SessionEventType,
  isSessionLifecycleEvent,
  isSessionPhaseEvent,
  isSessionFeatureEvent,
  isSessionTaskEvent,
} from "@dispatcher/shared";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Query options for retrieving session events
 */
export interface GetSessionEventsOptions {
  /** Filter events from this timestamp onwards (ISO 8601) */
  since?: string;
  
  /** Filter events for a specific session ID */
  sessionId?: string;
  
  /** Filter by event types (e.g., ['SESSION_STARTED', 'SESSION_ENDED']) */
  eventTypes?: string[];
  
  /** Maximum number of events to return (default: 50, max: 200) */
  limit?: number;
  
  /** Cursor for pagination (opaque string from previous response) */
  cursor?: string;
}

/**
 * Response from getSessionEvents with pagination support
 */
export interface GetSessionEventsResponse {
  /** Array of session events in chronological order */
  events: SessionEvent[];
  
  /** Pagination cursor for fetching the next page (null if no more results) */
  nextCursor: string | null;
  
  /** Total count of events matching the filters */
  totalCount: number;
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Persist a session event to the database
 * 
 * This is a fire-and-forget operation designed to be called from an EventEmitter
 * listener. Failures are logged but do not throw to avoid disrupting event emission.
 * 
 * @param event - The session event to persist
 * @returns Promise that resolves when persistence completes (or fails)
 */
export async function persistSessionEvent(event: SessionEvent): Promise<void> {
  try {
    // Serialize the entire event as JSON for the payload field
    const payloadJson = JSON.stringify(event);
    
    await prisma.sessionEvent.create({
      data: {
        epicId: event.epicId,
        sessionId: event.sessionId,
        eventType: event.eventType,
        payload: payloadJson,
        timestamp: new Date(event.timestamp),
      },
    });
    
    // Optional: Log successful persistence for debugging
    // console.log(`[sessionEventService] Persisted event: ${event.eventType} for session ${event.sessionId}`);
  } catch (error) {
    // Log error but don't throw - persistence failures should not disrupt emission
    console.error(
      `[sessionEventService] Failed to persist event: ${event.eventType} for session ${event.sessionId}`,
      error
    );
  }
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Query session events with filtering and pagination
 * 
 * Returns events in chronological order (oldest first) to support streaming
 * and timeline views. Supports cursor-based pagination for large result sets.
 * 
 * @param epicId - Epic ID to filter events (required)
 * @param options - Query options for filtering and pagination
 * @returns Promise resolving to paginated session events
 */
export async function getSessionEvents(
  epicId: string,
  options: GetSessionEventsOptions = {}
): Promise<GetSessionEventsResponse> {
  const {
    since,
    sessionId,
    eventTypes,
    limit = 50,
    cursor,
  } = options;
  
  // Validate and clamp limit
  const effectiveLimit = Math.min(Math.max(1, limit), 200);
  
  // Build WHERE clause
  const whereClause: any = {
    epicId,
  };
  
  // Filter by timestamp if since is provided
  if (since) {
    whereClause.timestamp = {
      gte: new Date(since),
    };
  }
  
  // Filter by session ID if provided
  if (sessionId) {
    whereClause.sessionId = sessionId;
  }
  
  // Filter by event types if provided
  if (eventTypes && eventTypes.length > 0) {
    whereClause.eventType = {
      in: eventTypes,
    };
  }
  
  // Handle cursor pagination
  // Cursor format: base64(timestamp:id)
  let cursorCondition: any = undefined;
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, "base64").toString("utf-8");
      const [timestampStr, id] = decoded.split(":");
      if (timestampStr && id) {
        cursorCondition = {
          id,
        };
      }
    } catch (error) {
      // Invalid cursor - ignore and start from beginning
      console.warn(`[sessionEventService] Invalid cursor: ${cursor}`, error);
    }
  }
  
  // Query events
  const events = await prisma.sessionEvent.findMany({
    where: whereClause,
    orderBy: [
      { timestamp: "asc" },
      { id: "asc" },
    ],
    take: effectiveLimit + 1, // Fetch one extra to determine if there are more results
    skip: cursorCondition ? 1 : 0, // Skip the cursor item itself
    cursor: cursorCondition,
  });
  
  // Determine if there are more results
  const hasMore = events.length > effectiveLimit;
  const resultEvents = hasMore ? events.slice(0, effectiveLimit) : events;
  
  // Generate next cursor
  let nextCursor: string | null = null;
  if (hasMore && resultEvents.length > 0) {
    const lastEvent = resultEvents[resultEvents.length - 1];
    if (lastEvent) {
      const cursorData = `${lastEvent.timestamp.toISOString()}:${lastEvent.id}`;
      nextCursor = Buffer.from(cursorData, "utf-8").toString("base64");
    }
  }
  
  // Get total count (for client-side progress indicators)
  const totalCount = await prisma.sessionEvent.count({
    where: whereClause,
  });
  
  // Parse events from JSON payload
  const parsedEvents: SessionEvent[] = resultEvents.map((dbEvent) => {
    try {
      return JSON.parse(dbEvent.payload) as SessionEvent;
    } catch (error) {
      // If parsing fails, construct a minimal event object
      console.error(
        `[sessionEventService] Failed to parse event payload for event ${dbEvent.id}`,
        error
      );
      return {
        epicId: dbEvent.epicId,
        sessionId: dbEvent.sessionId ?? "",
        timestamp: dbEvent.timestamp.toISOString(),
        eventType: SessionEventType.SESSION_ERROR,
        payload: {
          errorCode: "PARSE_ERROR",
          errorMessage: `Failed to parse event payload for event ${dbEvent.id}`,
          recoverable: false,
        },
      };
    }
  });
  
  return {
    events: parsedEvents,
    nextCursor,
    totalCount,
  };
}

// =============================================================================
// Progress State Computation
// =============================================================================

/**
 * Progress state computed from session events (phase data) merged with
 * DB-sourced task/feature counts.
 *
 * - Phase fields (currentPhase, lastCompletedPhase, totalPhases) are derived
 *   from session events or DB feature statuses (see derivePhaseFromDatabase).
 * - Count fields (totalFeatures, completedFeatures, totalTasks, completedTasks,
 *   progressPercentage) are sourced from the database via computeSessionProgress
 *   in sessionService.ts — NOT from session events — to ensure accuracy
 *   regardless of event emission gaps.
 */
export interface ProgressState {
  /** Current phase number (1-indexed), null when no phase is active. Source: events / DB. */
  currentPhase: number | null;
  /** Last completed phase number, null if no phase completed yet. Source: events / DB. */
  lastCompletedPhase: number | null;
  /** Total number of phases. Source: events / DB. */
  totalPhases: number | null;
  /** Overall progress percentage (0-100). Source: DB task counts. */
  progressPercentage: number;
  /** Total features in the epic. Source: DB. */
  totalFeatures: number;
  /** Completed features. Source: DB. */
  completedFeatures: number;
  /** Total tasks across all features. Source: DB. */
  totalTasks: number;
  /** Completed tasks. Source: DB. */
  completedTasks: number;
}

/**
 * Phase-only state computed from session events.
 * Does NOT include task/feature counts — those should come from the DB
 * via computeSessionProgress (sessionService.ts).
 */
export interface PhaseState {
  currentPhase: number | null;
  lastCompletedPhase: number | null;
  totalPhases: number | null;
}

/**
 * Compute phase-only state from session events.
 *
 * Extracts current/last-completed/total phase information from the event
 * stream. Task and feature counts are intentionally excluded; callers should
 * use computeSessionProgress() from sessionService.ts for those counts.
 *
 * @param events - Array of session events in chronological order
 * @returns Phase state derived from events
 */
export function computePhaseState(events: SessionEvent[]): PhaseState {
  const state: PhaseState = {
    currentPhase: null,
    lastCompletedPhase: null,
    totalPhases: null,
  };

  for (const event of events) {
    if (isSessionPhaseEvent(event)) {
      const { payload } = event;
      state.totalPhases = payload.totalPhases;

      if (event.eventType === SessionEventType.SESSION_PHASE_STARTED) {
        state.currentPhase = payload.phaseNumber;
      } else if (event.eventType === SessionEventType.SESSION_PHASE_COMPLETED) {
        state.lastCompletedPhase = payload.phaseNumber;
        state.currentPhase = null;
      }
    }
  }

  return state;
}

/**
 * @deprecated Use computePhaseState() for phase data and computeSessionProgress()
 * from sessionService.ts for DB-accurate task/feature counts.
 *
 * Kept for backward compatibility. Returns a ProgressState populated only from
 * events; task/feature counts may be inaccurate if events were not fully emitted.
 */
export function computeProgressState(events: SessionEvent[]): ProgressState {
  const phaseState = computePhaseState(events);

  // Legacy: derive task/feature counts from events (may be inaccurate)
  const allFeatureIds = new Set<string>();
  const featuresCompleted = new Set<string>();
  const featuresWithTaskCount = new Map<string, number>();
  const allTaskIds = new Set<string>();
  const tasksCompleted = new Set<string>();

  let epicTotalFeatures: number | null = null;
  let epicTotalTasks: number | null = null;

  for (const event of events) {
    if (isSessionLifecycleEvent(event) && event.eventType === SessionEventType.SESSION_STARTED) {
      const { payload } = event;
      if (typeof payload.totalFeatures === "number") {
        epicTotalFeatures = payload.totalFeatures;
      }
      if (typeof payload.totalTasks === "number") {
        epicTotalTasks = payload.totalTasks;
      }
    }

    if (isSessionFeatureEvent(event)) {
      const { payload } = event;
      allFeatureIds.add(payload.featureId);
      if (event.eventType === SessionEventType.SESSION_FEATURE_STARTED && payload.taskCount != null) {
        featuresWithTaskCount.set(payload.featureId, payload.taskCount);
      }
      if (event.eventType === SessionEventType.SESSION_FEATURE_COMPLETED) {
        featuresCompleted.add(payload.featureId);
      }
    }

    if (isSessionTaskEvent(event)) {
      const { payload } = event;
      allTaskIds.add(payload.taskId);
      if (event.eventType === SessionEventType.SESSION_TASK_COMPLETED) {
        tasksCompleted.add(payload.taskId);
      }
    }
  }

  const totalFeatures = epicTotalFeatures ?? allFeatureIds.size;
  const completedFeatures = featuresCompleted.size;
  const eventBasedTaskCount = Math.max(
    Array.from(featuresWithTaskCount.values()).reduce((sum, n) => sum + n, 0),
    allTaskIds.size
  );
  const totalTasks = epicTotalTasks ?? eventBasedTaskCount;
  const completedTasks = tasksCompleted.size;

  let progressPercentage = 0;
  if (totalTasks > 0) {
    progressPercentage = Math.round((completedTasks / totalTasks) * 100);
  } else if (totalFeatures > 0) {
    progressPercentage = Math.round((completedFeatures / totalFeatures) * 100);
  }

  return {
    ...phaseState,
    progressPercentage,
    totalFeatures,
    completedFeatures,
    totalTasks,
    completedTasks,
  };
}

// =============================================================================
// Database-Derived Phase Computation
// =============================================================================

/**
 * Derive current phase from the database by examining feature statuses
 * and execution metadata. This is used as a fallback when no phase events
 * exist in the session event stream (i.e., when the orchestrator is not used).
 * 
 * Features are grouped into phases by executionOrder and dependencies
 * (same logic as buildFeaturePhases in sessionService). The current phase
 * is determined by which phase has in-progress features, or which phase
 * was last completed.
 */
export async function derivePhaseFromDatabase(epicId: string): Promise<{
  currentPhase: number | null;
  lastCompletedPhase: number | null;
  totalPhases: number | null;
}> {
  const features = await prisma.feature.findMany({
    where: { epicId },
    include: {
      status: { select: { category: true } },
    },
    orderBy: [{ executionOrder: "asc" }, { sortOrder: "asc" }],
  });

  if (features.length === 0) {
    return { currentPhase: null, lastCompletedPhase: null, totalPhases: null };
  }

  // Group features into phases by executionOrder.
  // Features with the same executionOrder are in the same phase.
  // Features without executionOrder go into the last phase.
  const orderGroups = new Map<number, string[]>();
  const noOrderIds: string[] = [];

  for (const f of features) {
    if (f.executionOrder !== null && f.executionOrder !== undefined) {
      const group = orderGroups.get(f.executionOrder) ?? [];
      group.push(f.id);
      orderGroups.set(f.executionOrder, group);
    } else {
      noOrderIds.push(f.id);
    }
  }

  // Sort by executionOrder value and assign phase numbers
  const sortedOrders = Array.from(orderGroups.keys()).sort((a, b) => a - b);
  const phases: Array<{ phase: number; featureIds: string[] }> = [];
  let phaseNum = 1;

  for (const order of sortedOrders) {
    phases.push({ phase: phaseNum++, featureIds: orderGroups.get(order)! });
  }

  // Append features without executionOrder as a final phase (if any)
  if (noOrderIds.length > 0) {
    phases.push({ phase: phaseNum, featureIds: noOrderIds });
  }

  const totalPhases = phases.length;
  if (totalPhases === 0) {
    return { currentPhase: null, lastCompletedPhase: null, totalPhases: null };
  }

  // Build a status lookup: featureId -> category
  const featureStatusMap = new Map<string, string | null>();
  for (const f of features) {
    featureStatusMap.set(f.id, f.status?.category ?? null);
  }

  // Determine current and last completed phase
  let currentPhase: number | null = null;
  let lastCompletedPhase: number | null = null;

  for (const phase of phases) {
    const allCompleted = phase.featureIds.every(
      (id) => featureStatusMap.get(id) === "completed"
    );
    const anyStarted = phase.featureIds.some(
      (id) => featureStatusMap.get(id) === "started"
    );

    if (allCompleted) {
      lastCompletedPhase = phase.phase;
    } else if (anyStarted || (lastCompletedPhase !== null && lastCompletedPhase === phase.phase - 1)) {
      // Phase is current if any feature is started, or if it's the next phase after the last completed one
      currentPhase = phase.phase;
      break;
    } else if (lastCompletedPhase === null && !allCompleted) {
      // First phase with incomplete features and no prior completed phase
      currentPhase = phase.phase;
      break;
    }
  }

  return { currentPhase, lastCompletedPhase, totalPhases };
}
