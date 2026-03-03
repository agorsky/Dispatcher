/**
 * ENG-E220: Dependency API Integration Tests
 *
 * Tests REAL HTTP requests against localhost:3001 for the cross-epic
 * dependency graph feature: setting deps, dispatch blocking, overrides,
 * circular detection, and unknown-epic rejection.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API = 'http://localhost:3001';
const AUTH = 'Bearer st_wShsQaYUgKEL9uJosNtLlLx2bqQe0t5tVCN9DxYWIVA';
const headers = { Authorization: AUTH, 'Content-Type': 'application/json' };
const ts = () => Date.now();

let TEAM_ID: string;
let EPIC_A_ID: string; // dependency (must be completed first)
let EPIC_B_ID: string; // depends on A

// ---------------------------------------------------------------------------
// Setup: resolve team and create two test epics
// ---------------------------------------------------------------------------
beforeAll(async () => {
  const teamsRes = await fetch(`${API}/api/v1/teams`, { headers });
  const teamsBody = await teamsRes.json();
  TEAM_ID = teamsBody.data[0].id;

  // Create EPIC_A (the dependency)
  const aRes = await fetch(`${API}/api/v1/epics`, {
    method: 'POST',
    headers: { ...headers, 'X-Dispatcher-Test': 'true' },
    body: JSON.stringify({ name: `DEP-A-${ts()}`, teamId: TEAM_ID }),
  });
  const aBody = await aRes.json();
  EPIC_A_ID = aBody.data.id;

  // Create EPIC_B (depends on A)
  const bRes = await fetch(`${API}/api/v1/epics`, {
    method: 'POST',
    headers: { ...headers, 'X-Dispatcher-Test': 'true' },
    body: JSON.stringify({ name: `DEP-B-${ts()}`, teamId: TEAM_ID }),
  });
  const bBody = await bRes.json();
  EPIC_B_ID = bBody.data.id;
});

afterAll(async () => {
  // Clean up test epics
  if (EPIC_A_ID) {
    await fetch(`${API}/api/v1/epics/${EPIC_A_ID}`, { method: 'DELETE', headers });
  }
  if (EPIC_B_ID) {
    await fetch(`${API}/api/v1/epics/${EPIC_B_ID}`, { method: 'DELETE', headers });
  }
});

// ===========================================================================
// 1. Setting dependencies on epic update
// ===========================================================================
describe('Setting dependencies via PUT /epics/:id', () => {
  it('sets valid dependencies on an epic', async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_B_ID}`, {
      method: 'PUT',
      headers: { ...headers, 'X-Dispatcher-Test': 'true' },
      body: JSON.stringify({ dependencies: JSON.stringify([EPIC_A_ID]) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dependencies).toBe(JSON.stringify([EPIC_A_ID]));
  });

  it('rejects self-referential dependency', async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_B_ID}`, {
      method: 'PUT',
      headers: { ...headers, 'X-Dispatcher-Test': 'true' },
      body: JSON.stringify({ dependencies: JSON.stringify([EPIC_B_ID]) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot depend on itself/i);
  });

  it('rejects non-existent dependency UUID', async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_B_ID}`, {
      method: 'PUT',
      headers: { ...headers, 'X-Dispatcher-Test': 'true' },
      body: JSON.stringify({
        dependencies: JSON.stringify(['00000000-0000-0000-0000-000000000000']),
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('clears dependencies when set to empty array', async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_B_ID}`, {
      method: 'PUT',
      headers: { ...headers, 'X-Dispatcher-Test': 'true' },
      body: JSON.stringify({ dependencies: JSON.stringify([]) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const deps = JSON.parse(body.data.dependencies || '[]');
    expect(deps).toHaveLength(0);
  });
});

// ===========================================================================
// 2. Dispatch blocking
// ===========================================================================
describe('Dispatch blocking when dependencies unresolved', () => {
  beforeAll(async () => {
    // Set EPIC_B to depend on EPIC_A (which is still active, not completed)
    await fetch(`${API}/api/v1/epics/${EPIC_B_ID}`, {
      method: 'PUT',
      headers: { ...headers, 'X-Dispatcher-Test': 'true' },
      body: JSON.stringify({ dependencies: JSON.stringify([EPIC_A_ID]) }),
    });
  });

  it('returns 409 when dispatching a blocked epic', async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_B_ID}/dispatch`, {
      method: 'POST',
      headers,
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/dependency/i);
    expect(body.blockingEpics).toBeDefined();
    expect(body.blockingEpics.length).toBeGreaterThan(0);
  });

  it('includes blocking epic details in 409 response', async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_B_ID}/dispatch`, {
      method: 'POST',
      headers,
    });
    const body = await res.json();
    const blocker = body.blockingEpics[0];
    expect(blocker).toHaveProperty('id', EPIC_A_ID);
    expect(blocker).toHaveProperty('identifier');
    expect(blocker).toHaveProperty('name');
    expect(blocker).toHaveProperty('status');
  });

  it('allows dispatch when epic has no dependencies', async () => {
    // Clear deps on EPIC_A (it has none)
    const res = await fetch(`${API}/api/v1/epics/${EPIC_A_ID}/dispatch`, {
      method: 'POST',
      headers,
    });
    // Should not be blocked (may fail for other reasons but not 409)
    expect(res.status).not.toBe(409);
  });
});

// ===========================================================================
// 3. Dependency override endpoint
// ===========================================================================
describe('POST /epics/:id/dependency-override', () => {
  it('returns 400 without a reason', async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_B_ID}/dependency-override`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('records override and returns success', async () => {
    const res = await fetch(`${API}/api/v1/epics/${EPIC_B_ID}/dependency-override`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Approved by tech lead for unblocking release' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.overrideRecorded).toBe(true);
    expect(body.data.blockingEpics).toBeDefined();
  });

  it('returns 400 when epic is not blocked', async () => {
    // EPIC_A has no deps — not blocked
    const res = await fetch(`${API}/api/v1/epics/${EPIC_A_ID}/dependency-override`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'Not blocked, should fail' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not currently blocked/i);
  });
});

// ===========================================================================
// 4. Circular dependency detection
// ===========================================================================
describe('Circular dependency detection', () => {
  it('rejects circular dependency A→B→A', async () => {
    // EPIC_B already depends on EPIC_A. Now try to make EPIC_A depend on EPIC_B.
    const res = await fetch(`${API}/api/v1/epics/${EPIC_A_ID}`, {
      method: 'PUT',
      headers: { ...headers, 'X-Dispatcher-Test': 'true' },
      body: JSON.stringify({ dependencies: JSON.stringify([EPIC_B_ID]) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/circular/i);
  });
});
