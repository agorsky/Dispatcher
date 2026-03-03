/**
 * Plan Scoring API Routes
 *
 * GET /api/v1/epics/:id/score       — Score epic plan quality
 * GET /api/v1/epics/:id/validate-tasks — Validate task completeness
 */

import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate } from "../middleware/authenticate.js";
import { scoreEpicPlan, validateTaskCompleteness } from "../services/plan-scoring.js";
import { NotFoundError } from "../errors/index.js";

interface EpicIdParams {
  id: string;
}

export default async function planScoringRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/v1/epics/:id/score
  fastify.get<{ Params: EpicIdParams }>(
    "/:id/score",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const result = await scoreEpicPlan(id);
        return reply.code(200).send({ data: result });
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.code(404).send({ error: { message: error.message } });
        }
        throw error;
      }
    }
  );

  // GET /api/v1/epics/:id/validate-tasks
  fastify.get<{ Params: EpicIdParams }>(
    "/:id/validate-tasks",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const result = await validateTaskCompleteness(id);
        return reply.code(200).send({ data: result });
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.code(404).send({ error: { message: error.message } });
        }
        throw error;
      }
    }
  );
}
