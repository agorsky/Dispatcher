import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { authenticate } from "../middleware/authenticate.js";
import { listOverrides } from "../services/preflightService.js";

interface ListOverridesQuery {
  epicId?: string;
  cursor?: string;
  limit?: string;
}

/**
 * Preflight Overrides routes plugin
 * Prefix: /api/v1/preflight-overrides
 */
export default function preflightOverridesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): void {
  /**
   * GET /api/v1/preflight-overrides
   * List pre-flight overrides with cursor-based pagination
   * Optional epicId query param to filter by epic
   * Requires authentication
   */
  fastify.get<{ Querystring: ListOverridesQuery }>(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { epicId, cursor, limit } = request.query;
      const options: { epicId?: string; cursor?: string; limit?: number } = {
        limit: limit ? parseInt(limit, 10) : 20,
      };
      if (epicId) options.epicId = epicId;
      if (cursor) options.cursor = cursor;
      const result = await listOverrides(options);
      return reply.send(result);
    }
  );
}
