/**
 * Pipeline Service
 *
 * Manages pipeline status state machine for EpicRequests.
 * Valid states: approved -> planning -> planned -> building -> done
 * Any state can transition to: error
 * Transitions are forward-only (except error which can come from any state).
 * Idempotent: calling transitionTo with current state is a no-op.
 */

import { prisma } from "../lib/db.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { eventEmitter, Events } from "../events/emitter.js";

export type PipelineStatus =
  | "approved"
  | "planning"
  | "planned"
  | "building"
  | "done"
  | "error";

// Forward-only state machine: maps each state to valid next states
const VALID_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  approved: ["planning", "error"],
  planning: ["planned", "error"],
  planned: ["building", "error"],
  building: ["done", "error"],
  done: ["error"],
  error: [],
};

export interface PipelineStatusChangedPayload {
  epicRequestId: string;
  oldStatus: PipelineStatus | null;
  newStatus: PipelineStatus;
  timestamp: string;
  linkedEntityId?: string;
  errorMessage?: string;
}

export const EVENT_PIPELINE_STATUS_CHANGED = "pipeline:status_changed";

/**
 * Transition the pipeline status for an epic request.
 * Validates forward-only transitions and updates pipelineUpdatedAt.
 * Emits pipeline_status_changed SSE event on success.
 * Idempotent: same-state transitions are a no-op.
 *
 * @param epicRequestId - The epic request to update
 * @param newStatus - The target pipeline status
 * @param linkedEntityId - Optional linked entity ID (epicId, sessionId, prUrl)
 * @param errorMessage - Optional error message (only for 'error' transitions)
 */
export async function transitionTo(
  epicRequestId: string,
  newStatus: PipelineStatus,
  linkedEntityId?: string,
  errorMessage?: string
): Promise<void> {
  const epicRequest = await prisma.epicRequest.findUnique({
    where: { id: epicRequestId },
    select: {
      id: true,
      pipelineStatus: true,
      linkedSessionId: true,
      prUrl: true,
      convertedEpicId: true,
    },
  });

  if (!epicRequest) {
    throw new NotFoundError(`Epic request with id '${epicRequestId}' not found`);
  }

  const currentStatus = epicRequest.pipelineStatus as PipelineStatus | null;

  // Idempotent: same-state transition is a no-op
  if (currentStatus === newStatus) {
    console.log(
      `[Pipeline] EpicRequest ${epicRequestId}: already in state '${newStatus}', no-op`
    );
    return;
  }

  // Validate transition (null/no status can transition to 'approved')
  if (currentStatus !== null) {
    const validNext = VALID_TRANSITIONS[currentStatus];
    if (!validNext.includes(newStatus)) {
      throw new ValidationError(
        `Invalid pipeline transition from '${currentStatus}' to '${newStatus}' for epic request '${epicRequestId}'`
      );
    }
  }

  // Build update data
  const updateData: {
    pipelineStatus: string;
    pipelineUpdatedAt: Date;
    linkedSessionId?: string | null;
    prUrl?: string | null;
    pipelineError?: string | null;
  } = {
    pipelineStatus: newStatus,
    pipelineUpdatedAt: new Date(),
    pipelineError: errorMessage ?? null,
  };

  // Link entities based on status
  if (newStatus === "building" && linkedEntityId) {
    updateData.linkedSessionId = linkedEntityId;
  } else if (newStatus === "done" && linkedEntityId) {
    updateData.prUrl = linkedEntityId;
  }

  await prisma.epicRequest.update({
    where: { id: epicRequestId },
    data: updateData,
  });

  console.log(
    `[Pipeline] EpicRequest ${epicRequestId}: ${currentStatus ?? "null"} -> ${newStatus}`
  );

  // Emit SSE event for frontend live updates
  const payload: PipelineStatusChangedPayload = {
    epicRequestId,
    oldStatus: currentStatus,
    newStatus,
    timestamp: new Date().toISOString(),
    ...(linkedEntityId !== undefined ? { linkedEntityId } : {}),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
  };
  eventEmitter.emit(EVENT_PIPELINE_STATUS_CHANGED, payload);
}

/**
 * Get the current pipeline status for an epic request.
 * Returns the full pipeline state including linked entity IDs.
 */
export async function getCurrentStatus(epicRequestId: string): Promise<{
  pipelineStatus: PipelineStatus | null;
  pipelineUpdatedAt: Date | null;
  convertedEpicId: string | null;
  linkedSessionId: string | null;
  prUrl: string | null;
  pipelineError: string | null;
} | null> {
  const epicRequest = await prisma.epicRequest.findUnique({
    where: { id: epicRequestId },
    select: {
      pipelineStatus: true,
      pipelineUpdatedAt: true,
      convertedEpicId: true,
      linkedSessionId: true,
      prUrl: true,
      pipelineError: true,
    },
  });

  if (!epicRequest) {
    return null;
  }

  return {
    pipelineStatus: epicRequest.pipelineStatus as PipelineStatus | null,
    pipelineUpdatedAt: epicRequest.pipelineUpdatedAt,
    convertedEpicId: epicRequest.convertedEpicId,
    linkedSessionId: epicRequest.linkedSessionId,
    prUrl: epicRequest.prUrl,
    pipelineError: epicRequest.pipelineError,
  };
}

/**
 * Subscribe to pipeline status changed events
 */
export function onPipelineStatusChanged(
  handler: (payload: PipelineStatusChangedPayload) => void
): void {
  eventEmitter.on(EVENT_PIPELINE_STATUS_CHANGED, handler);
}

/**
 * Unsubscribe from pipeline status changed events
 */
export function offPipelineStatusChanged(
  handler: (payload: PipelineStatusChangedPayload) => void
): void {
  eventEmitter.off(EVENT_PIPELINE_STATUS_CHANGED, handler);
}

// Export Events constant for use in SSE routes
export { Events };
