import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  listCases,
  getCase,
  fileCase,
  startHearing,
  issueVerdict,
  markCorrected,
  dismissCase,
  triggerJudgeHearing,
  patchCase,
} from "../services/caseService.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  fileCaseSchema,
  issueVerdictSchema,
  dismissCaseSchema,
  listCasesQuerySchema,
  type FileCaseInput,
  type IssueVerdictInput,
  type DismissCaseInput,
  type ListCasesQuery,
} from "../schemas/case.js";
import { ValidationError } from "../errors/index.js";

interface CaseIdParams {
  id: string;
}

/**
 * Cases routes plugin
 * Prefix: /api/v1/cases
 */
export default function casesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): void {
  /**
   * GET /api/v1/cases
   * List cases with optional filters
   */
  fastify.get<{ Querystring: ListCasesQuery }>(
    "/",
    {
      preHandler: [authenticate],
      preValidation: [validateQuery(listCasesQuerySchema)],
    },
    async (request, reply) => {
      const options: {
        status?: string;
        accusedAgent?: string;
        severity?: string;
        lawId?: string;
        cursor?: string;
        limit?: number;
      } = {};

      if (request.query.status) options.status = request.query.status;
      if (request.query.accusedAgent) options.accusedAgent = request.query.accusedAgent;
      if (request.query.severity) options.severity = request.query.severity;
      if (request.query.lawId) options.lawId = request.query.lawId;
      if (request.query.cursor) options.cursor = request.query.cursor;
      if (request.query.limit) {
        options.limit =
          typeof request.query.limit === "string"
            ? parseInt(request.query.limit as string, 10)
            : request.query.limit;
      }

      const result = await listCases(options);
      return reply.send(result);
    }
  );

  /**
   * GET /api/v1/cases/:id
   * Get case detail with related law and remediation task
   */
  fastify.get<{ Params: CaseIdParams }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const c = await getCase(request.params.id);
      return reply.send({ data: c });
    }
  );

  /**
   * POST /api/v1/cases
   * File a new case
   */
  fastify.post<{ Body: FileCaseInput }>(
    "/",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(fileCaseSchema)],
    },
    async (request, reply) => {
      const c = await fileCase(request.body);

      // ENG-115-2: Trigger Judge immediately on case filing (non-blocking)
      triggerJudgeHearing(c.id);

      return reply.status(201).send({ data: c });
    }
  );

  /**
   * PATCH /api/v1/cases/:id
   * Update case fields (e.g., remediationTaskId) — ENG-117-3
   */
  fastify.patch<{ Params: CaseIdParams; Body: { remediationTaskId?: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const c = await patchCase(request.params.id, request.body);
        return reply.send({ data: c });
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(400).send({ error: "Bad Request", message: error.message });
        }
        throw error;
      }
    }
  );

  /**
   * PUT /api/v1/cases/:id/hearing
   * Start hearing on a case
   */
  fastify.put<{ Params: CaseIdParams }>(
    "/:id/hearing",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const c = await startHearing(request.params.id);
        return reply.send({ data: c });
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(400).send({
            error: "Bad Request",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  /**
   * PUT /api/v1/cases/:id/verdict
   * Issue verdict on a case
   */
  fastify.put<{ Params: CaseIdParams; Body: IssueVerdictInput }>(
    "/:id/verdict",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(issueVerdictSchema)],
    },
    async (request, reply) => {
      try {
        const c = await issueVerdict(request.params.id, request.body);
        return reply.send({ data: c });
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(400).send({
            error: "Bad Request",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  /**
   * PUT /api/v1/cases/:id/correct
   * Mark a case as corrected
   */
  fastify.put<{ Params: CaseIdParams }>(
    "/:id/correct",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const c = await markCorrected(request.params.id);
        return reply.send({ data: c });
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(400).send({
            error: "Bad Request",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  /**
   * PUT /api/v1/cases/:id/dismiss
   * Dismiss a case
   */
  fastify.put<{ Params: CaseIdParams; Body: DismissCaseInput }>(
    "/:id/dismiss",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(dismissCaseSchema)],
    },
    async (request, reply) => {
      try {
        const c = await dismissCase(request.params.id, request.body.reason);
        return reply.send({ data: c });
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(400).send({
            error: "Bad Request",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );
}
