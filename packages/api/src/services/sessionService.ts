/**
 * Session Service
 *
 * Provides business logic for AI session lifecycle management.
 * Enables explicit handoff between AI sessions with context preservation.
 */

import { prisma } from "../lib/db.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { emitSessionEvent } from "../events/index.js";
import { SessionEventType } from "@dispatcher/shared";
import { extractDebrief, storeDebrief } from "./debriefService.js";
import { transitionTo } from "./pipelineService.js";
import type {
  StartSessionInput,
  EndSessionInput,
  LogSessionWorkInput,
  SessionResponse,
  StartSessionResponse,
  SessionHistoryResponse,
  SessionWorkItem,
} from "../schemas/session.js";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse JSON string to array, returning empty array on failure
 */
function parseJsonArray<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Parse JSON string to object, returning null on failure
 */
function parseJsonObject<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Build feature-level execution phases from feature metadata.
 * Groups features by executionOrder, respecting dependencies via topological ordering.
 * Returns a lightweight phase array for the SESSION_STARTED event.
 */
function buildFeaturePhases(
  features: Array<{
    id: string;
    executionOrder: number | null;
    dependencies: string | null;
  }>
): Array<{ phase: number; featureIds: string[] }> {
  if (features.length === 0) return [];

  // Parse dependencies for each feature
  const featureDeps = new Map<string, string[]>();
  for (const f of features) {
    const deps = f.dependencies ? (JSON.parse(f.dependencies) as string[]) : [];
    featureDeps.set(f.id, deps);
  }

  const completed = new Set<string>();
  const phases: Array<{ phase: number; featureIds: string[] }> = [];
  let remaining = features.map((f) => f.id);
  let phaseNum = 1;

  while (remaining.length > 0) {
    // Find features whose dependencies are all completed
    const ready = remaining.filter((id) => {
      const deps = featureDeps.get(id) ?? [];
      return deps.every((d) => completed.has(d) || !featureDeps.has(d));
    });

    if (ready.length === 0) {
      // Circular dependency — put all remaining in one phase
      phases.push({ phase: phaseNum, featureIds: remaining });
      break;
    }

    phases.push({ phase: phaseNum++, featureIds: ready });
    for (const id of ready) {
      completed.add(id);
    }
    remaining = remaining.filter((id) => !completed.has(id));
  }

  return phases;
}

/**
 * Transform database session to response format
 */
