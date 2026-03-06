/**
 * MCP Tools for Task Operations
 *
 * Tasks are sub-issues under features. They inherit team scope
 * from their parent feature. Uses HTTP API client for all operations.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiClient, ApiError, type StructuredDescription } from "../api-client.js";
import { createResponse, createErrorResponse } from "./utils.js";
import { injectReminder } from "./utils/reminder-injector.js";

// structuredDesc schema for inline task creation/update
const structuredDescSchema = z.object({
  summary: z.string().min(1).max(5000).describe("Human-readable summary of the task"),
  aiInstructions: z.string().max(10000).optional().describe("Instructions for AI agents working on this task"),
  acceptanceCriteria: z.array(z.string().max(1000)).max(50).optional().describe("Acceptance criteria list"),
  filesInvolved: z.array(z.string().max(500)).max(100).optional().describe("File paths involved"),
  functionsToModify: z.array(z.string().max(500)).max(100).optional().describe("Functions to modify (filepath:functionName)"),
  testingStrategy: z.string().max(5000).optional().describe("Testing approach"),
  testFiles: z.array(z.string().max(500)).max(100).optional().describe("Test files"),
  relatedItemIds: z.array(z.string().max(50)).max(50).optional().describe("Related feature/task IDs"),
  externalLinks: z.array(z.object({ url: z.string().url().max(2048), title: z.string().min(1).max(255) })).max(50).optional().describe("External links"),
  technicalNotes: z.string().max(10000).optional().describe("Technical notes"),
  riskLevel: z.enum(["low", "medium", "high"]).optional().describe("Risk level"),
  estimatedEffort: z.enum(["trivial", "small", "medium", "large", "xl"]).optional().describe("Effort estimate"),
}).optional().describe("Structured description for pre-flight compliance. Include at least summary, aiInstructions, and acceptanceCriteria to pass pre-flight checks.");

// Register all task tools
export function registerTaskTools(server: McpServer): void {
  // ==========================================================================
  // spectree__list_tasks
  // ==========================================================================
  server.registerTool(
    "spectree__list_tasks",
    {
      description:
        "List tasks in SpecTree with optional filtering by feature, status, or assignee. " +
        "Tasks are sub-issues that belong to a parent feature, used for breaking down work " +
        "into smaller pieces. Returns paginated results ordered by sort order then creation " +
        "date (newest first). Each task has an auto-generated identifier based on its parent " +
        "feature (e.g., if the feature is 'COM-123', tasks are 'COM-123-1', 'COM-123-2', etc.).",
      inputSchema: {
        feature: z
          .string()
          .optional()
          .describe(
            "Filter tasks by parent feature. Accepts feature ID (UUID) or identifier " +
            "(e.g., 'COM-123'). Use this to get all tasks for a specific feature."
          ),
        status: z
          .string()
          .optional()
          .describe(
            "Filter by status ID (UUID). Tasks use the same status system as features, " +
            "scoped to the feature's team."
          ),
        assignee: z
          .string()
          .optional()
          .describe(
            "Filter by assignee user ID (UUID). Returns only tasks assigned to the " +
            "specified user."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(
            "Maximum number of tasks to return per page (default: 20, max: 100). " +
            "Use with cursor for pagination through large result sets."
          ),
        cursor: z
          .string()
          .optional()
          .describe(
            "Pagination cursor from a previous response's meta.cursor field. " +
            "Pass this to fetch the next page of results."
          ),
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();

        const result = await apiClient.listTasks({
          feature: input.feature,
          status: input.status,
          assignee: input.assignee,
          limit: input.limit,
          cursor: input.cursor,
        });

        return createResponse({
          tasks: result.data,
          meta: result.meta,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return createErrorResponse(new Error(`Feature '${input.feature ?? "unknown"}' not found`));
        }
        return createErrorResponse(error);
      }
    }
  );

  // ==========================================================================
  // spectree__get_task
  // ==========================================================================
  server.registerTool(
    "spectree__get_task",
    {
      description:
        "Get detailed information about a specific task by ID or identifier. " +
        "Returns the full task object including all metadata such as title, description, " +
        "status, assignee, and timestamps.",
      inputSchema: {
        id: z
          .string()
          .describe(
            "The task identifier to look up. Accepts either a UUID " +
            "(e.g., '550e8400-e29b-41d4-a716-446655440000') or a human-readable identifier " +
            "(e.g., 'COM-123-1'). The identifier format is '{FEATURE_IDENTIFIER}-{NUMBER}'."
          ),
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();
        const { data: task } = await apiClient.getTask(input.id);
        return createResponse(task);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return createErrorResponse(new Error(`Task '${input.id}' not found`));
        }
        return createErrorResponse(error);
      }
    }
  );

  // ==========================================================================
  // spectree__create_task
  // ==========================================================================
  server.registerTool(
    "spectree__create_task",
    {
      description:
        "Create a new task under a feature. Tasks are sub-issues used to break down features " +
        "into smaller, actionable work items. Each task is automatically assigned a unique " +
        "identifier based on its parent feature (e.g., if the feature is 'COM-123', the task " +
        "might be 'COM-123-1'). Returns the created task with all metadata including the " +
        "generated identifier.\n\n" +
        "**REQUIRED FIELDS**: executionOrder and estimatedComplexity must be provided. " +
        "These fields are mandatory for proper planning and execution tracking.",
      inputSchema: {
        title: z
          .string()
          .min(1)
          .describe(
            "The title of the task (required). Should be a concise, actionable description " +
            "(e.g., 'Implement password validation', 'Write unit tests for auth module')."
          ),
        feature_id: z
          .string()
          .describe(
            "The parent feature for this task (required). Accepts feature ID (UUID) or " +
            "identifier (e.g., 'COM-123'). The task inherits team scope from its parent feature."
          ),
        description: z
          .string()
          .optional()
          .describe(
            "A detailed description of the task in Markdown format. Can include implementation " +
            "notes, acceptance criteria, or technical details. Supports full Markdown syntax."
          ),
        status: z
          .string()
          .optional()
          .describe(
            "Initial status for the task. Accepts status ID (UUID) or exact status name " +
            "(e.g., 'Backlog', 'In Progress'). Status names are resolved within the parent " +
            "feature's team context. If not provided, the task is created without a status."
          ),
        assignee: z
          .string()
          .optional()
          .describe(
            "User ID (UUID) to assign this task to. If not provided, the task is unassigned."
          ),
        // Execution metadata
        executionOrder: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Suggested execution order (1, 2, 3...). Lower numbers are worked on first."
          ),
        canParallelize: z
          .boolean()
          .optional()
          .describe(
            "Whether this task can run alongside other tasks in parallel."
          ),
        parallelGroup: z
          .string()
          .max(100)
          .optional()
          .describe(
            "Group identifier for tasks that can run together in parallel."
          ),
        dependencies: z
          .array(z.string().uuid())
          .optional()
          .describe(
            "Array of task UUIDs that must be completed before this task."
          ),
        estimatedComplexity: z
          .enum(["trivial", "simple", "moderate", "complex"])
          .optional()
          .describe(
            "Estimated complexity: 'trivial', 'simple', 'moderate', or 'complex'."
          ),
        structuredDesc: structuredDescSchema,
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();

        // Validate required execution metadata
        if (!input.executionOrder) {
          return createErrorResponse(
            new Error(
              "executionOrder is required. Please provide a positive integer indicating the suggested execution order (1, 2, 3...)."
            )
          );
        }
        if (!input.estimatedComplexity) {
          return createErrorResponse(
            new Error(
              "estimatedComplexity is required. Please provide one of: 'trivial' (<1hr), 'simple' (1-4hr), 'moderate' (1-3d), or 'complex' (>3d)."
            )
          );
        }

        // Resolve feature to get featureId
        const { data: feature } = await apiClient.getFeature(input.feature_id);

        // Resolve status name to ID if provided
        let statusId = input.status;
        if (statusId) {
          const { data: epic } = await apiClient.getEpic(feature.epicId);
          statusId = await apiClient.resolveStatusId(statusId, epic.teamId);
        }

        const createResult = await apiClient.createTask({
          title: input.title,
          featureId: feature.id,
          description: input.description,
          statusId,
          assigneeId: input.assignee,
          executionOrder: input.executionOrder,
          canParallelize: input.canParallelize,
          parallelGroup: input.parallelGroup,
          dependencies: input.dependencies,
          estimatedComplexity: input.estimatedComplexity,
        });
        const task = createResult.data;
        const apiWarnings: string[] = createResult.warnings ?? [];

        // Set structuredDesc inline if provided
        if (input.structuredDesc) {
          try {
            await apiClient.setTaskStructuredDesc(task.id, input.structuredDesc as StructuredDescription);
          } catch (sdError) {
            // Non-blocking: task was created, warn about structuredDesc failure
            const result = injectReminder('create_task', {
              ...task,
              message: `Task '${task.identifier}' created successfully, but structuredDesc failed to save. Use spectree__manage_description to set it manually.`,
              warnings: [...apiWarnings, `structuredDesc save failed: ${sdError instanceof Error ? sdError.message : String(sdError)}`],
            });
            return createResponse(result);
          }
        }

        const result = injectReminder('create_task', {
          ...task,
          message: `Task '${task.identifier}' created successfully${input.structuredDesc ? ' with structuredDesc' : ''}`,
          ...(apiWarnings.length > 0 ? { warnings: apiWarnings } : {}),
        });

        return createResponse(result);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return createErrorResponse(new Error(`Feature '${input.feature_id}' not found`));
        }
        return createErrorResponse(error);
      }
    }
  );

  // ==========================================================================
  // spectree__update_task
  // ==========================================================================
  server.registerTool(
    "spectree__update_task",
    {
      description:
        "Update an existing task. Only the fields you provide will be updated; omitted " +
        "fields retain their current values. Returns the updated task with all current " +
        "field values. Use this to change status, reassign, or modify content.\n\n" +
        "TIP: After completing significant work on a task, consider using:\n" +
        "- spectree__complete_work to mark it done (auto-calculates duration)\n" +
        "- spectree__log_progress to note partial progress\n" +
        "- spectree__start_work to begin work (sets status and timestamps)",
      inputSchema: {
        id: z
          .string()
          .describe(
            "The task to update (required). Accepts either a UUID " +
            "(e.g., '550e8400-e29b-41d4-a716-446655440000') or a human-readable identifier " +
            "(e.g., 'COM-123-1')."
          ),
        title: z
          .string()
          .min(1)
          .optional()
          .describe(
            "New title for the task. Only provide if you want to change the title " +
            "(e.g., 'Updated: Implement password validation')."
          ),
        description: z
          .string()
          .optional()
          .describe(
            "New description in Markdown format. Replaces the entire description; " +
            "there is no append mode. Supports full Markdown syntax."
          ),
        status: z
          .string()
          .optional()
          .describe(
            "New status for the task. Accepts status ID (UUID) or exact status name " +
            "(e.g., 'In Progress', 'Done'). Status names are resolved within the parent " +
            "feature's team context."
          ),
        assignee: z
          .string()
          .optional()
          .describe(
            "New assignee user ID (UUID) for the task."
          ),
        // Execution metadata
        executionOrder: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "Suggested execution order (1, 2, 3...). Lower numbers are worked on first."
          ),
        canParallelize: z
          .boolean()
          .optional()
          .describe(
            "Whether this task can run alongside other tasks in parallel."
          ),
        parallelGroup: z
          .string()
          .max(100)
          .optional()
          .describe(
            "Group identifier for tasks that can run together in parallel."
          ),
        dependencies: z
          .array(z.string().uuid())
          .optional()
          .describe(
            "Array of task UUIDs that must be completed before this task."
          ),
        estimatedComplexity: z
          .enum(["trivial", "simple", "moderate", "complex"])
          .optional()
          .describe(
            "Estimated complexity: 'trivial', 'simple', 'moderate', or 'complex'."
          ),
        structuredDesc: structuredDescSchema,
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();

        // Resolve status name to ID if provided
        let statusId = input.status;
        if (statusId) {
          // Get task to find its team context
          const { data: task } = await apiClient.getTask(input.id);
          const { data: feature } = await apiClient.getFeature(task.featureId);
          const { data: epic } = await apiClient.getEpic(feature.epicId);
          statusId = await apiClient.resolveStatusId(statusId, epic.teamId);
        }

        const { data: task } = await apiClient.updateTask(input.id, {
          title: input.title,
          description: input.description,
          statusId,
          assigneeId: input.assignee,
          executionOrder: input.executionOrder,
          canParallelize: input.canParallelize,
          parallelGroup: input.parallelGroup,
          dependencies: input.dependencies,
          estimatedComplexity: input.estimatedComplexity,
        });

        // Set structuredDesc inline if provided
        if (input.structuredDesc) {
          try {
            await apiClient.setTaskStructuredDesc(task.id, input.structuredDesc as StructuredDescription);
          } catch (sdError) {
            return createResponse({
              ...task,
              message: `Task '${task.identifier}' updated, but structuredDesc failed to save.`,
              warnings: [`structuredDesc save failed: ${sdError instanceof Error ? sdError.message : String(sdError)}`],
            });
          }
        }

        return createResponse(task);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return createErrorResponse(new Error(`Task '${input.id}' not found`));
        }
        return createErrorResponse(error);
      }
    }
  );
}
