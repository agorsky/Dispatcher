/**
 * Test App Builder for SpecTree API Integration Tests
 *
 * Creates a Fastify app instance configured for testing.
 * This mirrors the main app setup but without starting the server.
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import { registerErrorHandler } from "../../src/middleware/errorHandler.js";
import usersRoutes from "../../src/routes/users.js";
import teamsRoutes from "../../src/routes/teams.js";
import epicsRoutes from "../../src/routes/epics.js";
import epicRequestsRoutes from "../../src/routes/epic-requests.js";
import statusesRoutes from "../../src/routes/statuses.js";
import { teamMembershipsRoutes, userTeamsRoutes } from "../../src/routes/memberships.js";
import featuresRoutes from "../../src/routes/features.js";
import tasksRoutes, { featureTasksRoutes } from "../../src/routes/tasks.js";
import authRoutes from "../../src/routes/auth.js";
import tokensRoutes from "../../src/routes/tokens.js";
import meRoutes from "../../src/routes/me.js";
import userActivityRoutes from "../../src/routes/userActivity.js";
import changelogRoutes from "../../src/routes/changelog.js";

/**
 * Builds and configures a Fastify app instance for testing.
 * Does not start the server - use app.inject() for testing.
 *
 * @returns Configured Fastify app instance
 *
 * @example
 * const app = await buildTestApp();
 * await app.ready();
 *
 * const response = await app.inject({
 *   method: 'GET',
 *   url: '/api/v1/users',
 *   headers: { Authorization: 'Bearer token' }
 * });
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false, // Disable logging in tests for cleaner output
  });

  // Register plugins
  await fastify.register(cors, {
    origin: "*", // Allow all origins in tests
  });
  await fastify.register(helmet);
  await fastify.register(compress);

  // Register error handler
  registerErrorHandler(fastify);

  // Register route plugins
  await fastify.register(usersRoutes, { prefix: "/api/v1/users" });
  await fastify.register(teamsRoutes, { prefix: "/api/v1/teams" });
  await fastify.register(epicsRoutes, { prefix: "/api/v1/epics" });
  await fastify.register(epicRequestsRoutes, { prefix: "/api/v1/epic-requests" });
  await fastify.register(statusesRoutes, { prefix: "/api/v1/statuses" });
  await fastify.register(teamMembershipsRoutes, { prefix: "/api/v1/teams" });
  await fastify.register(userTeamsRoutes, { prefix: "/api/v1/users" });
  await fastify.register(featuresRoutes, { prefix: "/api/v1/features" });
  await fastify.register(featureTasksRoutes, { prefix: "/api/v1/features" });
  await fastify.register(tasksRoutes, { prefix: "/api/v1/tasks" });
  await fastify.register(authRoutes, { prefix: "/api/v1/auth" });
  await fastify.register(tokensRoutes, { prefix: "/api/v1/tokens" });
  await fastify.register(meRoutes, { prefix: "/api/v1/me" });
  await fastify.register(userActivityRoutes, { prefix: "/api/v1/user-activity" });
  await fastify.register(changelogRoutes, { prefix: "/api/v1/changelog" });

  // Health check endpoint (for testing)
  fastify.get("/health", () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // API status endpoint
  fastify.get("/api/v1/status", () => {
    return {
      name: "spectree-api",
      version: "0.1.0",
      environment: "test",
    };
  });

  return fastify;
}
