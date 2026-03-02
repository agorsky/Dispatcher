/**
 * Integration tests for Epic description quality validation gates.
 *
 * Tests ENG-172 (POST /api/v1/epics and PUT /api/v1/epics/:id validation)
 * and ENG-174 (X-Dispatcher-Test bypass header).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import {
  createAuthenticatedTeamMember,
  setupTestDatabase,
  cleanupTestDatabase,
  disconnectTestDatabase,
} from "../fixtures/index.js";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a string with exactly n words */
function wordsOf(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

/** A minimal valid epic description: 500+ words, all 4 required section headings */
function validEpicDescription(): string {
  const body = wordsOf(520);
  return [
    "## Overview",
    body,
    "## Problem Statement",
    "This section explains the problem.",
    "## Proposed Approach",
    "This section explains the approach.",
    "## Success Criteria",
    "This section explains the criteria.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let app: FastifyInstance;

beforeAll(async () => {
  await setupTestDatabase();
  app = await buildTestApp();
  await app.ready();
});

afterEach(async () => {
  await cleanupTestDatabase();
});

afterAll(async () => {
  await app.close();
  await disconnectTestDatabase();
});

// ---------------------------------------------------------------------------
// POST /api/v1/epics — validation
// ---------------------------------------------------------------------------

describe("POST /api/v1/epics — description validation", () => {
  it("returns 422 when description is under 500 words", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers,
      payload: {
        name: "Short Epic",
        teamId: team.id,
        description: "Too short.",
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      error: string;
      violations: Array<{ check: string; expected: string; actual: string; message: string }>;
    };
    expect(body.error).toBe("Unprocessable Entity");
    expect(body.violations).toBeDefined();
    const wordViolation = body.violations.find((v) => v.check === "word_count");
    expect(wordViolation).toBeDefined();
    expect(wordViolation?.expected).toContain("500");
  });

  it("returns 422 when description is missing required section headers", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    // 500+ words but no section headings
    const descNoSections = wordsOf(520);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers,
      payload: {
        name: "No Sections Epic",
        teamId: team.id,
        description: descNoSections,
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      violations: Array<{ check: string }>;
    };
    const sectionViolations = body.violations.filter((v) => v.check === "section_missing");
    expect(sectionViolations.length).toBe(4);
  });

  it("returns 422 listing which specific sections are missing", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    // Has Overview and Problem only, missing Approach and Success
    const desc = `## Overview\n${wordsOf(520)}\n## Problem Statement\ndetail`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers,
      payload: {
        name: "Partial Sections Epic",
        teamId: team.id,
        description: desc,
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      violations: Array<{ check: string; message: string }>;
    };
    const missing = body.violations.filter((v) => v.check === "section_missing");
    expect(missing.length).toBe(2);
    const messages = missing.map((v) => v.message);
    expect(messages.some((m) => m.includes("Approach"))).toBe(true);
    expect(messages.some((m) => m.includes("Success"))).toBe(true);
  });

  it("returns 201 when description meets all quality requirements", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers,
      payload: {
        name: "Quality Epic",
        teamId: team.id,
        description: validEpicDescription(),
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as { data: { name: string } };
    expect(body.data.name).toBe("Quality Epic");
  });

  it("returns 201 when no description is provided (not required)", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers,
      payload: {
        name: "No Description Epic",
        teamId: team.id,
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it("violation objects include check, expected, actual, and message fields", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers,
      payload: {
        name: "Bad Epic",
        teamId: team.id,
        description: "short",
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      violations: Array<{ check: string; expected: string; actual: string; message: string }>;
    };
    for (const v of body.violations) {
      expect(v).toHaveProperty("check");
      expect(v).toHaveProperty("expected");
      expect(v).toHaveProperty("actual");
      expect(v).toHaveProperty("message");
    }
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/epics/:id — validation
// ---------------------------------------------------------------------------

describe("PUT /api/v1/epics/:id — description validation", () => {
  it("returns 422 when update description is under 500 words", async () => {
    const { headers, team, user } = await createAuthenticatedTeamMember();

    // First create a valid epic using bypass header
    const createResp = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers: { ...headers, "x-dispatcher-test": "1" },
      payload: { name: "Epic to Update", teamId: team.id, description: "initial" },
    });
    expect(createResp.statusCode).toBe(201);
    const created = JSON.parse(createResp.body) as { data: { id: string } };

    // Now try to update with a bad description
    const updateResp = await app.inject({
      method: "PUT",
      url: `/api/v1/epics/${created.data.id}`,
      headers,
      payload: { description: "Too short for quality." },
    });

    expect(updateResp.statusCode).toBe(422);
    const body = JSON.parse(updateResp.body) as { violations: Array<{ check: string }> };
    expect(body.violations.some((v) => v.check === "word_count")).toBe(true);
  });

  it("returns 200 when update description meets quality requirements", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const createResp = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers: { ...headers, "x-dispatcher-test": "1" },
      payload: { name: "Epic to Update", teamId: team.id },
    });
    expect(createResp.statusCode).toBe(201);
    const created = JSON.parse(createResp.body) as { data: { id: string } };

    const updateResp = await app.inject({
      method: "PUT",
      url: `/api/v1/epics/${created.data.id}`,
      headers,
      payload: { description: validEpicDescription() },
    });

    expect(updateResp.statusCode).toBe(200);
  });

  it("allows update without description field (no validation triggered)", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const createResp = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers: { ...headers, "x-dispatcher-test": "1" },
      payload: { name: "Epic to Rename", teamId: team.id },
    });
    expect(createResp.statusCode).toBe(201);
    const created = JSON.parse(createResp.body) as { data: { id: string } };

    const updateResp = await app.inject({
      method: "PUT",
      url: `/api/v1/epics/${created.data.id}`,
      headers,
      payload: { name: "New Name" },
    });

    expect(updateResp.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// ENG-174: X-Dispatcher-Test bypass header
// ---------------------------------------------------------------------------

describe("X-Dispatcher-Test bypass header", () => {
  it("POST /api/v1/epics allows minimal description with bypass header", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers: { ...headers, "x-dispatcher-test": "1" },
      payload: {
        name: "Test Epic",
        teamId: team.id,
        description: "short description for integration test",
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it("PUT /api/v1/epics/:id allows minimal description with bypass header", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const createResp = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers: { ...headers, "x-dispatcher-test": "1" },
      payload: { name: "Bypass Test Epic", teamId: team.id },
    });
    expect(createResp.statusCode).toBe(201);
    const created = JSON.parse(createResp.body) as { data: { id: string } };

    const updateResp = await app.inject({
      method: "PUT",
      url: `/api/v1/epics/${created.data.id}`,
      headers: { ...headers, "x-dispatcher-test": "1" },
      payload: { description: "minimal update for test" },
    });

    expect(updateResp.statusCode).toBe(200);
  });

  it("without bypass header, minimal description returns 422", async () => {
    const { headers, team } = await createAuthenticatedTeamMember();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epics",
      headers, // no bypass header
      payload: {
        name: "Bad Epic",
        teamId: team.id,
        description: "minimal description without bypass",
      },
    });

    expect(response.statusCode).toBe(422);
  });
});
