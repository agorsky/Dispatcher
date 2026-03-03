/**
 * MCP Tool Completeness Smoke Test (ENG-78)
 *
 * This test verifies that all MCP tools register successfully with the server.
 * It creates a mock McpServer that records registered tools, calls registerAllTools(),
 * and verifies every expected tool is present.
 *
 * Optionally, if SPECTREE_SMOKE_HTTP=1, it will also probe each API-backed tool
 * via HTTP against localhost:3001 to verify basic connectivity.
 */

import { describe, it, expect, beforeAll } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Mock API client so tools that import it can register without errors
// ─────────────────────────────────────────────────────────────────────────────
import { vi } from "vitest";

const { mockApiClient } = vi.hoisted(() => {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (typeof prop === "string") {
        return vi.fn().mockResolvedValue({});
      }
      return undefined;
    },
  };
  return { mockApiClient: new Proxy({} as Record<string, unknown>, handler) };
});

vi.mock("../src/api-client.js", () => ({
  getApiClient: () => mockApiClient,
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.body = body;
    }
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock McpServer that records all tool registrations
// ─────────────────────────────────────────────────────────────────────────────
interface RegisteredTool {
  name: string;
  config: {
    description?: string;
    inputSchema?: unknown;
  };
  handler: (...args: unknown[]) => unknown;
}

const registeredTools = new Map<string, RegisteredTool>();

const mockServer = {
  registerTool: (name: string, config: Record<string, unknown>, handler: (...args: unknown[]) => unknown) => {
    registeredTools.set(name, { name, config, handler });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Import and register all tools
// ─────────────────────────────────────────────────────────────────────────────
import { registerAllTools } from "../src/tools/index.js";

beforeAll(() => {
  registerAllTools(mockServer as never);
});

// ─────────────────────────────────────────────────────────────────────────────
// Complete expected tool list (119 tools across 34 modules)
//
// This is the authoritative list of every tool name registered in the MCP server.
// If a new tool is added and this test fails, add it to the appropriate section below.
// ─────────────────────────────────────────────────────────────────────────────

const EXPECTED_TOOLS: { name: string; module: string; deprecated?: boolean }[] = [
  // help.ts (1 tool)
  { name: "spectree__get_instructions", module: "help" },

  // composite.ts (2 tools)
  { name: "spectree__create_epic_complete", module: "composite" },
  { name: "spectree__complete_task_with_validation", module: "composite" },

  // ai-context.ts (4 tools)
  { name: "spectree__manage_ai_context", module: "ai-context" },
  { name: "spectree__get_ai_context", module: "ai-context", deprecated: true },
  { name: "spectree__set_ai_context", module: "ai-context", deprecated: true },
  { name: "spectree__append_ai_note", module: "ai-context", deprecated: true },

  // changelog.ts (1 tool)
  { name: "spectree__get_changelog", module: "changelog" },

  // code-context.ts (8 tools)
  { name: "spectree__manage_code_context", module: "code-context" },
  { name: "spectree__get_code_context", module: "code-context", deprecated: true },
  { name: "spectree__link_code_file", module: "code-context", deprecated: true },
  { name: "spectree__unlink_code_file", module: "code-context", deprecated: true },
  { name: "spectree__link_function", module: "code-context", deprecated: true },
  { name: "spectree__link_branch", module: "code-context", deprecated: true },
  { name: "spectree__link_commit", module: "code-context", deprecated: true },
  { name: "spectree__link_pr", module: "code-context", deprecated: true },

  // decisions.ts (4 tools)
  { name: "spectree__log_decision", module: "decisions" },
  { name: "spectree__list_decisions", module: "decisions" },
  { name: "spectree__search_decisions", module: "decisions" },
  { name: "spectree__get_decision_context", module: "decisions" },

  // epics.ts (4 tools)
  { name: "spectree__list_epics", module: "epics" },
  { name: "spectree__get_epic", module: "epics" },
  { name: "spectree__create_epic", module: "epics" },
  { name: "spectree__update_epic", module: "epics" },

  // epic-requests.ts (11 tools)
  { name: "spectree__draft_epic_request", module: "epic-requests" },
  { name: "spectree__create_epic_request", module: "epic-requests" },
  { name: "spectree__list_epic_requests", module: "epic-requests" },
  { name: "spectree__get_epic_request", module: "epic-requests" },
  { name: "spectree__update_epic_request", module: "epic-requests" },
  { name: "spectree__delete_epic_request", module: "epic-requests" },
  { name: "spectree__react_to_epic_request", module: "epic-requests" },
  { name: "spectree__comment_on_epic_request", module: "epic-requests" },
  { name: "spectree__list_epic_request_comments", module: "epic-requests" },
  { name: "spectree__transfer_epic_request_scope", module: "epic-requests" },
  { name: "spectree__transfer_epic_scope", module: "epic-requests" },

  // execution.ts (4 tools)
  { name: "spectree__get_execution_plan", module: "execution" },
  { name: "spectree__set_execution_metadata", module: "execution" },
  { name: "spectree__mark_blocked", module: "execution" },
  { name: "spectree__mark_unblocked", module: "execution" },

  // features.ts (4 tools)
  { name: "spectree__list_features", module: "features" },
  { name: "spectree__get_feature", module: "features" },
  { name: "spectree__create_feature", module: "features" },
  { name: "spectree__update_feature", module: "features" },

  // ordering.ts (4 tools)
  { name: "spectree__reorder_item", module: "ordering" },
  { name: "spectree__reorder_epic", module: "ordering", deprecated: true },
  { name: "spectree__reorder_feature", module: "ordering", deprecated: true },
  { name: "spectree__reorder_task", module: "ordering", deprecated: true },

  // personal.ts (5 tools)
  { name: "spectree__get_personal_scope", module: "personal" },
  { name: "spectree__list_personal_projects", module: "personal" },
  { name: "spectree__create_personal_project", module: "personal" },
  { name: "spectree__list_personal_statuses", module: "personal" },
  { name: "spectree__list_personal_epic_requests", module: "personal" },

  // progress.ts (5 tools)
  { name: "spectree__manage_progress", module: "progress" },
  { name: "spectree__start_work", module: "progress", deprecated: true },
  { name: "spectree__complete_work", module: "progress", deprecated: true },
  { name: "spectree__log_progress", module: "progress", deprecated: true },
  { name: "spectree__report_blocker", module: "progress", deprecated: true },

  // search.ts (1 tool)
  { name: "spectree__search", module: "search" },

  // statuses.ts (2 tools)
  { name: "spectree__list_statuses", module: "statuses" },
  { name: "spectree__get_status", module: "statuses" },

  // structured-desc.ts (7 tools)
  { name: "spectree__manage_description", module: "structured-desc" },
  { name: "spectree__get_structured_description", module: "structured-desc", deprecated: true },
  { name: "spectree__set_structured_description", module: "structured-desc", deprecated: true },
  { name: "spectree__update_section", module: "structured-desc", deprecated: true },
  { name: "spectree__add_acceptance_criterion", module: "structured-desc", deprecated: true },
  { name: "spectree__link_file", module: "structured-desc", deprecated: true },
  { name: "spectree__add_external_link", module: "structured-desc", deprecated: true },

  // summary.ts (3 tools)
  { name: "spectree__get_progress_summary", module: "summary" },
  { name: "spectree__get_my_work", module: "summary" },
  { name: "spectree__get_blocked_summary", module: "summary" },

  // tasks.ts (4 tools)
  { name: "spectree__list_tasks", module: "tasks" },
  { name: "spectree__get_task", module: "tasks" },
  { name: "spectree__create_task", module: "tasks" },
  { name: "spectree__update_task", module: "tasks" },

  // teams.ts (1 tool)
  { name: "spectree__list_teams", module: "teams" },

  // templates.ts (5 tools)
  { name: "spectree__list_templates", module: "templates" },
  { name: "spectree__get_template", module: "templates" },
  { name: "spectree__preview_template", module: "templates" },
  { name: "spectree__create_from_template", module: "templates" },
  { name: "spectree__save_as_template", module: "templates" },

  // sessions.ts (5 tools)
  { name: "spectree__start_session", module: "sessions" },
  { name: "spectree__end_session", module: "sessions" },
  { name: "spectree__get_active_session", module: "sessions" },
  { name: "spectree__get_last_session", module: "sessions" },
  { name: "spectree__get_session_history", module: "sessions" },

  // validations.ts (8 tools)
  { name: "spectree__manage_validations", module: "validations" },
  { name: "spectree__add_validation", module: "validations", deprecated: true },
  { name: "spectree__list_validations", module: "validations", deprecated: true },
  { name: "spectree__run_validation", module: "validations", deprecated: true },
  { name: "spectree__run_all_validations", module: "validations", deprecated: true },
  { name: "spectree__mark_manual_validated", module: "validations", deprecated: true },
  { name: "spectree__remove_validation", module: "validations", deprecated: true },
  { name: "spectree__reset_validations", module: "validations", deprecated: true },

  // laws.ts (4 tools)
  { name: "spectree__list_laws", module: "laws" },
  { name: "spectree__get_law", module: "laws" },
  { name: "spectree__create_law", module: "laws" },
  { name: "spectree__update_law", module: "laws" },

  // cases.ts (6 tools)
  { name: "spectree__list_cases", module: "cases" },
  { name: "spectree__get_case", module: "cases" },
  { name: "spectree__file_case", module: "cases" },
  { name: "spectree__issue_verdict", module: "cases" },
  { name: "spectree__mark_case_corrected", module: "cases" },
  { name: "spectree__dismiss_case", module: "cases" },

  // agent-scores.ts (3 tools)
  { name: "spectree__list_agent_scores", module: "agent-scores" },
  { name: "spectree__get_agent_score", module: "agent-scores" },
  { name: "spectree__adjust_agent_score", module: "agent-scores" },

  // codebase.ts (2 tools)
  { name: "spectree__scan_project_structure", module: "codebase" },
  { name: "spectree__analyze_file_impact", module: "codebase" },

  // patterns.ts (1 tool)
  { name: "spectree__detect_patterns", module: "patterns" },

  // effort.ts (1 tool)
  { name: "spectree__estimate_effort", module: "effort" },

  // workflow.ts (2 tools)
  { name: "spectree__get_next_required_action", module: "workflow" },
  { name: "spectree__get_session_state", module: "workflow" },

  // memory-patterns.ts (1 tool)
  { name: "spectree__manage_patterns", module: "memory-patterns" },

  // skill-packs/manage.ts (1 tool) + sub-registrations
  { name: "spectree__manage_skill_packs", module: "skill-packs/manage" },

  // skill-packs/get-manifest.ts (1 tool)
  { name: "spectree__get_pack_manifest", module: "skill-packs/get-manifest" },

  // skill-packs/sync-local.ts (1 tool)
  { name: "spectree__sync_local_packs", module: "skill-packs/sync-local" },

  // plan-scoring.ts (2 tools) — ENG-E219
  { name: "spectree__score_plan", module: "plan-scoring" },
  { name: "spectree__validate_task_completeness", module: "plan-scoring" },

  // plan-requirements.ts (1 tool) — ENG-E219
  { name: "spectree__get_epic_requirements", module: "plan-requirements" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("MCP Tool Completeness Smoke Test (ENG-78)", () => {
  it("should register all expected tools without errors", () => {
    expect(registeredTools.size).toBeGreaterThan(0);
    console.log(`\n  Total tools registered: ${registeredTools.size}`);
  });

  it(`should register exactly ${EXPECTED_TOOLS.length} tools`, () => {
    const actualNames = [...registeredTools.keys()].sort();
    const expectedNames = EXPECTED_TOOLS.map((t) => t.name).sort();

    // Find missing tools (expected but not registered)
    const missing = expectedNames.filter((name) => !registeredTools.has(name));
    if (missing.length > 0) {
      console.error("  Missing tools (expected but not registered):", missing);
    }

    // Find unexpected tools (registered but not in expected list)
    const unexpected = actualNames.filter(
      (name) => !expectedNames.includes(name)
    );
    if (unexpected.length > 0) {
      console.error("  Unexpected tools (registered but not in expected list):", unexpected);
    }

    expect(missing).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(registeredTools.size).toBe(EXPECTED_TOOLS.length);
  });

  // Verify each expected tool individually
  describe("Individual tool registration", () => {
    for (const tool of EXPECTED_TOOLS) {
      it(`should register ${tool.name} (${tool.module})${tool.deprecated ? " [deprecated]" : ""}`, () => {
        const registered = registeredTools.get(tool.name);
        expect(registered).toBeDefined();
        expect(registered!.config).toBeDefined();
        expect(registered!.handler).toBeDefined();
        expect(typeof registered!.handler).toBe("function");
      });
    }
  });

  // Verify all tools have descriptions
  describe("Tool descriptions", () => {
    it("should have a description for every registered tool", () => {
      const toolsWithoutDescription: string[] = [];

      for (const [name, tool] of registeredTools) {
        if (!tool.config.description || typeof tool.config.description !== "string" || tool.config.description.trim().length === 0) {
          toolsWithoutDescription.push(name);
        }
      }

      if (toolsWithoutDescription.length > 0) {
        console.warn("  Tools missing descriptions:", toolsWithoutDescription);
      }

      expect(toolsWithoutDescription).toEqual([]);
    });
  });

  // Verify all tools have input schemas
  describe("Tool input schemas", () => {
    it("should have an inputSchema for every registered tool", () => {
      const toolsWithoutSchema: string[] = [];

      for (const [name, tool] of registeredTools) {
        if (!tool.config.inputSchema) {
          toolsWithoutSchema.push(name);
        }
      }

      if (toolsWithoutSchema.length > 0) {
        console.warn("  Tools missing inputSchema:", toolsWithoutSchema);
      }

      expect(toolsWithoutSchema).toEqual([]);
    });
  });

  // Module coverage: verify every module has at least one tool registered
  describe("Module coverage", () => {
    const modules = [...new Set(EXPECTED_TOOLS.map((t) => t.module))];

    for (const mod of modules) {
      it(`module "${mod}" should have at least one tool registered`, () => {
        const toolsInModule = EXPECTED_TOOLS.filter((t) => t.module === mod);
        const registeredInModule = toolsInModule.filter((t) => registeredTools.has(t.name));
        expect(registeredInModule.length).toBeGreaterThan(0);
      });
    }
  });

  // Summary statistics
  describe("Registration statistics", () => {
    it("should log summary statistics", () => {
      const activeTools = EXPECTED_TOOLS.filter((t) => !t.deprecated);
      const deprecatedTools = EXPECTED_TOOLS.filter((t) => t.deprecated);
      const modules = [...new Set(EXPECTED_TOOLS.map((t) => t.module))];

      console.log(`\n  ── Tool Registration Summary ──`);
      console.log(`  Total tools registered:  ${registeredTools.size}`);
      console.log(`  Expected tools:          ${EXPECTED_TOOLS.length}`);
      console.log(`  Active tools:            ${activeTools.length}`);
      console.log(`  Deprecated tools:        ${deprecatedTools.length}`);
      console.log(`  Modules:                 ${modules.length}`);
      console.log(`  ─────────────────────────────`);

      // Per-module breakdown
      for (const mod of modules.sort()) {
        const count = EXPECTED_TOOLS.filter((t) => t.module === mod).length;
        const depCount = EXPECTED_TOOLS.filter((t) => t.module === mod && t.deprecated).length;
        const suffix = depCount > 0 ? ` (${depCount} deprecated)` : "";
        console.log(`  ${mod.padEnd(24)} ${count} tools${suffix}`);
      }

      expect(true).toBe(true); // Always passes; this test is for logging
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Optional HTTP Smoke Test (set SPECTREE_SMOKE_HTTP=1 to enable)
//
// Makes lightweight HTTP requests against localhost:3001 to verify
// the API server is accessible for API-backed tools.
// ─────────────────────────────────────────────────────────────────────────────

const SPECTREE_API_URL = process.env.SPECTREE_API_URL ?? "http://localhost:3001";
const SPECTREE_AUTH_TOKEN = process.env.SPECTREE_AUTH_TOKEN ?? "st_wShsQaYUgKEL9uJosNtLlLx2bqQe0t5tVCN9DxYWIVA";

// Tools that use the local filesystem only (no API calls needed)
const LOCAL_ONLY_TOOLS = new Set([
  "spectree__detect_patterns",
  "spectree__estimate_effort",
  "spectree__scan_project_structure",
  "spectree__analyze_file_impact",
  "spectree__get_instructions",
  "spectree__sync_local_packs",
]);

// API endpoints to probe for smoke testing
const SMOKE_ENDPOINTS = [
  { path: "/api/epics", method: "GET", description: "List epics" },
  { path: "/api/features", method: "GET", description: "List features" },
  { path: "/api/tasks", method: "GET", description: "List tasks" },
  { path: "/api/statuses", method: "GET", description: "List statuses" },
  { path: "/api/teams", method: "GET", description: "List teams" },
  { path: "/api/search?q=test", method: "GET", description: "Search" },
] as const;

describe.skipIf(!process.env.SPECTREE_SMOKE_HTTP)(
  "HTTP Smoke Tests (optional - set SPECTREE_SMOKE_HTTP=1)",
  () => {
    it("should reach the API server", async () => {
      const response = await fetch(`${SPECTREE_API_URL}/api/epics`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SPECTREE_AUTH_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      console.log(`  API server responded with status: ${response.status}`);
      expect(response.status).toBeLessThan(500);
    });

    for (const endpoint of SMOKE_ENDPOINTS) {
      it(`should respond to ${endpoint.method} ${endpoint.path}`, async () => {
        try {
          const response = await fetch(
            `${SPECTREE_API_URL}${endpoint.path}`,
            {
              method: endpoint.method,
              headers: {
                Authorization: `Bearer ${SPECTREE_AUTH_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );
          console.log(
            `  ${endpoint.method} ${endpoint.path}: ${response.status} (${endpoint.description})`
          );
          // We accept 2xx, 3xx, or 4xx — only 5xx indicates a server issue
          expect(response.status).toBeLessThan(500);
        } catch (error) {
          // Network errors are acceptable in CI where the API may not be running
          console.warn(
            `  ${endpoint.method} ${endpoint.path}: NETWORK ERROR - ${error instanceof Error ? error.message : String(error)}`
          );
        }
      });
    }
  }
);
