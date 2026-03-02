import { z } from "zod";
import { structuredDescriptionSchema } from "./structuredDescription.js";

/**
 * Validation schemas for Composite Epic creation.
 *
 * The create_epic_complete endpoint accepts a deeply nested structure to create
 * an entire epic hierarchy (epic + features + tasks + structured descriptions)
 * in a single transactional call.
 */

/**
 * Valid values for estimated complexity
 */
export const estimatedComplexityValues = [
  "trivial",
  "simple",
  "moderate",
  "complex",
] as const;
export type EstimatedComplexity = (typeof estimatedComplexityValues)[number];

/**
 * Task input schema for composite epic creation
 */
export const compositeTaskInputSchema = z.object({
  title: z.string().min(1).max(500).describe("Task title (required)"),
  description: z
    .string()
    .max(5000)
    .optional()
    .describe("Task description in Markdown format"),
  executionOrder: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Suggested execution order (1, 2, 3...). Lower numbers are worked on first."),
  estimatedComplexity: z
    .enum(estimatedComplexityValues)
    .optional()
    .describe("Estimated complexity: trivial, simple, moderate, or complex"),
  scaffoldHints: z
    .string()
    .optional()
    .describe("JSON string containing scaffold hints from the planner: suggested files, test files, modules, and related patterns. Example: '{\"suggestedFiles\":[\"packages/api/src/routes/tasks.ts\"],\"testFiles\":[],\"modules\":[\"taskService\"],\"relatedPatterns\":[]}'"),
  structuredDesc: structuredDescriptionSchema
    .optional()
    .describe("Structured description with summary, acceptanceCriteria, aiInstructions, etc."),
});

export type CompositeTaskInput = z.infer<typeof compositeTaskInputSchema>;

/**
 * Feature input schema for composite epic creation
 */
export const compositeFeatureInputSchema = z.object({
  title: z.string().min(1).max(500).describe("Feature title (required)"),
  description: z
    .string()
    .max(5000)
    .optional()
    .describe("Feature description in Markdown format"),
  executionOrder: z
    .number()
    .int()
    .positive()
    .describe("Suggested execution order (required). Lower numbers are worked on first."),
  estimatedComplexity: z
    .enum(estimatedComplexityValues)
    .describe("Estimated complexity (required): trivial, simple, moderate, or complex"),
  canParallelize: z
    .boolean()
    .optional()
    .describe("Whether this feature can run alongside other features in parallel"),
  parallelGroup: z
    .string()
    .max(100)
    .optional()
    .describe("Group identifier for features that can run together in parallel"),
  dependencies: z
    .array(z.number().int().nonnegative())
    .optional()
    .describe("Array of feature indices (0-based) within this epic that must be completed before this feature"),
  structuredDesc: structuredDescriptionSchema
    .optional()
    .describe("Structured description with summary, acceptanceCriteria, aiInstructions, etc."),
  tasks: z
    .array(compositeTaskInputSchema)
    .min(1)
    .describe("Array of tasks for this feature (at least 1 required)"),
});

export type CompositeFeatureInput = z.infer<typeof compositeFeatureInputSchema>;

/**
 * Full input schema for create_epic_complete
 * Creates an epic with all features, tasks, and structured descriptions in one call
 */
export const createEpicCompleteInputSchema = z.object({
  name: z.string().min(1).max(255).describe("Epic name (required)"),
  team: z.string().min(1).describe("Team ID, name, or key (required)"),
  description: z
    .string()
    .max(5000)
    .optional()
    .describe("Epic description (optional)"),
  icon: z.string().max(50).optional().describe("Icon identifier for the epic"),
  color: z.string().max(20).optional().describe("Hex color code for the epic (e.g., '#FF5733')"),
  structuredDesc: structuredDescriptionSchema
    .optional()
    .describe("Structured description with summary, acceptanceCriteria, aiInstructions, etc."),
  features: z
    .array(compositeFeatureInputSchema)
    .min(1)
    .describe("Array of features (at least 1 required)"),
});

export type CreateEpicCompleteInput = z.infer<typeof createEpicCompleteInputSchema>;

/**
 * Response type for feature in create_epic_complete response
 */
export interface CompositeTaskResponse {
  id: string;
  identifier: string;
  title: string;
  executionOrder: number | null;
  estimatedComplexity: string | null;
  statusId: string | null;
}

export interface CompositeFeatureResponse {
  id: string;
  identifier: string;
  title: string;
  executionOrder: number | null;
  estimatedComplexity: string | null;
  canParallelize: boolean;
  parallelGroup: string | null;
  dependencies: string | null;
  statusId: string | null;
  tasks: CompositeTaskResponse[];
}

export interface CreateEpicCompleteResponse {
  epic: {
    id: string;
    name: string;
    identifier: string | null;
    description: string | null;
    structuredDesc: string | null;
    teamId: string;
  };
  features: CompositeFeatureResponse[];
  summary: {
    totalFeatures: number;
    totalTasks: number;
  };
}
