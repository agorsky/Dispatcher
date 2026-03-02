/**
 * MCP Tools for Composite Operations
 *
 * Provides high-level tools that perform complete multi-step workflows in a single call.
 * These tools reduce the number of tool calls required for common AI workflows from
 * 15-30 calls down to 1-3 calls.
 *
 * Tools:
 * - spectree__create_epic_complete: Create an epic with all features, tasks, and descriptions atomically
 * - spectree__complete_task_with_validation: Run validations and complete task in one step
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getApiClient,
  ApiError,
  type CreateEpicCompleteInput,
  type EstimatedComplexity,
} from "../api-client.js";
import { createResponse, createErrorResponse } from "./utils.js";

// ---------------------------------------------------------------------------
// Timeout helper for long-running API calls
// ---------------------------------------------------------------------------
const COMPOSITE_TIMEOUT_MS = 120_000; // 2 minutes for large atomic operations

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operationName: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${operationName} timed out after ${String(ms / 1000)}s. ` +
            "The operation may still be processing on the server. " +
            "Try checking the results with spectree__list_epics or retry with a smaller payload."
        )
      );
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

// Valid values for estimated complexity
const estimatedComplexityValues = ["trivial", "simple", "moderate", "complex"] as const;

// Valid values for estimated effort
const estimatedEffortValues = ["trivial", "small", "medium", "large", "xl"] as const;

// Valid values for risk level
const riskLevelValues = ["low", "medium", "high"] as const;

// External link schema
const externalLinkSchema = z.object({
  url: z.string().describe("URL of the external resource"),
  title: z.string().describe("Display title for the link"),
});

// Structured description schema for composite operations
const structuredDescSchema = z.object({
  summary: z.string().describe("Brief human-readable summary (required)"),
  aiInstructions: z
    .string()
    .optional()
    .describe("Specific instructions for AI agents implementing this item"),
  acceptanceCriteria: z
    .array(z.string())
    .optional()
    .describe("List of acceptance criteria that must be met"),
  filesInvolved: z
    .array(z.string())
    .optional()
    .describe("File paths that will be involved in this work"),
  functionsToModify: z
    .array(z.string())
    .optional()
    .describe("Functions to modify in format 'filePath:functionName'"),
  testingStrategy: z
    .string()
    .optional()
    .describe("Description of how this work should be tested"),
  testFiles: z
    .array(z.string())
    .optional()
    .describe("Test file paths"),
  relatedItemIds: z
    .array(z.string())
    .optional()
    .describe("Related feature or task identifiers"),
  externalLinks: z
    .array(externalLinkSchema)
    .optional()
    .describe("External documentation or reference links"),
  technicalNotes: z
    .string()
    .optional()
    .describe("Technical implementation notes or constraints"),
  riskLevel: z
    .enum(riskLevelValues)
    .optional()
    .describe("Risk level assessment: low, medium, or high"),
  estimatedEffort: z
    .enum(estimatedEffortValues)
    .optional()
    .describe("Effort estimate: trivial, small, medium, large, or xl"),
});

// Task input schema for composite epic creation
const compositeTaskSchema = z.object({
  title: z.string().min(1).max(500).describe("Task title (required)"),
  executionOrder: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Execution order within the feature (1, 2, 3...). Lower numbers first."),
  estimatedComplexity: z
    .enum(estimatedComplexityValues)
    .optional()
    .describe("Complexity: trivial (<1hr), simple (1-4hr), moderate (1-3d), complex (>3d)"),
  scaffoldHints: z
    .string()
    .optional()
    .describe(
      "JSON string with scaffold hints from the planner identifying relevant file paths. " +
      "Generate using `git ls-files` scoped to relevant packages. " +
      'Format: \'{"suggestedFiles":["packages/api/src/routes/tasks.ts"],"testFiles":[],"modules":["taskService"],"relatedPatterns":[]}\''
    ),
  structuredDesc: structuredDescSchema
    .optional()
    .describe("Structured description with summary, aiInstructions, acceptanceCriteria, etc."),
});

// Feature input schema for composite epic creation
const compositeFeatureSchema = z.object({
  title: z.string().min(1).max(500).describe("Feature title (required)"),
  executionOrder: z
    .number()
    .int()
    .positive()
    .describe("Execution order within the epic (required). Lower numbers first."),
  estimatedComplexity: z
    .enum(estimatedComplexityValues)
    .describe("Complexity (required): trivial, simple, moderate, or complex"),
  canParallelize: z
    .boolean()
    .optional()
    .describe("Whether this feature can run alongside other features in parallel"),
  parallelGroup: z
    .string()
    .max(100)
    .optional()
    .describe("Group identifier for features that can run together"),
  dependencies: z
    .array(z.number().int().min(0))
    .optional()
    .describe(
      "Array of 0-based indices referencing earlier features in this array that must complete first"
    ),
  structuredDesc: structuredDescSchema
    .optional()
    .describe("Structured description with summary, aiInstructions, acceptanceCriteria, etc."),
  tasks: z
    .array(compositeTaskSchema)
    .min(1)
    .describe("Array of tasks for this feature (at least 1 required)"),
});

// Register all composite tools
export function registerCompositeTools(server: McpServer): void {
  // ==========================================================================
  // spectree__create_epic_complete
  // ==========================================================================
  server.registerTool(
    "spectree__create_epic_complete",
    {
      description:
        "Create an epic with all features, tasks, and structured descriptions in a single atomic operation.\n\n" +
        "This composite tool replaces the need for multiple sequential calls to:\n" +
        "- spectree__create_epic\n" +
        "- spectree__create_feature (multiple times)\n" +
        "- spectree__create_task (multiple times)\n" +
        "- spectree__set_structured_description (multiple times)\n" +
        "- spectree__set_execution_metadata (multiple times)\n\n" +
        "All operations happen atomically - if any step fails, nothing is created.\n\n" +
        "Features:\n" +
        "- Creates the entire hierarchy in one transactional call\n" +
        "- Automatically generates identifiers (e.g., ENG-1, ENG-1-1)\n" +
        "- Resolves dependencies by index (use [0] to depend on the first feature)\n" +
        "- Sets initial status to 'Backlog' for all items\n" +
        "- Returns all created IDs and identifiers for reference\n\n" +
        "Use this instead of individual create calls when building a complete implementation plan.",
      inputSchema: {
        name: z.string().min(1).max(255).describe("Epic name (required)"),
        team: z
          .string()
          .min(1)
          .describe("Team ID, name, or key (required). Use spectree__list_teams to find available teams."),
        description: z
          .string()
          .max(5000)
          .optional()
          .describe("Epic description"),
        icon: z.string().max(50).optional().describe("Icon identifier (e.g., 'rocket', 'star')"),
        color: z.string().max(20).optional().describe("Hex color code (e.g., '#FF5733')"),
        features: z
          .array(compositeFeatureSchema)
          .min(1)
          .describe(
            "Array of features to create. Each feature must have at least 1 task. " +
            "Features are created in order, so dependencies must reference earlier indices (0-based)."
          ),
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();

        // Build the API input - use type assertion to handle exactOptionalPropertyTypes
        // The input has already been validated by Zod, so we know the types are correct
        const apiInput = {
          name: input.name,
          team: input.team,
          ...(input.description !== undefined && { description: input.description }),
          ...(input.icon !== undefined && { icon: input.icon }),
          ...(input.color !== undefined && { color: input.color }),
          features: input.features.map((feature) => ({
            title: feature.title,
            executionOrder: feature.executionOrder,
            estimatedComplexity: feature.estimatedComplexity as EstimatedComplexity,
            ...(feature.canParallelize !== undefined && { canParallelize: feature.canParallelize }),
            ...(feature.parallelGroup !== undefined && { parallelGroup: feature.parallelGroup }),
            ...(feature.dependencies !== undefined && { dependencies: feature.dependencies }),
            ...(feature.structuredDesc !== undefined && { 
              structuredDesc: feature.structuredDesc as CreateEpicCompleteInput["features"][number]["structuredDesc"]
            }),
            tasks: feature.tasks.map((task) => ({
              title: task.title,
              ...(task.executionOrder !== undefined && { executionOrder: task.executionOrder }),
              ...(task.estimatedComplexity !== undefined && {
                estimatedComplexity: task.estimatedComplexity as EstimatedComplexity
              }),
              ...(task.scaffoldHints !== undefined && { scaffoldHints: task.scaffoldHints }),
              ...(task.structuredDesc !== undefined && {
                structuredDesc: task.structuredDesc as CreateEpicCompleteInput["features"][number]["tasks"][number]["structuredDesc"]
              }),
            })),
          })),
        } as CreateEpicCompleteInput;

        const { data: result } = await withTimeout(
          apiClient.createEpicComplete(apiInput),
          COMPOSITE_TIMEOUT_MS,
          "create_epic_complete"
        );

        // Format a helpful response
        const responseText = {
          message: `Successfully created epic '${result.epic.name}' with ${String(result.summary.totalFeatures)} features and ${String(result.summary.totalTasks)} tasks.`,
          epic: {
            id: result.epic.id,
            name: result.epic.name,
            teamId: result.epic.teamId,
          },
          features: result.features.map((f) => ({
            id: f.id,
            identifier: f.identifier,
            title: f.title,
            taskCount: f.tasks.length,
            tasks: f.tasks.map((t) => ({
              id: t.id,
              identifier: t.identifier,
              title: t.title,
            })),
          })),
          summary: result.summary,
        };

        return createResponse(responseText);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 404) {
            return createErrorResponse(
              new Error(`Team '${input.team}' not found. Use spectree__list_teams to see available teams.`)
            );
          }
          if (error.status === 400) {
            const body = error.body as { error?: string };
            return createErrorResponse(
              new Error(`Validation error: ${body.error ?? "Invalid input"}`)
            );
          }
        }
        // Handle TypeError: terminated (connection dropped during large payloads)
        if (error instanceof TypeError && error.message.includes("terminated")) {
          return createErrorResponse(
            new Error(
              "The API request was terminated unexpectedly. This can happen with very large payloads. " +
                "Check if the epic was partially created with spectree__list_epics, then retry or split into smaller operations."
            )
          );
        }
        return createErrorResponse(error);
      }
    }
  );

  // ==========================================================================
  // spectree__complete_task_with_validation
  // ==========================================================================
  server.registerTool(
    "spectree__complete_task_with_validation",
    {
      description:
        "Run all validations for a task and mark it complete if all pass.\n\n" +
        "This composite tool combines:\n" +
        "- spectree__run_all_validations\n" +
        "- spectree__complete_work (if validations pass)\n\n" +
        "Behavior:\n" +
        "- Runs all validation checks defined on the task\n" +
        "- If ALL validations pass, marks the task as complete with the provided summary\n" +
        "- If ANY validation fails, returns the failure details WITHOUT completing the task\n" +
        "- If no validations are defined, completes the task immediately\n\n" +
        "Use this at the end of implementing a task to ensure all acceptance criteria are met " +
        "before marking it done.",
      inputSchema: {
        taskId: z
          .string()
          .describe(
            "The task identifier. Accepts UUID or human-readable identifier (e.g., 'COM-123-1')."
          ),
        summary: z
          .string()
          .max(5000)
          .optional()
          .describe(
            "Summary of work completed. Will be logged as an AI note when the task is marked complete."
          ),
        workingDirectory: z
          .string()
          .max(1000)
          .optional()
          .describe(
            "Working directory for running validation commands. Defaults to current working directory."
          ),
        stopOnFirstFailure: z
          .boolean()
          .optional()
          .describe(
            "If true, stops running validations after the first failure. Default is false (run all)."
          ),
        skipValidations: z
          .boolean()
          .optional()
          .describe(
            "If true, skips running validations and completes the task immediately. " +
            "Use with caution - only for tasks where validations are not applicable."
          ),
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();

        // First, resolve the task to get its UUID
        const { data: task } = await apiClient.getTask(input.taskId);

        // If skipValidations is true, complete immediately
        if (input.skipValidations) {
          const { data: completeResult } = await apiClient.completeTaskWork(task.id, {
            summary: input.summary,
          });
          return createResponse({
            message: `Task '${task.identifier}' completed (validations skipped).`,
            validationsSkipped: true,
            task: {
              id: task.id,
              identifier: task.identifier,
              title: task.title,
              status: "Done",
              completedAt: completeResult.completedAt,
              durationMinutes: completeResult.durationMinutes,
            },
          });
        }

        // Run all validations - build options without undefined values
        const validationOptions: { stopOnFailure?: boolean; workingDirectory?: string } = {};
        if (input.stopOnFirstFailure !== undefined) validationOptions.stopOnFailure = input.stopOnFirstFailure;
        if (input.workingDirectory !== undefined) validationOptions.workingDirectory = input.workingDirectory;
        
        const { data: validationResult } = await apiClient.runAllValidations(task.id, validationOptions);

        // Check if all validations passed (using correct response shape)
        const hasValidations = validationResult.totalChecks > 0;

        if (!hasValidations) {
          // No validations defined - complete the task
          const { data: completeResult } = await apiClient.completeTaskWork(task.id, {
            summary: input.summary,
          });
          return createResponse({
            message: `Task '${task.identifier}' completed (no validations defined).`,
            validationsRun: false,
            task: {
              id: task.id,
              identifier: task.identifier,
              title: task.title,
              status: "Done",
              completedAt: completeResult.completedAt,
              durationMinutes: completeResult.durationMinutes,
            },
          });
        }

        if (!validationResult.allPassed) {
          // Some validations failed - return details without completing
          const failedChecks = validationResult.results.filter((c) => !c.passed);
          return createResponse({
            message: `Task '${task.identifier}' NOT completed. ${String(validationResult.failed)} of ${String(validationResult.totalChecks)} validations failed.`,
            completed: false,
            validationSummary: {
              total: validationResult.totalChecks,
              passed: validationResult.passed,
              failed: validationResult.failed,
              pending: validationResult.pending,
            },
            failedValidations: failedChecks.map((c) => ({
              id: c.id,
              type: c.type,
              description: c.description,
              errorMessage: c.error,
              lastOutput: c.output,
            })),
            task: {
              id: task.id,
              identifier: task.identifier,
              title: task.title,
              status: "In Progress",
            },
          });
        }

        // All validations passed - complete the task
        const { data: completeResult } = await apiClient.completeTaskWork(task.id, {
          summary: input.summary,
        });

        return createResponse({
          message: `Task '${task.identifier}' completed. All ${String(validationResult.totalChecks)} validations passed.`,
          completed: true,
          validationSummary: {
            total: validationResult.totalChecks,
            passed: validationResult.passed,
            failed: validationResult.failed,
            pending: validationResult.pending,
          },
          task: {
            id: task.id,
            identifier: task.identifier,
            title: task.title,
            status: "Done",
            completedAt: completeResult.completedAt,
            durationMinutes: completeResult.durationMinutes,
          },
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return createErrorResponse(new Error(`Task '${input.taskId}' not found`));
        }
        if (error instanceof TypeError && error.message.includes("terminated")) {
          return createErrorResponse(
            new Error(
              "The API request was terminated unexpectedly. " +
                "Check the task status with spectree__get_task and retry if needed."
            )
          );
        }
        return createErrorResponse(error);
      }
    }
  );
}
