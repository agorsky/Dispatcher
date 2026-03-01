import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  getScore,
  getLeaderboard,
  adjustScore,
  getScoreEvents,
  getScoreDelta7Day,
  checkZeroViolationBonus,
  setLastAudit,
} from "../services/agentScoreService.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validate.js";
import {
  adjustScoreSchema,
  type AdjustScoreInput,
} from "../schemas/agentScore.js";

interface AgentNameParams {
  agentName: string;
}

/**
 * Agent Scores routes plugin
 * Prefix: /api/v1/agent-scores
 */
export default function agentScoresRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): void {
  /**
   * GET /api/v1/agent-scores
   * Leaderboard — all agents sorted by totalScore desc, with rank
   */
  fastify.get(
    "/",
    { preHandler: [authenticate] },
    async (_request, reply) => {
      const agents = await getLeaderboard();
      const ranked = agents.map((agent, index) => ({
        rank: index + 1,
        ...agent,
      }));
      return reply.send({ data: ranked });
    }
  );

  /**
   * GET /api/v1/agent-scores/:agentName
   * Single agent score
   */
  fastify.get<{ Params: AgentNameParams }>(
    "/:agentName",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const agent = await getScore(request.params.agentName);
      return reply.send({ data: agent });
    }
  );

  /**
   * GET /api/v1/agent-scores/:agentName/events
   * Score event history (merit/deduction ledger) for an agent
   */
  fastify.get<{
    Params: AgentNameParams;
    Querystring: { limit?: number; cursor?: string };
  }>(
    "/:agentName/events",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const opts: { limit?: number; cursor?: string } = {};
      if (request.query.limit) opts.limit = Number(request.query.limit);
      if (request.query.cursor) opts.cursor = request.query.cursor;
      const result = await getScoreEvents(request.params.agentName, opts);
      return reply.send(result);
    }
  );

  /**
   * GET /api/v1/agent-scores/:agentName/delta
   * 7-day score delta for an agent
   */
  fastify.get<{ Params: AgentNameParams }>(
    "/:agentName/delta",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const delta = await getScoreDelta7Day(request.params.agentName);
      return reply.send({ data: { agentName: request.params.agentName, delta7Day: delta } });
    }
  );

  /**
   * POST /api/v1/agent-scores/:agentName/check-zero-violation-bonus
   * Barney calls this after a clean audit pass to award 7-day zero-violation bonus
   */
  fastify.post<{ Params: AgentNameParams }>(
    "/:agentName/check-zero-violation-bonus",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const awarded = await checkZeroViolationBonus(request.params.agentName);
      return reply.send({ data: { agentName: request.params.agentName, bonusAwarded: awarded } });
    }
  );

  /**
   * POST /api/v1/agent-scores/:agentName/set-last-audit
   * Barney calls this after completing an audit pass on an agent
   */
  fastify.post<{ Params: AgentNameParams }>(
    "/:agentName/set-last-audit",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const agent = await setLastAudit(request.params.agentName);
      return reply.send({ data: agent });
    }
  );

  /**
   * PUT /api/v1/agent-scores/:agentName/adjust
   * Manual score adjustment
   */
  fastify.put<{ Params: AgentNameParams; Body: AdjustScoreInput }>(
    "/:agentName/adjust",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(adjustScoreSchema)],
    },
    async (request, reply) => {
      const { delta, reason } = request.body;
      const agent = await adjustScore(
        request.params.agentName,
        delta,
        reason
      );
      return reply.send({ data: agent });
    }
  );
}
