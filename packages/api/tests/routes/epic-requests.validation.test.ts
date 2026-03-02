/**
 * Integration tests for Epic Request structuredDesc quality validation gates.
 *
 * Tests ENG-173 (POST /api/v1/epic-requests structuredDesc validation)
 * and ENG-174 (X-Dispatcher-Test bypass header for epic requests).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { buildTestApp } from "../helpers/app.js";
import {
  createAuthenticatedUser,
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
  return Array.from({ length: n }, (_, i) => `tok${i}`).join(" ");
}

/** A valid structuredDesc for epic requests */
function validStructuredDesc() {
  return {
    problemStatement: wordsOf(60),
    proposedSolution: wordsOf(60),
    successMetrics: "Increase adoption rate by 20% within 90 days",
    impactAssessment: "High impact on developer velocity",
  };
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
// POST /api/v1/epic-requests — structuredDesc validation
// ---------------------------------------------------------------------------

describe("POST /api/v1/epic-requests — structuredDesc validation", () => {
  it("returns 201 when structuredDesc meets all quality requirements", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers,
      payload: {
        title: "Quality Epic Request",
        structuredDesc: validStructuredDesc(),
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as { data: { title: string } };
    expect(body.data.title).toBe("Quality Epic Request");
  });

  it("returns 422 when structuredDesc is missing entirely", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers,
      payload: {
        title: "Request Without StructuredDesc",
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      error: string;
      violations: Array<{ check: string }>;
    };
    expect(body.error).toBe("Unprocessable Entity");
    expect(body.violations).toBeDefined();
    expect(body.violations[0].check).toBe("structured_desc_missing");
  });

  it("returns 422 when problemStatement is under 50 words", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers,
      payload: {
        title: "Short Problem Statement",
        structuredDesc: {
          ...validStructuredDesc(),
          problemStatement: "Too short.",
        },
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      violations: Array<{ check: string; expected: string; actual: string }>;
    };
    const v = body.violations.find((x) => x.check === "problem_statement_word_count");
    expect(v).toBeDefined();
    expect(v?.expected).toContain("50");
    expect(v?.actual).toMatch(/\d+ words/);
  });

  it("returns 422 when proposedSolution is under 50 words", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers,
      payload: {
        title: "Short Proposed Solution",
        structuredDesc: {
          ...validStructuredDesc(),
          proposedSolution: "Short.",
        },
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      violations: Array<{ check: string }>;
    };
    const v = body.violations.find((x) => x.check === "proposed_solution_word_count");
    expect(v).toBeDefined();
  });

  it("returns 422 when successMetrics is empty", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers,
      payload: {
        title: "Empty Success Metrics",
        structuredDesc: {
          ...validStructuredDesc(),
          successMetrics: "",
        },
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      violations: Array<{ check: string }>;
    };
    const v = body.violations.find((x) => x.check === "success_metrics_empty");
    expect(v).toBeDefined();
  });

  it("reports all violations at once in a single 422 response", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers,
      payload: {
        title: "All Bad Fields",
        structuredDesc: {
          problemStatement: "short",
          proposedSolution: "short",
          successMetrics: "",
          impactAssessment: "some impact",
        },
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body) as {
      violations: Array<{ check: string }>;
    };
    expect(body.violations.length).toBe(3);
  });

  it("violation objects have check, expected, actual, and message fields", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers,
      payload: {
        title: "Violation Structure Test",
        structuredDesc: {
          problemStatement: "too short",
          proposedSolution: "too short",
          successMetrics: "",
          impactAssessment: "some impact",
        },
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
// ENG-174: X-Dispatcher-Test bypass header for epic requests
// ---------------------------------------------------------------------------

describe("X-Dispatcher-Test bypass header — epic requests", () => {
  it("allows epic request with missing structuredDesc when bypass header is present", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers: { ...headers, "x-dispatcher-test": "1" },
      payload: {
        title: "Test Request Without StructuredDesc",
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it("allows epic request with minimal structuredDesc fields when bypass header is present", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers: { ...headers, "x-dispatcher-test": "1" },
      payload: {
        title: "Minimal Test Request",
        structuredDesc: {
          problemStatement: "short problem",
          proposedSolution: "short solution",
          successMetrics: "",
          impactAssessment: "some impact",
        },
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it("without bypass header, missing structuredDesc returns 422", async () => {
    const { headers } = await createAuthenticatedUser();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/epic-requests",
      headers, // no bypass header
      payload: {
        title: "No StructuredDesc",
      },
    });

    expect(response.statusCode).toBe(422);
  });
});
