/**
 * Integration Tests: Session Events Query API (ENG-40)
 *
 * Tests the GET /api/v1/sessions/:epicId/events endpoint:
 * - Returns 200 with valid authentication and epicId
 * - Filters events by since, sessionId: null as any, eventTypes
 * - Returns cursor-based pagination metadata
 * - Returns computed progress state
 * - Returns 401 without authentication
 * - Query validation errors return 400
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import Fastify from "fastify";
import { getTestPrisma, cleanupTestDatabase } from "../setup.js";
import sessionRoutes from "../../src/routes/sessions.js";
import {
  createTestUser,
  createTestTeam,
  createTestEpic,
  createTestStatus,
  createTestFeature,
  createTestTask,
} from "../fixtures/factories.js";
import { generateAccessToken } from "../../src/utils/jwt.js";
import { persistSessionEvent } from "../../src/services/sessionEventService.js";
import { SessionEventType } from "@dispatcher/shared";
import type { SessionEvent } from "@dispatcher/shared";

describe("GET /api/v1/sessions/:epicId/events", () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let app: ReturnType<typeof Fastify>;
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let team: Awaited<ReturnType<typeof createTestTeam>>;
  let epic: Awaited<ReturnType<typeof createTestEpic>>;
  let sessionId: string;
  let token: string;

  beforeAll(async () => {
    prisma = getTestPrisma();

    // Create Fastify app for testing
    app = Fastify();
    await app.register(sessionRoutes, { prefix: "/api/v1/sessions" });

    await app.listen({ port: 0 }); // Random available port
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();

    // Create test entities
    user = await createTestUser({
      email: "test@example.com",
      name: "Test User",
    });
    team = await createTestTeam({ name: "Test Team", key: "TEST" });
    epic = await createTestEpic(team.id, { name: "Test Epic" });

    // Create an AiSession for the epic (needed for SessionEvent foreign key)
    const aiSession = await prisma.aiSession.create({
      data: {
        epicId: epic.id,
        startedAt: new Date(),
        status: "active",
      },
    });
    sessionId = aiSession.id;

    // Generate JWT token
    token = generateAccessToken(user.id);
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  it("should return 401 without authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
    });

    expect(response.statusCode).toBe(401);
  });

  // ==========================================================================
  // Basic Query Tests
  // ==========================================================================

  it("should return 200 with empty events list for new epic", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("events");
    expect(body.data.events).toEqual([]);
    expect(body.data).toHaveProperty("nextCursor", null);
    expect(body.data).toHaveProperty("totalCount", 0);
    expect(body.data).toHaveProperty("progress");
  });

  it("should return events for epic with session events", async () => {
    // Create some test events
    const event1: SessionEvent = {
      epicId: epic.id,
      sessionId: null as any, // No session association needed for this test
      timestamp: new Date("2026-02-13T10:00:00Z").toISOString(),
      eventType: SessionEventType.SESSION_STARTED,
      payload: {
        status: "active",
        totalFeatures: 3,
        totalTasks: 10,
      },
    };
    const event2: SessionEvent = {
      epicId: epic.id,
      sessionId: null as any, // No session association needed for this test
      timestamp: new Date("2026-02-13T10:01:00Z").toISOString(),
      eventType: SessionEventType.SESSION_FEATURE_STARTED,
      payload: {
        featureId: "feature-456",
        identifier: "TEST-1",
        title: "Feature 1",
        taskCount: 3,
      },
    };

    await persistSessionEvent(event1);
    await persistSessionEvent(event2);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.events).toHaveLength(2);
    expect(body.data.totalCount).toBe(2);
    expect(body.data.events[0].eventType).toBe(SessionEventType.SESSION_STARTED);
    expect(body.data.events[1].eventType).toBe(
      SessionEventType.SESSION_FEATURE_STARTED
    );
  });

  // ==========================================================================
  // Filtering Tests
  // ==========================================================================

  it("should filter events by since parameter", async () => {
    // No sessionId needed for these tests (field is nullable)
    const event1: SessionEvent = {
      epicId: epic.id,
      sessionId: null as any,
      timestamp: new Date("2026-02-13T10:00:00Z").toISOString(),
      eventType: SessionEventType.SESSION_STARTED,
      payload: { status: "active" },
    };
    const event2: SessionEvent = {
      epicId: epic.id,
      sessionId: null as any,
      timestamp: new Date("2026-02-13T10:05:00Z").toISOString(),
      eventType: SessionEventType.SESSION_FEATURE_STARTED,
      payload: {
        featureId: "feature-456",
        identifier: "TEST-1",
        title: "Feature 1",
      },
    };

    await persistSessionEvent(event1);
    await persistSessionEvent(event2);

    // Query events since 10:02:00 (should only return event2)
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events?since=2026-02-13T10:02:00Z`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0].eventType).toBe(
      SessionEventType.SESSION_FEATURE_STARTED
    );
  });

  it("should filter events by sessionId parameter", async () => {
    // Create two different sessions
    const session1 = await prisma.aiSession.create({
      data: {
        epicId: epic.id,
        startedAt: new Date("2026-02-13T09:00:00Z"),
        status: "active",
      },
    });
    const session2 = await prisma.aiSession.create({
      data: {
        epicId: epic.id,
        startedAt: new Date("2026-02-13T09:30:00Z"),
        status: "active",
      },
    });

    const event1: SessionEvent = {
      epicId: epic.id,
      sessionId: session1.id,
      timestamp: new Date("2026-02-13T10:00:00Z").toISOString(),
      eventType: SessionEventType.SESSION_STARTED,
      payload: { status: "active" },
    };
    const event2: SessionEvent = {
      epicId: epic.id,
      sessionId: session2.id,
      timestamp: new Date("2026-02-13T10:05:00Z").toISOString(),
      eventType: SessionEventType.SESSION_STARTED,
      payload: { status: "active" },
    };

    await persistSessionEvent(event1);
    await persistSessionEvent(event2);

    // Query events for session1
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events?sessionId=${session1.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0].sessionId).toBe(session1.id);
  });

  it("should filter events by eventTypes parameter", async () => {
    // No sessionId needed for these tests (field is nullable)
    const event1: SessionEvent = {
      epicId: epic.id,
      sessionId: null as any,
      timestamp: new Date("2026-02-13T10:00:00Z").toISOString(),
      eventType: SessionEventType.SESSION_STARTED,
      payload: { status: "active" },
    };
    const event2: SessionEvent = {
      epicId: epic.id,
      sessionId: null as any,
      timestamp: new Date("2026-02-13T10:01:00Z").toISOString(),
      eventType: SessionEventType.SESSION_FEATURE_STARTED,
      payload: {
        featureId: "feature-456",
        identifier: "TEST-1",
        title: "Feature 1",
      },
    };
    const event3: SessionEvent = {
      epicId: epic.id,
      sessionId: null as any,
      timestamp: new Date("2026-02-13T10:02:00Z").toISOString(),
      eventType: SessionEventType.SESSION_TASK_STARTED,
      payload: {
        taskId: "task-789",
        identifier: "TEST-1-1",
        title: "Task 1",
        featureId: "feature-456",
        featureIdentifier: "TEST-1",
      },
    };

    await persistSessionEvent(event1);
    await persistSessionEvent(event2);
    await persistSessionEvent(event3);

    // Query only SESSION_STARTED and SESSION_FEATURE_STARTED events
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events?eventTypes=SESSION_STARTED,SESSION_FEATURE_STARTED`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.events).toHaveLength(2);
    expect(body.data.events[0].eventType).toBe(SessionEventType.SESSION_STARTED);
    expect(body.data.events[1].eventType).toBe(
      SessionEventType.SESSION_FEATURE_STARTED
    );
  });

  // ==========================================================================
  // Pagination Tests
  // ==========================================================================

  it("should respect limit parameter", async () => {
    // No sessionId needed for these tests (field is nullable)

    // Create 5 events
    for (let i = 0; i < 5; i++) {
      const event: SessionEvent = {
        epicId: epic.id,
        sessionId: null as any,
        timestamp: new Date(`2026-02-13T10:0${i}:00Z`).toISOString(),
        eventType: SessionEventType.SESSION_FEATURE_STARTED,
        payload: {
          featureId: `feature-${i}`,
          identifier: `TEST-${i}`,
          title: `Feature ${i}`,
        },
      };
      await persistSessionEvent(event);
    }

    // Query with limit=2
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events?limit=2`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.events).toHaveLength(2);
    expect(body.data.nextCursor).not.toBeNull();
    expect(body.data.totalCount).toBe(5);
  });

  // ==========================================================================
  // Progress State Tests
  // ==========================================================================

  it("should return computed progress state with zero values for empty epic", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.progress).toMatchObject({
      currentPhase: null,
      lastCompletedPhase: null,
      totalPhases: null,
      progressPercentage: 0,
      totalFeatures: 0,
      completedFeatures: 0,
      totalTasks: 0,
      completedTasks: 0,
    });
  });

  it("should return DB-sourced task/feature counts (not event-derived)", async () => {
    // ENG-E218: Progress counts come from DB, not from SESSION_STARTED event payload.
    // Create 5 features with 4 tasks each = 20 tasks in DB.
    const doneStatus = await createTestStatus(team.id, {
      name: "Done",
      category: "completed",
    });
    for (let i = 0; i < 5; i++) {
      const feature = await createTestFeature(epic.id);
      for (let j = 0; j < 4; j++) {
        await createTestTask(feature.id);
      }
    }

    // Persist a SESSION_STARTED event with different totals than DB
    // (events said 3/10, DB has 5/20 — DB should win)
    const event: SessionEvent = {
      epicId: epic.id,
      sessionId: null as any,
      timestamp: new Date("2026-02-13T10:00:00Z").toISOString(),
      eventType: SessionEventType.SESSION_STARTED,
      payload: {
        status: "active",
        totalFeatures: 3, // intentionally wrong
        totalTasks: 10,   // intentionally wrong
      },
    };

    await persistSessionEvent(event);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // DB wins: 5 features, 20 tasks (not 3/10 from event)
    expect(body.data.progress).toMatchObject({
      totalFeatures: 5,
      totalTasks: 20,
      completedFeatures: 0,
      completedTasks: 0,
      progressPercentage: 0,
    });
  });

  it("should return DB-sourced completion counts regardless of events", async () => {
    // ENG-E218: Create real DB entities with statuses to verify DB-sourced counts.
    const doneStatus = await createTestStatus(team.id, {
      name: "Done",
      category: "completed",
    });
    const todoStatus = await createTestStatus(team.id, {
      name: "Todo",
      category: "unstarted",
    });

    // 3 features, 3 tasks each = 9 tasks total
    // Feature 1: completed, all 3 tasks completed
    const feat1 = await createTestFeature(epic.id, { statusId: doneStatus.id });
    const task1 = await createTestTask(feat1.id, { statusId: doneStatus.id });
    await createTestTask(feat1.id, { statusId: todoStatus.id });
    await createTestTask(feat1.id, { statusId: todoStatus.id });

    // Features 2 and 3: todo status, no tasks completed
    const feat2 = await createTestFeature(epic.id, { statusId: todoStatus.id });
    await createTestTask(feat2.id, { statusId: todoStatus.id });
    await createTestTask(feat2.id, { statusId: todoStatus.id });
    await createTestTask(feat2.id, { statusId: todoStatus.id });

    const feat3 = await createTestFeature(epic.id, { statusId: todoStatus.id });
    await createTestTask(feat3.id, { statusId: todoStatus.id });
    await createTestTask(feat3.id, { statusId: todoStatus.id });
    await createTestTask(feat3.id, { statusId: todoStatus.id });

    // Emit only TASK_COMPLETED for task1 (1 event, but DB shows 1 done)
    await persistSessionEvent({
      epicId: epic.id,
      sessionId: null as any,
      timestamp: new Date("2026-02-13T10:05:00Z").toISOString(),
      eventType: SessionEventType.SESSION_TASK_COMPLETED,
      payload: {
        taskId: task1.id,
        identifier: task1.identifier,
        title: task1.title,
        featureId: feat1.id,
        featureIdentifier: feat1.identifier,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // DB: 3 total features, 1 completed; 9 total tasks, 1 completed
    expect(body.data.progress).toMatchObject({
      totalFeatures: 3,
      totalTasks: 9,
      completedFeatures: 1,
      completedTasks: 1,
      progressPercentage: 11, // 1/9 = 11%
    });
  });

  // ==========================================================================
  // Validation Error Tests
  // ==========================================================================

  it("should return 400 for invalid epicId format", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/invalid-uuid/events`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should return 400 for invalid since format", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events?since=invalid-date`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should return 400 for invalid limit value", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events?limit=999`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

// =============================================================================
// ENG-E217 Regression: DB-Sourced Task Counts
// =============================================================================

describe("ENG-E217 regression: DB-sourced task counts", () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let app: ReturnType<typeof Fastify>;
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let team: Awaited<ReturnType<typeof createTestTeam>>;
  let epic: Awaited<ReturnType<typeof createTestEpic>>;
  let token: string;
  let doneStatus: Awaited<ReturnType<typeof createTestStatus>>;
  let todoStatus: Awaited<ReturnType<typeof createTestStatus>>;

  beforeAll(async () => {
    prisma = getTestPrisma();
    app = Fastify();
    await app.register(sessionRoutes, { prefix: "/api/v1/sessions" });
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestDatabase();

    user = await createTestUser();
    team = await createTestTeam();
    epic = await createTestEpic(team.id);
    token = generateAccessToken(user.id);

    doneStatus = await createTestStatus(team.id, {
      name: "Done",
      category: "completed",
    });
    todoStatus = await createTestStatus(team.id, {
      name: "Todo",
      category: "unstarted",
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: All 18 tasks completed in DB, no events
  // ---------------------------------------------------------------------------
  it("Scenario 1: all 18 tasks completed in DB, events endpoint shows 18/18", async () => {
    // Create 3 features × 6 tasks = 18 tasks, all completed in DB
    for (let f = 0; f < 3; f++) {
      const feature = await createTestFeature(epic.id, { statusId: doneStatus.id });
      for (let t = 0; t < 6; t++) {
        await createTestTask(feature.id, { statusId: doneStatus.id });
      }
    }

    // NO session events at all
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.progress.completedTasks).toBe(18);
    expect(body.data.progress.totalTasks).toBe(18);
    expect(body.data.progress.completedFeatures).toBe(3);
    expect(body.data.progress.totalFeatures).toBe(3);
    expect(body.data.progress.progressPercentage).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: 10/18 tasks completed in DB, only 2 SESSION_TASK_COMPLETED events
  // DB count should win over event count.
  // ---------------------------------------------------------------------------
  it("Scenario 2: DB shows 10/18 completed but only 2 TASK_COMPLETED events — DB wins", async () => {
    const features: Awaited<ReturnType<typeof createTestFeature>>[] = [];
    const tasks: Awaited<ReturnType<typeof createTestTask>>[] = [];

    // Create 3 features × 6 tasks = 18 tasks total
    for (let f = 0; f < 3; f++) {
      const feature = await createTestFeature(epic.id, { statusId: todoStatus.id });
      features.push(feature);
      for (let t = 0; t < 6; t++) {
        // Mark first 10 tasks as done, rest as todo
        const isDone = tasks.length < 10;
        const task = await createTestTask(feature.id, {
          statusId: isDone ? doneStatus.id : todoStatus.id,
        });
        tasks.push(task);
      }
    }

    // Emit only 2 TASK_COMPLETED events (not the full 10)
    for (let i = 0; i < 2; i++) {
      await persistSessionEvent({
        epicId: epic.id,
        sessionId: null as any,
        timestamp: new Date(`2026-02-13T10:0${i}:00Z`).toISOString(),
        eventType: SessionEventType.SESSION_TASK_COMPLETED,
        payload: {
          taskId: tasks[i]!.id,
          identifier: tasks[i]!.identifier,
          title: tasks[i]!.title,
          featureId: features[Math.floor(i / 6)]!.id,
          featureIdentifier: features[Math.floor(i / 6)]!.identifier,
        },
      });
    }

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    // DB says 10 completed, not 2 from events
    expect(body.data.progress.completedTasks).toBe(10);
    expect(body.data.progress.totalTasks).toBe(18);
    expect(body.data.progress.progressPercentage).toBe(56); // 10/18 = 55.5% -> 56%
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: All tasks completed in DB, zero session events
  // ---------------------------------------------------------------------------
  it("Scenario 3: zero events, all tasks completed in DB — endpoint returns correct counts", async () => {
    // 5 features, 4 tasks each = 20 tasks, all done
    for (let f = 0; f < 5; f++) {
      const feature = await createTestFeature(epic.id, { statusId: doneStatus.id });
      for (let t = 0; t < 4; t++) {
        await createTestTask(feature.id, { statusId: doneStatus.id });
      }
    }

    // Zero events persisted
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${epic.id}/events`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Progress counts from DB
    expect(body.data.progress.totalFeatures).toBe(5);
    expect(body.data.progress.completedFeatures).toBe(5);
    expect(body.data.progress.totalTasks).toBe(20);
    expect(body.data.progress.completedTasks).toBe(20);
    expect(body.data.progress.progressPercentage).toBe(100);

    // No events present
    expect(body.data.events).toHaveLength(0);

    // Phase data may come from derivePhaseFromDatabase fallback since there
    // are no events. The exact values depend on feature executionOrder setup,
    // but currentPhase should be null (all features completed, no active phase).
    expect(body.data.progress.currentPhase).toBeNull();
  });
});
