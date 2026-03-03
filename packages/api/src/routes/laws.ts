import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  listLaws,
  getLaw,
  createLaw,
  updateLaw,
  deleteLaw,
} from "../services/lawService.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  createLawSchema,
  updateLawSchema,
  listLawsQuerySchema,
  type CreateLawInput,
  type UpdateLawInput,
  type ListLawsQuery,
} from "../schemas/law.js";
import { ValidationError } from "../errors/index.js";

interface LawIdParams {
  id: string;
}

/**
 * Laws routes plugin
 * Prefix: /api/v1/laws
 */
export default function lawsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): void {
  /**
   * GET /api/v1/laws
   * List laws with optional filters (severity, appliesTo, isActive, namespace)
   */
  fastify.get<{ Querystring: ListLawsQuery }>(
    "/",
    {
      preHandler: [authenticate],
      preValidation: [validateQuery(listLawsQuerySchema)],
    },
    async (request, reply) => {
      const options: {
        severity?: string;
        appliesTo?: string;
        isActive?: boolean;
        namespace?: string;
        cursor?: string;
        limit?: number;
      } = {};

      if (request.query.severity) {
        options.severity = request.query.severity;
      }
      if (request.query.appliesTo) {
        options.appliesTo = request.query.appliesTo;
      }
      if (request.query.isActive !== undefined) {
        options.isActive = request.query.isActive;
      }
      if (request.query.namespace) {
        options.namespace = request.query.namespace;
      }
      if (request.query.cursor) {
        options.cursor = request.query.cursor;
      }
      if (request.query.limit) {
        options.limit =
          typeof request.query.limit === "string"
            ? parseInt(request.query.limit as string, 10)
            : request.query.limit;
      }

      const result = await listLaws(options);
      return reply.send(result);
    }
  );

  /**
   * GET /api/v1/laws/:id
   * Get a law by ID or lawCode
   */
  fastify.get<{ Params: LawIdParams }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const law = await getLaw(request.params.id);
      if (!law) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Law '${request.params.id}' not found`,
        });
      }
      return reply.send({ data: law });
    }
  );

  /**
   * POST /api/v1/laws
   * Create a new law. When TEST_RUN env var is set, namespace is forced to 'test'.
   */
  fastify.post<{ Body: CreateLawInput }>(
    "/",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(createLawSchema)],
    },
    async (request, reply) => {
      try {
        const body = { ...request.body };
        if (process.env.TEST_RUN) {
          body.namespace = "test";
        }
        const law = await createLaw(body);
        return reply.status(201).send({ data: law });
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(409).send({
            error: "Conflict",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  /**
   * PUT /api/v1/laws/:id
   * Update an existing law
   */
  fastify.put<{ Params: LawIdParams; Body: UpdateLawInput }>(
    "/:id",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(updateLawSchema)],
    },
    async (request, reply) => {
      try {
        const law = await updateLaw(request.params.id, request.body);
        return reply.send({ data: law });
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(409).send({
            error: "Conflict",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  /**
   * DELETE /api/v1/laws/:id
   * Delete a law by ID or lawCode
   */
  fastify.delete<{ Params: LawIdParams }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      await deleteLaw(request.params.id);
      return reply.status(204).send();
    }
  );
}
