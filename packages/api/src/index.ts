import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import rateLimit from "@fastify/rate-limit";
import { prisma } from "./lib/db.js";
import { registerErrorHandler } from "./middleware/errorHandler.js";
import { frontDoorValidation } from "./middleware/frontDoorValidation.js";
import { NotFoundError } from "./errors/index.js";
import { initializeJwtSecret } from "./utils/jwt.js";
import { getSecretsProvider } from "./lib/secrets/index.js";
// Import status change event handler to register it
import "./events/statusChanged.js";
import usersRoutes from "./routes/users.js";
import teamsRoutes from "./routes/teams.js";
import epicsRoutes from "./routes/epics.js";
import epicRequestsRoutes from "./routes/epic-requests.js";
import statusesRoutes from "./routes/statuses.js";
import { teamMembershipsRoutes, userTeamsRoutes } from "./routes/memberships.js";
import featuresRoutes from "./routes/features.js";
import tasksRoutes, { featureTasksRoutes } from "./routes/tasks.js";
import authRoutes from "./routes/auth.js";
import tokensRoutes from "./routes/tokens.js";
import meRoutes from "./routes/me.js";
import templatesRoutes from "./routes/templates.js";
import sessionsRoutes from "./routes/sessions.js";
import decisionsRoutes from "./routes/decisions.js";
import lawsRoutes from "./routes/laws.js";
import casesRoutes from "./routes/cases.js";
import changelogRoutes from "./routes/changelog.js";
import executionPlansRoutes from "./routes/execution-plans.js";
import userActivityRoutes from "./routes/userActivity.js";
import eventsRoutes from "./routes/events.js";
import versionRoutes from "./routes/version.js";
import skillPacksRoutes from "./routes/skill-packs.js";
import settingsRoutes from "./routes/settings.js";
import agentScoresRoutes from "./routes/agent-scores.js";
import patternsRoutes from "./routes/patterns.js";
import briefingsRoutes from "./routes/briefings.js";
import preflightOverridesRoutes from "./routes/preflight-overrides.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const HOST = process.env.HOST ?? "0.0.0.0";

async function main(): Promise<void> {
  // Initialize secrets provider and load secrets
  const secretsProvider = getSecretsProvider();
  console.log(`[startup] Secrets provider: ${secretsProvider.providerName}`);
  
  // Initialize JWT secret from secrets provider
  await initializeJwtSecret();

  const fastify = Fastify({
    logger: true,
  });

  // Register plugins
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  await fastify.register(cors, {
    origin: corsOrigin.includes(",")
      ? corsOrigin.split(",").map((o) => o.trim())
      : corsOrigin,
  });
  await fastify.register(helmet);
  await fastify.register(compress);
  
  // Register rate limit plugin (allows per-route config via route.config.rateLimit)
  await fastify.register(rateLimit, {
    global: false, // Don't apply rate limiting globally, only to routes with explicit config
  });

  // Register error handler
  registerErrorHandler(fastify);

  // Validate requests originate from Azure Front Door (when configured)
  fastify.addHook("onRequest", frontDoorValidation);

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
  await fastify.register(templatesRoutes, { prefix: "/api/v1/templates" });
  await fastify.register(sessionsRoutes, { prefix: "/api/v1/sessions" });
  await fastify.register(decisionsRoutes, { prefix: "/api/v1/decisions" });
  await fastify.register(lawsRoutes, { prefix: "/api/v1/laws" });
  await fastify.register(casesRoutes, { prefix: "/api/v1/cases" });
  await fastify.register(changelogRoutes, { prefix: "/api/v1/changelog" });
  await fastify.register(executionPlansRoutes, { prefix: "/api/v1/execution-plans" });
  await fastify.register(userActivityRoutes, { prefix: "/api/v1/user-activity" });
  await fastify.register(eventsRoutes, { prefix: "/api/v1/events" });
  await fastify.register(versionRoutes, { prefix: "/api/v1/version" });
  await fastify.register(skillPacksRoutes, { prefix: "/api/v1/skill-packs" });
  await fastify.register(settingsRoutes, { prefix: "/api/v1/settings" });
  await fastify.register(agentScoresRoutes, { prefix: "/api/v1/agent-scores" });
  await fastify.register(patternsRoutes, { prefix: "/api/v1/patterns" });
  await fastify.register(briefingsRoutes, { prefix: "/api/v1/epics" });
  await fastify.register(preflightOverridesRoutes, { prefix: "/api/v1/preflight-overrides" });

  // Graceful shutdown - disconnect Prisma
  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  // Health check endpoint
  fastify.get("/health", () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Database health check - verifies Prisma connection
  fastify.get("/health/db", async () => {
    try {
      await prisma.$queryRaw`SELECT 1 as result`;
      return { status: "ok", database: "connected" };
    } catch (error) {
      return { status: "error", database: "disconnected", error: String(error) };
    }
  });

  // API routes
  fastify.get("/api/v1/status", () => {
    return {
      name: "dispatcher-api",
      version: "0.1.0",
      environment: process.env.NODE_ENV ?? "development",
    };
  });

  // =============================================================================
  // HealthCheck CRUD endpoints - for testing Prisma with Azure SQL
  // =============================================================================

  // Create a health check record
  fastify.post<{ Body: { name: string; status: string } }>(
    "/api/v1/health-checks",
    async (request, reply) => {
      const { name, status } = request.body;
      const record = await prisma.healthCheck.create({
        data: { name, status },
      });
      return reply.status(201).send(record);
    }
  );

  // Read all health check records
  fastify.get("/api/v1/health-checks", async () => {
    return prisma.healthCheck.findMany({
      orderBy: { createdAt: "desc" },
    });
  });

  // Read a single health check record by ID
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/health-checks/:id",
    async (request) => {
      const id = parseInt(request.params.id, 10);
      const record = await prisma.healthCheck.findUnique({
        where: { id },
      });
      if (!record) {
        throw new NotFoundError("Health check record not found", { id });
      }
      return record;
    }
  );

  // Update a health check record
  fastify.put<{ Params: { id: string }; Body: { name?: string; status?: string } }>(
    "/api/v1/health-checks/:id",
    async (request) => {
      const id = parseInt(request.params.id, 10);
      const { name, status } = request.body;

      // Check if record exists first
      const existing = await prisma.healthCheck.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundError("Health check record not found", { id });
      }

      const record = await prisma.healthCheck.update({
        where: { id },
        data: { ...(name && { name }), ...(status && { status }) },
      });
      return record;
    }
  );

  // Delete a health check record
  fastify.delete<{ Params: { id: string } }>(
    "/api/v1/health-checks/:id",
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);

      // Check if record exists first
      const existing = await prisma.healthCheck.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundError("Health check record not found", { id });
      }

      await prisma.healthCheck.delete({
        where: { id },
      });
      return reply.status(204).send();
    }
  );

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Server is running on http://${HOST}:${String(PORT)}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main().catch(console.error);
