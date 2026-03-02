import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  listEpics,
  getEpicById,
  createEpic,
  updateEpic,
  deleteEpic,
  archiveEpic,
  unarchiveEpic,
  createEpicComplete,
  transferEpicScope,
  completeEpic,
  reopenEpic,
} from "../services/epicService.js";
import {
  getEpicAiContext,
  setEpicAiContext,
  appendEpicAiNote,
} from "../services/aiContextService.js";
import {
  getEpicStructuredDesc,
  setEpicStructuredDesc,
  updateEpicSection,
  addAcceptanceCriterion,
  linkFile,
  addExternalLink,
} from "../services/structuredDescriptionService.js";
import { getProgressSummary } from "../services/summaryService.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validate.js";
import { requireTeamAccess, requireRole } from "../middleware/authorize.js";
import { generateSortOrderBetween } from "../utils/ordering.js";
import { reorderEpicSchema, transferEpicScopeSchema, type TransferEpicScopeInput } from "../schemas/epic.js";
import {
  appendAiNoteSchema,
  setAiContextSchema,
  type AppendAiNoteInput,
  type SetAiContextInput,
} from "../schemas/aiContext.js";
import {
  structuredDescriptionSchema,
  updateSectionSchema,
  addAcceptanceCriterionSchema,
  linkFileSchema,
  addExternalLinkSchema,
  type StructuredDescription,
  type UpdateSectionInput,
  type AddAcceptanceCriterionInput,
  type LinkFileInput,
  type AddExternalLinkInput,
} from "../schemas/structuredDescription.js";
import type { CreateEpicCompleteInput } from "../schemas/compositeEpic.js";

// Request type definitions
interface ListEpicsQuery {
  cursor?: string;
  limit?: string;
  teamId?: string;
  includeArchived?: string;
  createdBy?: string;
  status?: string;
}

interface EpicIdParams {
  id: string;
}

