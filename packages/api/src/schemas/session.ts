import { z } from "zod";

/**
 * Validation schemas for AI Session entities.
 * These schemas support the session handoff feature for cross-session continuity.
 */

/**
 * Valid session status values
 */
export const sessionStatusValues = ["active", "completed", "abandoned"] as const;
export type SessionStatus = (typeof sessionStatusValues)[number];

/**
 * Schema for an item that was worked on during a session
 */
export const sessionWorkItemSchema = z.object({
  type: z.enum(["feature", "task"]),
  id: z.string().uuid(),
  identifier: z.string(),
  action: z.string(), // e.g., "created", "updated", "completed", "started"
  timestamp: z.string().datetime(),
});

export type SessionWorkItem = z.infer<typeof sessionWorkItemSchema>;

/**
 * Schema for starting a session
 */
export const startSessionSchema = z.object({
  epicId: z.string().describe(
    "The epic to work on. Accepts epic ID (UUID) or exact epic name."
  ),
  externalId: z.string().max(255).optional().describe(
    "Optional external session identifier from the AI agent (e.g., Copilot session ID)."
  ),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;

/**
 * Schema for ending a session
 */
export const endSessionSchema = z.object({
  summary: z.string().min(1).max(10000).describe(
    "A summary of work completed during this session."
  ),
  nextSteps: z.array(z.string().max(1000)).max(20).optional().describe(
    "Recommended next actions for the successor session."
  ),
  blockers: z.array(z.string().max(1000)).max(20).optional().describe(
    "Blockers encountered during this session."
  ),
  decisions: z.array(z.object({
    decision: z.string().max(500),
    rationale: z.string().max(1000).optional(),
  })).max(20).optional().describe(
    "Key decisions made during this session with optional rationale."
  ),
  contextBlob: z.string().max(50000).optional().describe(
    "Serialized context blob for next session (JSON, markdown, or structured data)."
  ),
});

export type EndSessionInput = z.infer<typeof endSessionSchema>;

/**
 * Schema for logging work during a session
 */
export const logSessionWorkSchema = z.object({
  itemId: z.string().uuid(),
  itemType: z.enum(["feature", "task"]),
  identifier: z.string(),
  action: z.string().max(50),
});

export type LogSessionWorkInput = z.infer<typeof logSessionWorkSchema>;

/**
 * Response schema for session data
 */
export const sessionResponseSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
  epicName: z.string().nullable(),
  externalId: z.string().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  status: z.enum(sessionStatusValues),
  itemsWorkedOn: z.array(sessionWorkItemSchema),
  summary: z.string().nullable(),
  nextSteps: z.array(z.string()).nullable(),
  blockers: z.array(z.string()).nullable(),
  decisions: z.array(z.object({
    decision: z.string(),
    rationale: z.string().optional(),
  })).nullable(),
  contextBlob: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * Response schema for start_session including handoff context
 */
export const startSessionResponseSchema = z.object({
  session: sessionResponseSchema,
  previousSession: sessionResponseSchema.nullable(),
  epicProgress: z.object({
    totalFeatures: z.number(),
    completedFeatures: z.number(),
    inProgressFeatures: z.number(),
    totalTasks: z.number(),
    completedTasks: z.number(),
  }),
});

export type StartSessionResponse = z.infer<typeof startSessionResponseSchema>;

/**
 * Response schema for session history
 */
export const sessionHistoryResponseSchema = z.object({
  sessions: z.array(sessionResponseSchema),
  total: z.number(),
});

export type SessionHistoryResponse = z.infer<typeof sessionHistoryResponseSchema>;
