/**
 * Session Utility Functions (ENG-162)
 *
 * Lightweight, shared utilities for session lookup and event emission.
 * These are intentionally kept in utils/ (not services/) to avoid circular
 * dependency risk: any service can import these without depending on another service.
 *
 * Key design decisions:
 * - getActiveSessionForEpic(): bare Prisma query, returns { id } or null, never throws
 * - emitAutoSessionEvent(): combines session lookup + DB write, never throws
 * - No DTO transformation — callers get raw values they can use directly
 */

import { prisma } from "../lib/db.js";

// =============================================================================
// Active Session Lookup
// =============================================================================

/**
 * Get the active session for an epic (bare Prisma lookup).
 *
 * Returns a minimal `{ id: string }` object or null if no active session exists.
 * This is the canonical shared utility for session ID resolution across services.
 *
 * Never throws — any database error returns null silently so the caller
 * is never blocked by a session lookup failure.
 *
 * @param epicId - The epic UUID to look up
 * @returns The active session's ID, or null
 */
export async function getActiveSessionForEpic(
  epicId: string
): Promise<{ id: string } | null> {
  try {
    return await prisma.aiSession.findFirst({
      where: { epicId, status: "active" },
      select: { id: true },
      orderBy: { startedAt: "desc" },
    });
  } catch {
    return null;
  }
}

// =============================================================================
// Session Event Emission
// =============================================================================

/**
 * Emit a session event to the active session for an epic.
 *
 * Writes a `SessionEvent` record to the database. No-op if no active session
 * exists for the epic. Never throws — the caller is never blocked by event
 * emission failures.
 *
 * This is the shared emission helper for use in service layer hooks. It is
 * equivalent to `emitSessionEventToEpic()` in epicService.ts but lives in
 * utils/ to be importable without service-layer circular dependencies.
 *
 * @param epicId  - The epic UUID the event belongs to
 * @param event   - Event type string and typed payload object
 */
export async function emitAutoSessionEvent(
  epicId: string,
  event: { type: string; payload: Record<string, unknown> }
): Promise<void> {
  const session = await getActiveSessionForEpic(epicId);
  if (!session) return;

  try {
    await prisma.sessionEvent.create({
      data: {
        epicId,
        sessionId: session.id,
        eventType: event.type,
        payload: JSON.stringify(event.payload),
      },
    });
  } catch {
    // Never block the parent operation
  }
}
