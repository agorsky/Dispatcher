import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  startSession,
  endSession,
  getActiveSession,
  getLastSession,
  getSessionHistory,
  getSession,
  logSessionWork,
  abandonSession,
  computeSessionProgress,
} from "../services/sessionService.js";
import { triggerBarneyAudit } from "../services/epicService.js";
import {
  getSessionEvents,
  computePhaseState,
  derivePhaseFromDatabase,
} from "../services/sessionEventService.js";
import { emitSessionEvent } from "../events/index.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody, validateQuery, validateParams } from "../middleware/validate.js";
import {
  startSessionSchema,
  endSessionSchema,
  logSessionWorkSchema,
  type StartSessionInput,
  type EndSessionInput,
  type LogSessionWorkInput,
} from "../schemas/session.js";
import {
  epicIdParamSchema,
  sessionEventsQuerySchema,
  type EpicIdParam,
  type SessionEventsQuery,
} from "../schemas/session-events.js";
import type { SessionEvent } from "@dispatcher/shared";

// =============================================================================
// Request Type Definitions
// =============================================================================

interface SessionIdParams {
  id: string;
}

interface EpicIdParams {
  epicId: string;
}

interface SessionHistoryQuery {
  limit?: string;
}

// =============================================================================
// Routes
// =============================================================================

export default async function sessionRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  // Apply authentication to all routes
  fastify.addHook("preHandler", authenticate);

  // ---------------------------------------------------------------------------
  // POST /api/v1/sessions/start - Start a new session
  // ---------------------------------------------------------------------------
  fastify.post<{
    Body: StartSessionInput;
  }>(
    "/start",
    {
      preHandler: validateBody(startSessionSchema),
    },
    async (request, reply) => {
      const result = await startSession(request.body);
      return reply.status(201).send({ data: result });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/v1/sessions/:epicId/events - Query session events for an epic
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: EpicIdParam;
    Querystring: SessionEventsQuery;
  }>(
    "/:epicId/events",
    {
      preValidation: [
        validateParams(epicIdParamSchema),
        validateQuery(sessionEventsQuerySchema),
      ],
    },
    async (request, reply) => {
      const { epicId } = request.params;
      const { since, sessionId, eventTypes, limit, cursor } = request.query;
      
      // Build options object with only defined values
      const queryOptions: {
        since?: string;
        sessionId?: string;
        eventTypes?: string[];
        limit?: number;
        cursor?: string;
      } = {};
      
      if (since) queryOptions.since = since;
      if (sessionId) queryOptions.sessionId = sessionId;
      if (eventTypes) queryOptions.eventTypes = eventTypes;
      if (limit !== undefined) queryOptions.limit = limit;
      if (cursor) queryOptions.cursor = cursor;
      
      // Query events from service
      const result = await getSessionEvents(epicId, queryOptions);

      // Compute phase state from events (phase tracking only)
      // For phase accuracy we use all events (not just the paginated slice).
      // We reuse the paginated result's events here since the `since` filter
      // is not applied for the phase query — the full-history fetch is only
      // needed when `since` is set by the caller.
      const phaseEvents =
        queryOptions.since
          ? (await getSessionEvents(epicId, {
              limit: 1000,
              ...(queryOptions.sessionId ? { sessionId: queryOptions.sessionId } : {}),
            })).events
          : result.events;

      let phaseState = computePhaseState(phaseEvents);

      // If no phase data from events, derive from database feature statuses
      if (phaseState.totalPhases === null) {
        const dbPhase = await derivePhaseFromDatabase(epicId);
        phaseState = {
          currentPhase: dbPhase.currentPhase,
          lastCompletedPhase: dbPhase.lastCompletedPhase,
          totalPhases: dbPhase.totalPhases,
        };
      }

      // Merge phase state with DB-sourced task/feature counts for accurate progress
      const dbProgress = await computeSessionProgress(epicId);
      const progressState = {
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

      return reply.send({
        data: {
          events: result.events,
          nextCursor: result.nextCursor,
          totalCount: result.totalCount,
          progress: progressState,
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /api/v1/sessions/:epicId/end - End the active session for an epic
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: EpicIdParams;
    Body: EndSessionInput;
  }>(
    "/:epicId/end",
    {
      preHandler: validateBody(endSessionSchema),
    },
    async (request, reply) => {
      const result = await endSession(request.params.epicId, request.body);

      // ENG-114-2: Trigger Barney audit immediately on session end (non-blocking)
      triggerBarneyAudit(request.params.epicId, result.id).catch(() => {});

      return reply.send({ data: result });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /api/v1/sessions/:epicId/active - Get active session for an epic
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: EpicIdParams;
  }>("/:epicId/active", async (request, reply) => {
    const result = await getActiveSession(request.params.epicId);
    if (!result) {
      return reply.status(404).send({
        error: "No active session found for this epic",
      });
    }
    return reply.send({ data: result });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/sessions/:epicId/last - Get the last completed session
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: EpicIdParams;
  }>("/:epicId/last", async (request, reply) => {
    const result = await getLastSession(request.params.epicId);
    if (!result) {
      return reply.status(404).send({
        error: "No completed sessions found for this epic",
      });
    }
    return reply.send({ data: result });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/sessions/:epicId/history - Get session history for an epic
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: EpicIdParams;
    Querystring: SessionHistoryQuery;
  }>("/:epicId/history", async (request, reply) => {
    const limit = request.query.limit
      ? Math.min(Math.max(parseInt(request.query.limit, 10), 1), 100)
      : 10;
    
    const result = await getSessionHistory(request.params.epicId, limit);
    return reply.send({ data: result });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/sessions/by-id/:id - Get a specific session by ID
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: SessionIdParams;
  }>("/by-id/:id", async (request, reply) => {
    const result = await getSession(request.params.id);
    return reply.send({ data: result });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/sessions/:epicId/log-work - Log work done during a session
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: EpicIdParams;
    Body: LogSessionWorkInput;
  }>(
    "/:epicId/log-work",
    {
      preHandler: validateBody(logSessionWorkSchema),
    },
    async (request, reply) => {
      const result = await logSessionWork(request.params.epicId, request.body);
      if (!result) {
        return reply.status(404).send({
          error: "No active session found for this epic",
        });
      }
      return reply.send({ data: result });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /api/v1/sessions/by-id/:id/abandon - Abandon a session
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: SessionIdParams;
  }>("/by-id/:id/abandon", async (request, reply) => {
    const result = await abandonSession(request.params.id);
    return reply.send({ data: result });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/sessions/emit-event - Emit a session event
  // ---------------------------------------------------------------------------
  fastify.post<{
    Body: SessionEvent;
  }>("/emit-event", async (request, reply) => {
    // Emit the session event through the event emitter
    // This will be picked up by SSE clients listening to the events endpoint
    emitSessionEvent(request.body);
    return reply.status(204).send();
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/sessions/:id/state - Get session state machine state
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: SessionIdParams;
  }>("/by-id/:id/state", async (request, reply) => {
    const { getSessionState, getAllowedTransitions } = await import("../services/session-state-machine.js");
    
    const currentState = await getSessionState(request.params.id);
    const allowedTransitions = await getAllowedTransitions(request.params.id);

    return reply.send({
      data: {
        currentState,
        allowedTransitions,
      },
    });
  });
}