interface CreateEpicBody {
  name: string;
  teamId: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

interface UpdateEpicBody {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

interface ReorderEpicBody {
  afterId?: string;
  beforeId?: string;
}

/**
 * Epics routes plugin
 * Prefix: /api/v1/epics
 */
export default function epicsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): void {
  /**
   * GET /api/v1/epics
   * List epics with cursor-based pagination
   * Optional teamId query param to filter by team
   * Optional includeArchived query param to include archived epics
   * Requires authentication
   */
  fastify.get<{ Querystring: ListEpicsQuery }>(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const options: { cursor?: string; limit?: number; teamId?: string; currentUserId?: string; includeArchived?: boolean; createdBy?: string; status?: string } = {};
      if (request.query.cursor) {
        options.cursor = request.query.cursor;
      }
      if (request.query.limit) {
        options.limit = parseInt(request.query.limit, 10);
      }
      if (request.query.teamId) {
        options.teamId = request.query.teamId;
      }
      if (request.query.includeArchived === "true") {
        options.includeArchived = true;
      }
      if (request.query.createdBy) {
        // Validate that createdBy is a valid UUID
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(request.query.createdBy)) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "createdBy must be a valid UUID",
          });
        }
        options.createdBy = request.query.createdBy;
      }
      if (request.query.status) {
        const validStatuses = ["active", "completed"];
        if (!validStatuses.includes(request.query.status)) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "status must be 'active' or 'completed'",
          });
        }
        options.status = request.query.status;
      }
      // Global admins see all epics; others are filtered to their accessible scopes
      if (request.user?.id && !request.user.isGlobalAdmin) {
        options.currentUserId = request.user.id;
      }

      const result = await listEpics(options);
      return reply.send(result);
    }
  );

  /**
   * GET /api/v1/epics/:id
   * Get a single epic by ID
   * Requires authentication and team membership (guest+)
   */
  fastify.get<{ Params: EpicIdParams }>(
    "/:id",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("guest")] },
    async (request, reply) => {
      const epic = await getEpicById(request.params.id, { includeArchived: true });
      if (!epic) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Epic with id '${request.params.id}' not found`,
        });
      }
      return reply.send({ data: epic });
    }
  );

  /**
   * POST /api/v1/epics
   * Create a new epic
   * Requires authentication, team membership, and member+ role
   */
  fastify.post<{ Body: CreateEpicBody }>(
    "/",
    { preHandler: [authenticate, requireTeamAccess("teamId"), requireRole("member")] },
    async (request, reply) => {
      const { name, teamId, description, icon, color, sortOrder } = request.body;

      const input: {
        name: string;
        teamId: string;
        userId: string;
        description?: string;
        icon?: string;
        color?: string;
        sortOrder?: number;
      } = {
        name,
        teamId,
        userId: request.user!.id, // Authenticated user ID
      };
      if (description !== undefined) input.description = description;
      if (icon !== undefined) input.icon = icon;
      if (color !== undefined) input.color = color;
      if (sortOrder !== undefined) input.sortOrder = sortOrder;

      const epic = await createEpic(input);
      return reply.status(201).send({ data: epic });
    }
  );

  /**
   * PUT /api/v1/epics/:id
   * Update an existing epic
   * Requires authentication, team membership, and member+ role
   */
  fastify.put<{ Params: EpicIdParams; Body: UpdateEpicBody }>(
    "/:id",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")] },
    async (request, reply) => {
      const { id } = request.params;
      const { name, description, icon, color, sortOrder } = request.body;

      const input: {
        name?: string;
        description?: string;
        icon?: string;
        color?: string;
        sortOrder?: number;
      } = {};
      if (name !== undefined) input.name = name;
      if (description !== undefined) input.description = description;
      if (icon !== undefined) input.icon = icon;
      if (color !== undefined) input.color = color;
      if (sortOrder !== undefined) input.sortOrder = sortOrder;

      const epic = await updateEpic(id, input);
      return reply.send({ data: epic });
    }
  );

  /**
   * DELETE /api/v1/epics/:id
   * Soft delete an epic (set isArchived = true)
   * Requires authentication, team membership, and admin role
   */
  fastify.delete<{ Params: EpicIdParams }>(
    "/:id",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")] },
    async (request, reply) => {
      const { id } = request.params;

      await deleteEpic(id);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/epics/:id/archive
   * Archive an epic (set isArchived = true)
   * Requires authentication, team membership, and member+ role
   */
  fastify.post<{ Params: EpicIdParams }>(
    "/:id/archive",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")] },
    async (request, reply) => {
      const { id } = request.params;

      const epic = await archiveEpic(id);
      return reply.send({ data: epic });
    }
  );

  /**
   * POST /api/v1/epics/:id/unarchive
   * Unarchive an epic (set isArchived = false)
   * Requires authentication, team membership, and member+ role
   */
  fastify.post<{ Params: EpicIdParams }>(
    "/:id/unarchive",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")] },
    async (request, reply) => {
      const { id } = request.params;

      const epic = await unarchiveEpic(id);
      return reply.send({ data: epic });
    }
  );

  /**
   * PATCH /api/v1/epics/:id/complete
   * Mark an epic as completed (manual lifecycle control)
   * Requires authentication, team membership, and member+ role
   */
  fastify.patch<{ Params: EpicIdParams }>(
    "/:id/complete",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")] },
    async (request, reply) => {
      const { id } = request.params;
      const epic = await completeEpic(id, request.user?.id);
      return reply.send({ data: epic });
    }
  );

  /**
   * PATCH /api/v1/epics/:id/reopen
   * Reopen a completed epic (set status back to active)
   * Requires authentication, team membership, and member+ role
   */
  fastify.patch<{ Params: EpicIdParams }>(
    "/:id/reopen",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")] },
    async (request, reply) => {
      const { id } = request.params;
      const epic = await reopenEpic(id, request.user?.id);
      return reply.send({ data: epic });
    }
  );

  /**
   * POST /api/v1/epics/:id/transfer
   * Transfer an epic between personal and team scope.
   * Cascades scope change to all child features and tasks with status remapping.
   * Requires authentication.
   */
  fastify.post<{ Params: EpicIdParams; Body: TransferEpicScopeInput }>(
    "/:id/transfer",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(transferEpicScopeSchema)],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { direction, teamId } = request.body;

      const epic = await transferEpicScope(
        id,
        request.user!.id,
        direction,
        teamId
      );
      return reply.send({ data: epic });
    }
  );

  /**
   * POST /api/v1/epics/:id/dispatch
   * Trigger implementation dispatch — fires openclaw system event to kick off Bobby
   * Requires authentication, team membership, and member+ role
   */
  fastify.post<{ Params: EpicIdParams }>(
    "/:id/dispatch",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")] },
    async (request, reply) => {
      const { id } = request.params;
      const epic = await getEpicById(id);
      if (!epic) {
        return reply.status(404).send({ error: "Epic not found" });
      }
      if (epic.status === "completed") {
        return reply.status(400).send({ error: "Cannot dispatch a completed epic" });
      }
      // Fire openclaw system event (no-op inside Docker, works on host)
      const { spawn } = await import("child_process");
      const OPENCLAW_BIN = "/opt/homebrew/bin/openclaw";
      const prompt = [
        `Implementation dispatch requested for epic ${epic.identifier}: "${epic.name}".`,
        `Epic ID: ${id}.`,
        `Dispatch Bobby to implement all features and tasks. Start a Dispatcher session, mark tasks In Progress as you go, link related files and commits, mark tasks Done when complete. Open a PR when finished.`,
      ].join(" ");
      try {
        const child = spawn(OPENCLAW_BIN, ["system", "event", "--text", prompt, "--mode", "now"], {
          detached: true,
          stdio: "ignore",
        });
        child.on("error", () => {}); // swallow ENOENT inside Docker
        child.unref();
      } catch {
        // Non-blocking
      }
      return reply.send({ data: { epicId: id, dispatched: true, message: `Dispatch triggered for ${epic.identifier}` } });
    }
  );


  /**
   * PUT /api/v1/epics/:id/reorder
   * Reorder an epic within its team
   * Requires authentication, team membership, and member+ role
   */
  fastify.put<{ Params: EpicIdParams; Body: ReorderEpicBody }>(
    "/:id/reorder",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")] },
    async (request, reply) => {
      const { id } = request.params;
      const { afterId, beforeId } = request.body;

      // Validate request body using Zod schema
      const validation = reorderEpicSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: validation.error.errors[0]?.message ?? "Invalid request body",
        });
      }

      // Fetch the epic being reordered
      const epic = await getEpicById(id);
      if (!epic) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Epic with id '${id}' not found`,
        });
      }

      let beforeSortOrder: number | null = null;
      let afterSortOrder: number | null = null;

      // If afterId provided, fetch that epic and use its sortOrder as "before"
      if (afterId) {
        const afterEpic = await getEpicById(afterId);
        if (!afterEpic) {
          return reply.status(404).send({
            error: "Not Found",
            message: `Epic with id '${afterId}' not found`,
          });
        }
        // Validate that afterId epic belongs to the same team
        if (afterEpic.teamId !== epic.teamId) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "afterId epic must belong to the same team",
          });
        }
        beforeSortOrder = afterEpic.sortOrder;
      }

      // If beforeId provided, fetch that epic and use its sortOrder as "after"
      if (beforeId) {
        const beforeEpic = await getEpicById(beforeId);
        if (!beforeEpic) {
          return reply.status(404).send({
            error: "Not Found",
            message: `Epic with id '${beforeId}' not found`,
          });
        }
        // Validate that beforeId epic belongs to the same team
        if (beforeEpic.teamId !== epic.teamId) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "beforeId epic must belong to the same team",
          });
        }
        afterSortOrder = beforeEpic.sortOrder;
      }

      // Calculate new sortOrder using generateSortOrderBetween
      const newSortOrder = generateSortOrderBetween(beforeSortOrder, afterSortOrder);

      // Update the epic's sortOrder
      const updatedEpic = await updateEpic(id, { sortOrder: newSortOrder });

      return reply.send({ data: updatedEpic });
    }
  );

  /**
   * GET /api/v1/epics/:id/progress-summary
   * Get comprehensive progress summary for an epic
   * Requires authentication and team membership (guest+)
   */
  fastify.get<{ Params: EpicIdParams }>(
    "/:id/progress-summary",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("guest")] },
    async (request, reply) => {
      const summary = await getProgressSummary(request.params.id);
      return reply.send({ data: summary });
    }
  );

  /**
   * POST /api/v1/epics/complete
   * Create a complete epic with all features, tasks, and structured descriptions
   * in a single transactional operation.
   * Requires authentication, team membership, and member+ role
   */
  fastify.post<{ Body: CreateEpicCompleteInput }>(
    "/complete",
    { preHandler: [authenticate, requireTeamAccess("body.team"), requireRole("member")] },
    async (request, reply) => {
      const result = await createEpicComplete(request.body, request.user!.id);
      return reply.status(201).send({ data: result });
    }
  );

  // ===========================================================================
  // AI Context Routes
  // ===========================================================================

  /**
   * GET /api/v1/epics/:id/ai-context
   * Get AI context for an epic
   * Requires authentication and team membership (guest+)
   */
  fastify.get<{ Params: EpicIdParams }>(
    "/:id/ai-context",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("guest")] },
    async (request, reply) => {
      const { id } = request.params;
      const context = await getEpicAiContext(id);
      return reply.send({ data: context });
    }
  );

  /**
   * PUT /api/v1/epics/:id/ai-context
   * Set AI context for an epic (replaces entire context)
   * Requires authentication and team membership (member+)
   */
  fastify.put<{ Params: EpicIdParams; Body: SetAiContextInput }>(
    "/:id/ai-context",
    {
      preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")],
      preValidation: [validateBody(setAiContextSchema)],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { context, sessionId } = request.body;
      const result = await setEpicAiContext(id, { context, sessionId });
      return reply.send({ data: result });
    }
  );

  /**
   * POST /api/v1/epics/:id/ai-note
   * Append an AI note to an epic (non-destructive)
   * Requires authentication and team membership (member+)
   */
  fastify.post<{ Params: EpicIdParams; Body: AppendAiNoteInput }>(
    "/:id/ai-note",
    {
      preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")],
      preValidation: [validateBody(appendAiNoteSchema)],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { type, content, sessionId } = request.body;
      const result = await appendEpicAiNote(id, { type, content, sessionId });
      return reply.status(201).send({ data: result });
    }
  );

  // ===========================================================================
  // Structured Description Routes
  // ===========================================================================

  /**
   * GET /api/v1/epics/:id/structured-desc
   * Get structured description for an epic
   * Requires authentication and team membership (guest+)
   */
  fastify.get<{ Params: EpicIdParams }>(
    "/:id/structured-desc",
    { preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("guest")] },
    async (request, reply) => {
      const { id } = request.params;
      const result = await getEpicStructuredDesc(id);
      return reply.send({ data: result });
    }
  );

  /**
   * PUT /api/v1/epics/:id/structured-desc
   * Set structured description for an epic (replaces entire object)
   * Requires authentication and team membership (member+)
   */
  fastify.put<{ Params: EpicIdParams; Body: StructuredDescription }>(
    "/:id/structured-desc",
    {
      preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")],
      preValidation: [validateBody(structuredDescriptionSchema)],
    },
    async (request, reply) => {
      const { id } = request.params;
      const result = await setEpicStructuredDesc(id, request.body);
      return reply.send({ data: result });
    }
  );

  /**
   * PATCH /api/v1/epics/:id/structured-desc/section
   * Update a specific section of the structured description
   * Requires authentication and team membership (member+)
   */
  fastify.patch<{ Params: EpicIdParams; Body: UpdateSectionInput }>(
    "/:id/structured-desc/section",
    {
      preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")],
      preValidation: [validateBody(updateSectionSchema)],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { section, value } = request.body;
      const result = await updateEpicSection(id, section, value);
      return reply.send({ data: result });
    }
  );

  /**
   * POST /api/v1/epics/:id/structured-desc/acceptance-criteria
   * Add an acceptance criterion to an epic
   * Requires authentication and team membership (member+)
   */
  fastify.post<{ Params: EpicIdParams; Body: AddAcceptanceCriterionInput }>(
    "/:id/structured-desc/acceptance-criteria",
    {
      preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")],
      preValidation: [validateBody(addAcceptanceCriterionSchema)],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { criterion } = request.body;
      const result = await addAcceptanceCriterion("epic", id, criterion);
      return reply.status(201).send({ data: result });
    }
  );

  /**
   * POST /api/v1/epics/:id/structured-desc/files
   * Link a file to an epic
   * Requires authentication and team membership (member+)
   */
  fastify.post<{ Params: EpicIdParams; Body: LinkFileInput }>(
    "/:id/structured-desc/files",
    {
      preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")],
      preValidation: [validateBody(linkFileSchema)],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { filePath } = request.body;
      const result = await linkFile("epic", id, filePath);
      return reply.status(201).send({ data: result });
    }
  );

  /**
   * POST /api/v1/epics/:id/structured-desc/links
   * Add an external link to an epic
   * Requires authentication and team membership (member+)
   */
  fastify.post<{ Params: EpicIdParams; Body: AddExternalLinkInput }>(
    "/:id/structured-desc/links",
    {
      preHandler: [authenticate, requireTeamAccess("id:epicId"), requireRole("member")],
      preValidation: [validateBody(addExternalLinkSchema)],
    },
    async (request, reply) => {
      const { id } = request.params;
      const { url, title } = request.body;
      const result = await addExternalLink("epic", id, { url, title });
      return reply.status(201).send({ data: result });
    }
  );
}
