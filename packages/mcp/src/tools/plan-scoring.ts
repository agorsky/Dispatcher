/**
 * MCP Tools for Plan Scoring
 *
 * Provides tools for evaluating epic plan quality and validating task
 * completeness against the plan-reviewer rubric. Calls the Dispatcher API
 * which runs deterministic server-side scoring logic.
 *
 * Tools:
 * - spectree__score_plan — Evaluate epic plan quality with weighted scoring
 * - spectree__validate_task_completeness — Check all tasks for mandatory fields
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiClient } from "../api-client.js";
import { createResponse, createErrorResponse } from "./utils.js";

export function registerPlanScoringTools(server: McpServer): void {
  // ==========================================================================
  // spectree__score_plan
  // ==========================================================================
  server.registerTool(
    "spectree__score_plan",
    {
      description:
        "Evaluate epic plan quality against the plan-reviewer rubric. Returns weighted scores " +
        "across four categories with itemized pass/fail feedback for each check.\n\n" +
        "**Scoring weights:**\n" +
        "- Epic Description: 30% — overview, problem, goals, approach, scope, execution plan, technical notes, success criteria, supporting sections\n" +
        "- Feature Average: 25% — structured desc, AI instructions, acceptance criteria, files, execution metadata, risk/effort\n" +
        "- Task Average: 25% — structured desc, AI instructions, acceptance criteria, files, self-containment\n" +
        "- Execution Plan: 20% — all features included, execution order, valid dependencies, parallel safety\n\n" +
        "**Threshold:** Overall score >= 85 is required for self-revision loop to pass. " +
        "The plan-reviewer agent requires >= 95 for formal approval.\n\n" +
        "Use this tool in the planner self-scoring loop instead of manual LLM-computed scoring.",
      inputSchema: {
        epicId: z
          .string()
          .uuid()
          .describe("The epic UUID to score"),
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();
        const result = await apiClient.scorePlan(input.epicId);
        return createResponse(result.data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );

  // ==========================================================================
  // spectree__validate_task_completeness
  // ==========================================================================
  server.registerTool(
    "spectree__validate_task_completeness",
    {
      description:
        "Check every task in an epic for mandatory field presence and quality thresholds. " +
        "Returns a per-task pass/fail report with specific violations.\n\n" +
        "**Checks per task (5 mandatory fields):**\n" +
        "1. summary length >= 50 chars\n" +
        "2. acceptanceCriteria.length >= 2\n" +
        "3. filesInvolved.length >= 1\n" +
        "4. aiInstructions non-empty\n" +
        "5. estimatedEffort set\n\n" +
        "**Returns:**\n" +
        "- Per-task report: taskId, taskIdentifier, passed boolean, violations array\n" +
        "- Summary statistics: total tasks, passing, failing, total violations\n\n" +
        "Use this after creating tasks to verify completeness before running score_plan.",
      inputSchema: {
        epicId: z
          .string()
          .uuid()
          .describe("The epic UUID to validate task completeness for"),
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();
        const result = await apiClient.validateTaskCompleteness(input.epicId);
        return createResponse(result.data);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}
