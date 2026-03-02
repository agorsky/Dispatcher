/**
 * ENG-E217: Pre-Flight Checklist Functional Tests
 *
 * Tests real HTTP requests against localhost:3001.
 * Covers GET /epics/:id/preflight, POST /epics/:id/preflight-override,
 * and GET /preflight-overrides listing with pagination.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API = "http://localhost:3001";
const AUTH = "Bearer st_wShsQaYUgKEL9uJosNtLlLx2bqQe0t5tVCN9DxYWIVA";
const headers = { Authorization: AUTH, "Content-Type": "application/json" };
const authOnly = { Authorization: AUTH };
const TEST_BYPASS = { Authorization: AUTH, "Content-Type": "application/json", "x-dispatcher-test": "1" };
const ts = () => Date.now();

let EPIC_ID: string;
let TEAM_ID: string;
let OVERRIDE_ID: string;

// ---------------------------------------------------------------------------
// Setup: create a test epic
// ---------------------------------------------------------------------------
beforeAll(async () => {
  // Get the first team
  const teamsRes = await fetch(`${API}/api/v1/teams`, { headers: authOnly });
  const teamsBody = await teamsRes.json();
  TEAM_ID = teamsBody.data[0].id;

  // Create a test epic without a description (skip description quality gate)
  const epicRes = await fetch(`${API}/api/v1/epics`, {
    method: "POST",
    headers: TEST_BYPASS,
    body: JSON.stringify({
      name: `Preflight Test Epic ${ts()}`,
      teamId: TEAM_ID,
    }),
  });
  const epicBody = await epicRes.json();
  EPIC_ID = epicBody.data.id;
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
afterAll(async () => {
  if (EPIC_ID) {
    await fetch(`${API}/api/v1/epics/${EPIC_ID}`, {
      method: "DELETE",
      headers: authOnly,
    }).catch(() => {});
  }
});

// ===========================================================================
// GET /epics/:id/preflight
// ===========================================================================
describe("GET /epics/:id/preflight", () => {
  it("returns 200 with preflight result for an existing epic", async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_ID}/preflight`, {
      headers: authOnly,
    });
    expect(res.status, "Should return 200").toBe(200);
    const body = await res.json();
    expect(body.data, "Should have data").toBeDefined();
    expect(body.data.epicId, "epicId should match").toBe(EPIC_ID);
    expect(typeof body.data.passed, "passed should be boolean").toBe("boolean");
    expect(Array.isArray(body.data.checks), "checks should be an array").toBe(true);
    expect(body.data.checks.length, "Should have 4 checks").toBe(4);
    expect(body.data.checkedAt, "checkedAt should be present").toBeDefined();
  });

  it("returns 401 without authentication", async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_ID}/preflight`);
    expect(res.status, "Should return 401").toBe(401);
  });

  it("returns 404 for non-existent epic ID", async () => {
    const res = await fetch(`${API}/api/v1/epics/00000000-0000-0000-0000-000000000000/preflight`, {
      headers: authOnly,
    });
    expect(res.status, "Should return 404").toBe(404);
  });

  it("includes check names for all 4 checks", async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_ID}/preflight`, {
      headers: authOnly,
    });
    const body = await res.json();
    const checkNames = body.data.checks.map((c: { checkName: string }) => c.checkName);
    expect(checkNames).toContain("Scaffold Hints");
    expect(checkNames).toContain("Acceptance Criteria");
    expect(checkNames).toContain("Task Density");
    expect(checkNames).toContain("Epic Description");
  });
});

// ===========================================================================
// POST /epics/:id/preflight-override
// ===========================================================================
describe("POST /epics/:id/preflight-override", () => {
  it("creates an override record and returns 201", async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_ID}/preflight-override`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        reason: "Overriding because this is a test environment and we need to proceed quickly",
        issues: ["Task Density", "Epic Description"],
      }),
    });
    expect(res.status, "Should return 201").toBe(201);
    const body = await res.json();
    expect(body.data, "Should have data").toBeDefined();
    expect(body.data.id, "Should have override ID").toBeDefined();
    expect(body.data.epicId, "epicId should match").toBe(EPIC_ID);
    expect(body.data.reason, "reason should be stored").toBeDefined();
    OVERRIDE_ID = body.data.id;
  });

  it("returns 401 without authentication", async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_ID}/preflight-override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Test override reason here", issues: ["Test"] }),
    });
    expect(res.status, "Should return 401").toBe(401);
  });

  it("returns 400/422 for invalid body - reason too short", async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_ID}/preflight-override`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "short", issues: ["issue1"] }),
    });
    expect([400, 422], "Should return 400 or 422 for short reason").toContain(res.status);
  });

  it("returns 400/422 for invalid body - no issues", async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_ID}/preflight-override`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "A sufficiently long reason to override the gate", issues: [] }),
    });
    expect([400, 422], "Should return 400 or 422 for empty issues").toContain(res.status);
  });

  it("returns 404 for non-existent epic ID", async () => {
    const res = await fetch(
      `${API}/api/v1/epics/00000000-0000-0000-0000-000000000000/preflight-override`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: "A sufficiently long override reason", issues: ["Test"] }),
      }
    );
    expect(res.status, "Should return 404").toBe(404);
  });
});

// ===========================================================================
// GET /preflight-overrides
// ===========================================================================
describe("GET /preflight-overrides", () => {
  it("returns 200 with override list", async () => {
    const res = await fetch(`${API}/api/v1/preflight-overrides`, { headers: authOnly });
    expect(res.status, "Should return 200").toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data), "data should be an array").toBe(true);
  });

  it("returns 401 without authentication", async () => {
    const res = await fetch(`${API}/api/v1/preflight-overrides`);
    expect(res.status, "Should return 401").toBe(401);
  });

  it("filters by epicId", async () => {
    const res = await fetch(
      `${API}/api/v1/preflight-overrides?epicId=${EPIC_ID}`,
      { headers: authOnly }
    );
    expect(res.status, "Should return 200").toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data), "data should be array").toBe(true);
    // Should contain the override we created
    const found = body.data.find((o: { id: string }) => o.id === OVERRIDE_ID);
    expect(found, "Created override should appear in filtered list").toBeDefined();
  });

  it("returns correct pagination structure", async () => {
    const res = await fetch(`${API}/api/v1/preflight-overrides?limit=5`, { headers: authOnly });
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("hasMore");
  });
});