function transformSession(session: {
  id: string;
  epicId: string;
  epic?: { name: string } | null;
  externalId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  status: string;
  itemsWorkedOn: string | null;
  summary: string | null;
  nextSteps: string | null;
  blockers: string | null;
  decisions: string | null;
  contextBlob: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SessionResponse {
  return {
    id: session.id,
    epicId: session.epicId,
    epicName: session.epic?.name ?? null,
    externalId: session.externalId,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    status: session.status as "active" | "completed" | "abandoned",
    itemsWorkedOn: parseJsonArray<SessionWorkItem>(session.itemsWorkedOn),
    summary: session.summary,
    nextSteps: parseJsonArray<string>(session.nextSteps),
    blockers: parseJsonArray<string>(session.blockers),
    decisions: parseJsonObject<{ decision: string; rationale?: string }[]>(session.decisions),
    contextBlob: session.contextBlob,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

// =============================================================================
// Session Lifecycle Operations
// =============================================================================

/**
 * Start a new AI session for an epic.
 * Returns the new session along with previous session handoff data and epic progress.
 */
export async function startSession(
  input: StartSessionInput
): Promise<StartSessionResponse> {
  // Resolve epic ID (could be name or UUID)
  const epic = await prisma.epic.findFirst({
    where: {
      OR: [
        { id: input.epicId },
        { name: input.epicId },
      ],
    },
    include: {
      features: {
        include: {
          status: true,
          tasks: {
            include: {
              status: true,
            },
          },
        },
      },
    },
  });

  if (!epic) {
    throw new NotFoundError(`Epic '${input.epicId}' not found`);
  }

  // Abandon any existing active sessions for this epic
  await prisma.aiSession.updateMany({
    where: {
      epicId: epic.id,
      status: "active",
    },
    data: {
      status: "abandoned",
      endedAt: new Date(),
    },
  });

  // Get the most recent completed session for handoff
  const previousSession = await prisma.aiSession.findFirst({
    where: {
      epicId: epic.id,
      status: { in: ["completed", "abandoned"] },
    },
    orderBy: { endedAt: "desc" },
  });

  // Create new session
  const newSession = await prisma.aiSession.create({
    data: {
      epicId: epic.id,
      externalId: input.externalId ?? null,
      status: "active",
    },
  });

  // Transition pipeline to 'building' if epic request exists for this epic
  const linkedEpicRequest = await prisma.epicRequest.findFirst({
    where: { convertedEpicId: epic.id },
    select: { id: true },
  });
  if (linkedEpicRequest) {
    void transitionTo(linkedEpicRequest.id, "building", newSession.id).catch((err: unknown) => {
      console.error(`[Pipeline] Failed to transition EpicRequest to building:`, err);
    });
  }

  // Build lightweight execution plan phases from feature execution metadata
  const executionPlan = buildFeaturePhases(epic.features);

  // Emit session started event
  emitSessionEvent({
    eventType: SessionEventType.SESSION_STARTED,
    sessionId: newSession.id,
    epicId: epic.id,
    timestamp: newSession.startedAt.toISOString(),
    payload: {
      ...(newSession.externalId != null ? { externalId: newSession.externalId } : {}),
      status: "active",
      totalFeatures: epic.features.length,
      totalTasks: epic.features.reduce((sum, f) => sum + f.tasks.length, 0),
      executionPlan,
    },
  });

  // Calculate epic progress
  let completedFeatures = 0;
  let inProgressFeatures = 0;
  let completedTasks = 0;
  let totalTasks = 0;

  for (const feature of epic.features) {
    if (feature.status?.category === "completed") {
      completedFeatures++;
    } else if (feature.status?.category === "started") {
      inProgressFeatures++;
    }

    for (const task of feature.tasks) {
      totalTasks++;
      if (task.status?.category === "completed") {
        completedTasks++;
      }
    }
  }

  return {
    session: transformSession(newSession),
    previousSession: previousSession ? transformSession(previousSession) : null,
    epicProgress: {
      totalFeatures: epic.features.length,
      completedFeatures,
      inProgressFeatures,
      totalTasks,
      completedTasks,
    },
  };
}

/**
 * End the current active session for an epic.
 * Records summary, next steps, blockers, and decisions for handoff.
 */
export async function endSession(
  epicId: string,
  input: EndSessionInput
): Promise<SessionResponse> {
  // Resolve epic ID
  const epic = await prisma.epic.findFirst({
    where: {
      OR: [
        { id: epicId },
        { name: epicId },
      ],
    },
  });

  if (!epic) {
    throw new NotFoundError(`Epic '${epicId}' not found`);
  }

  // Find the active session
  const activeSession = await prisma.aiSession.findFirst({
    where: {
      epicId: epic.id,
      status: "active",
    },
    orderBy: { startedAt: "desc" },
  });

  if (!activeSession) {
    throw new ValidationError("No active session found for this epic");
  }

  // Update the session with handoff data
  const updatedSession = await prisma.aiSession.update({
    where: { id: activeSession.id },
    data: {
      status: "completed",
      endedAt: new Date(),
      summary: input.summary,
      nextSteps: input.nextSteps ? JSON.stringify(input.nextSteps) : null,
      blockers: input.blockers ? JSON.stringify(input.blockers) : null,
      decisions: input.decisions ? JSON.stringify(input.decisions) : null,
      contextBlob: input.contextBlob ?? null,
    },
  });

  // Emit session ended event
  emitSessionEvent({
    eventType: SessionEventType.SESSION_ENDED,
    sessionId: updatedSession.id,
    epicId: epic.id,
    timestamp: updatedSession.endedAt?.toISOString() ?? new Date().toISOString(),
    payload: {
      status: "completed" as const,
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.nextSteps ? { nextSteps: input.nextSteps } : {}),
      ...(input.blockers ? { blockers: input.blockers } : {}),
      ...(input.decisions
        ? {
            decisions: input.decisions.map(d => ({
              decision: d.decision,
              ...(d.rationale ? { rationale: d.rationale } : {})
            }))
          }
        : {}),
    },
  });

  // Transition pipeline to 'done' if epic request exists for this epic
  const linkedEpicRequestForEnd = await prisma.epicRequest.findFirst({
    where: { convertedEpicId: epic.id },
    select: { id: true },
  });
  if (linkedEpicRequestForEnd) {
    void transitionTo(linkedEpicRequestForEnd.id, "done").catch((err: unknown) => {
      console.error(`[Pipeline] Failed to transition EpicRequest to done:`, err);
    });
  }

  // Extract and store session debrief as AI note on the epic (ENG-64)
  try {
    const debrief = extractDebrief(updatedSession);
    await storeDebrief(epic.id, updatedSession.id, debrief);
  } catch {
    // Debrief storage failure should not break session end
  }

  return transformSession(updatedSession);
}

/**
 * Get the active session for an epic, if any
 */
export async function getActiveSession(
  epicId: string
): Promise<SessionResponse | null> {
  const epic = await prisma.epic.findFirst({
    where: {
      OR: [
        { id: epicId },
        { name: epicId },
      ],
    },
  });

  if (!epic) {
    throw new NotFoundError(`Epic '${epicId}' not found`);
  }

  const activeSession = await prisma.aiSession.findFirst({
    where: {
      epicId: epic.id,
      status: "active",
    },
    include: { epic: true },
    orderBy: { startedAt: "desc" },
  });

  return activeSession ? transformSession(activeSession) : null;
}

/**
 * Get the last completed session for an epic
 */
export async function getLastSession(
  epicId: string
): Promise<SessionResponse | null> {
  const epic = await prisma.epic.findFirst({
    where: {
      OR: [
        { id: epicId },
        { name: epicId },
      ],
    },
  });

  if (!epic) {
    throw new NotFoundError(`Epic '${epicId}' not found`);
  }

  const lastSession = await prisma.aiSession.findFirst({
    where: {
      epicId: epic.id,
      status: { in: ["completed", "abandoned"] },
    },
    include: { epic: true },
    orderBy: { endedAt: "desc" },
  });

  return lastSession ? transformSession(lastSession) : null;
}

/**
 * Get session history for an epic
 */
export async function getSessionHistory(
  epicId: string,
  limit: number = 10
): Promise<SessionHistoryResponse> {
  const epic = await prisma.epic.findFirst({
    where: {
      OR: [
        { id: epicId },
        { name: epicId },
      ],
    },
  });

  if (!epic) {
    throw new NotFoundError(`Epic '${epicId}' not found`);
  }

  const [sessions, total] = await Promise.all([
    prisma.aiSession.findMany({
      where: { epicId: epic.id },
      orderBy: { startedAt: "desc" },
      take: limit,
    }),
    prisma.aiSession.count({
      where: { epicId: epic.id },
    }),
  ]);

  return {
    sessions: sessions.map(transformSession),
    total,
  };
}

/**
 * Compute live session progress by querying current task and feature state.
 *
 * ENG-165: This is the canonical way to get accurate progress data. It reads
 * directly from the database rather than from session events, so it is always
 * correct regardless of whether agents called log-work or not.
 *
 * @param epicId - The epic UUID to compute progress for
 * @returns Live counts of features and tasks (total and completed)
 */
export async function computeSessionProgress(epicId: string): Promise<{
  totalFeatures: number;
  completedFeatures: number;
  totalTasks: number;
  completedTasks: number;
}> {
  const features = await prisma.feature.findMany({
    where: { epicId },
    include: {
      status: { select: { category: true } },
      tasks: {
        include: { status: { select: { category: true } } },
      },
    },
  });

  let completedFeatures = 0;
  let totalTasks = 0;
  let completedTasks = 0;

  for (const feature of features) {
    if (feature.status?.category === "completed") {
      completedFeatures++;
    }
    for (const task of feature.tasks) {
      totalTasks++;
      if (task.status?.category === "completed") {
        completedTasks++;
      }
    }
  }

  return {
    totalFeatures: features.length,
    completedFeatures,
    totalTasks,
    completedTasks,
  };
}

/**
 * Get a specific session by ID
 */
export async function getSession(sessionId: string): Promise<SessionResponse> {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { epic: true },
  });

  if (!session) {
    throw new NotFoundError(`Session '${sessionId}' not found`);
  }

  // ENG-165: Compute live progress from actual DB state so the session detail
  // endpoint always reflects true task completion regardless of event history
  const liveProgress = await computeSessionProgress(session.epicId);
  return { ...transformSession(session), liveProgress };
}

// =============================================================================
// Work Tracking Operations
// =============================================================================

/**
 * Log work done during a session.
 * Called automatically when features/tasks are updated.
 */
export async function logSessionWork(
  epicId: string,
  input: LogSessionWorkInput
): Promise<SessionResponse | null> {
  // Find the epic
  const epic = await prisma.epic.findFirst({
    where: {
      OR: [
        { id: epicId },
        { name: epicId },
      ],
    },
  });

  if (!epic) {
    return null; // Silent fail - don't disrupt the main operation
  }

  // Find active session for this epic
  const activeSession = await prisma.aiSession.findFirst({
    where: {
      epicId: epic.id,
      status: "active",
    },
  });

  if (!activeSession) {
    return null; // No active session, nothing to log
  }

  // Parse existing work items
  const existingItems = parseJsonArray<SessionWorkItem>(activeSession.itemsWorkedOn);

  // Add new work item
  const newItem: SessionWorkItem = {
    type: input.itemType,
    id: input.itemId,
    identifier: input.identifier,
    action: input.action,
    timestamp: new Date().toISOString(),
  };

  existingItems.push(newItem);

  // Update session
  const updatedSession = await prisma.aiSession.update({
    where: { id: activeSession.id },
    data: {
      itemsWorkedOn: JSON.stringify(existingItems),
    },
  });

  // Emit session event for started items
  if (input.action === "started") {
    if (input.itemType === "task") {
      const task = await prisma.task.findUnique({
        where: { id: input.itemId },
        include: {
          feature: true,
          status: true,
        },
      });

      if (task) {
        emitSessionEvent({
          eventType: SessionEventType.SESSION_TASK_STARTED,
          sessionId: activeSession.id,
          epicId: epic.id,
          timestamp: newItem.timestamp,
          payload: {
            taskId: task.id,
            identifier: task.identifier,
            title: task.title,
            featureId: task.featureId,
            featureIdentifier: task.feature.identifier,
            ...(task.statusId != null ? { statusId: task.statusId } : {}),
            ...(task.status?.name != null ? { statusName: task.status.name } : {}),
          },
        });
      }
    } else {
      const feature = await prisma.feature.findUnique({
        where: { id: input.itemId },
        include: {
          status: true,
          tasks: true,
        },
      });

      if (feature) {
        emitSessionEvent({
          eventType: SessionEventType.SESSION_FEATURE_STARTED,
          sessionId: activeSession.id,
          epicId: epic.id,
          timestamp: newItem.timestamp,
          payload: {
            featureId: feature.id,
            identifier: feature.identifier,
            title: feature.title,
            ...(feature.statusId != null ? { statusId: feature.statusId } : {}),
            ...(feature.status?.name != null ? { statusName: feature.status.name } : {}),
            taskCount: feature.tasks.length,
          },
        });
      }
    }
  }

  // Emit session event for completed items
  if (input.action === "completed") {
    if (input.itemType === "task") {
      // Fetch task details for complete event
      const task = await prisma.task.findUnique({
        where: { id: input.itemId },
        include: {
          feature: true,
          status: true,
        },
      });

      if (task) {
        emitSessionEvent({
          eventType: SessionEventType.SESSION_TASK_COMPLETED,
          sessionId: activeSession.id,
          epicId: epic.id,
          timestamp: newItem.timestamp,
          payload: {
            taskId: task.id,
            identifier: task.identifier,
            title: task.title,
            featureId: task.featureId,
            featureIdentifier: task.feature.identifier,
            ...(task.statusId != null ? { statusId: task.statusId } : {}),
            ...(task.status?.name != null ? { statusName: task.status.name } : {}),
            ...(task.durationMinutes != null ? { durationMs: task.durationMinutes * 60 * 1000 } : {}),
          },
        });
      }
    } else {
      // Fetch feature details for complete event
      const feature = await prisma.feature.findUnique({
        where: { id: input.itemId },
        include: {
          status: true,
          tasks: true,
        },
      });

      if (feature) {
        const completedTaskCount = feature.tasks.filter(
          (t) => t.completedAt !== null
        ).length;

        emitSessionEvent({
          eventType: SessionEventType.SESSION_FEATURE_COMPLETED,
          sessionId: activeSession.id,
          epicId: epic.id,
          timestamp: newItem.timestamp,
          payload: {
            featureId: feature.id,
            identifier: feature.identifier,
            title: feature.title,
            ...(feature.statusId != null ? { statusId: feature.statusId } : {}),
            ...(feature.status?.name != null ? { statusName: feature.status.name } : {}),
            taskCount: feature.tasks.length,
            completedTaskCount,
            ...(feature.durationMinutes != null ? { durationMs: feature.durationMinutes * 60 * 1000 } : {}),
          },
        });
      }
    }
  }

  return transformSession(updatedSession);
}

/**
 * Emit a session progress event for a task.
 * Called when progress is logged on a task during an active session.
 */
export async function emitSessionProgressEvent(
  epicId: string,
  input: {
    taskId: string;
    identifier: string;
    title: string;
    featureId: string;
    featureIdentifier: string;
    message: string;
    percentComplete?: number;
  }
): Promise<void> {
  // Find the epic
  const epic = await prisma.epic.findFirst({
    where: {
      OR: [
        { id: epicId },
        { name: epicId },
      ],
    },
  });

  if (!epic) return;

  // Find active session
  const activeSession = await prisma.aiSession.findFirst({
    where: {
      epicId: epic.id,
      status: "active",
    },
  });

  if (!activeSession) return;

  emitSessionEvent({
    eventType: SessionEventType.SESSION_TASK_PROGRESS,
    sessionId: activeSession.id,
    epicId: epic.id,
    timestamp: new Date().toISOString(),
    payload: {
      taskId: input.taskId,
      identifier: input.identifier,
      title: input.title,
      featureId: input.featureId,
      featureIdentifier: input.featureIdentifier,
      message: input.message,
      ...(input.percentComplete !== undefined ? { percentComplete: input.percentComplete } : {}),
    },
  });
}

/**
 * Get the epic ID for a given item (feature or task).
 * Returns null if the item is not found. Never throws.
 */
export async function findEpicIdForItem(
  itemId: string,
  itemType: "feature" | "task"
): Promise<string | null> {
  if (itemType === "feature") {
    const feature = await prisma.feature.findUnique({
      where: { id: itemId },
      select: { epicId: true },
    });
    return feature?.epicId ?? null;
  } else {
    const task = await prisma.task.findUnique({
      where: { id: itemId },
      include: {
        feature: {
          select: { epicId: true },
        },
      },
    });
    return task?.feature?.epicId ?? null;
  }
}

/**
 * Abandon a session (mark as abandoned without handoff data)
 */
export async function abandonSession(sessionId: string): Promise<SessionResponse> {
  const session = await prisma.aiSession.findUnique({
    where: { id: sessionId },
    include: { epic: true },
  });

  if (!session) {
    throw new NotFoundError(`Session '${sessionId}' not found`);
  }

  if (session.status !== "active") {
    throw new ValidationError("Only active sessions can be abandoned");
  }

  const updatedSession = await prisma.aiSession.update({
    where: { id: sessionId },
    data: {
      status: "abandoned",
      endedAt: new Date(),
    },
  });

  // Emit session abandoned event
  emitSessionEvent({
    eventType: SessionEventType.SESSION_ENDED,
    sessionId: updatedSession.id,
    epicId: session.epicId,
    timestamp: updatedSession.endedAt?.toISOString() ?? new Date().toISOString(),
    payload: {
      status: "abandoned",
    },
  });

  return transformSession(updatedSession);
}
