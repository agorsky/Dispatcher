import { z } from "zod";

/**
 * Validation schemas for Epic entities.
 */

/**
 * Schema for creating a new epic
 */
export const createEpicSchema = z.object({
  name: z.string().min(1).max(255),
  teamId: z.string().uuid("Invalid team ID"),
  description: z.string().max(5000).optional(),
  icon: z.string().max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  sortOrder: z.number().optional(),
  dependencies: z.string().optional(), // JSON string of UUID array
});

/**
 * Schema for updating an existing epic (teamId cannot be changed)
 */
export const updateEpicSchema = createEpicSchema
  .omit({ teamId: true })
  .partial();

/**
 * Schema for reordering an epic
 * Either afterId or beforeId (or both) can be provided
 */
export const reorderEpicSchema = z.object({
  afterId: z.string().uuid("Invalid after epic ID").optional(),
  beforeId: z.string().uuid("Invalid before epic ID").optional(),
});

// Type exports for use in route handlers
export type CreateEpicInput = z.infer<typeof createEpicSchema>;
export type UpdateEpicInput = z.infer<typeof updateEpicSchema>;
export type ReorderEpicInput = z.infer<typeof reorderEpicSchema>;

/**
 * Valid transfer direction values
 */
export const transferDirectionValues = ["personal-to-team", "team-to-personal"] as const;
export type TransferDirection = (typeof transferDirectionValues)[number];

/**
 * Schema for transferring an epic between scopes.
 * teamId is required when direction is 'personal-to-team' (validated via refine).
 */
export const transferEpicScopeSchema = z.object({
  direction: z.enum(transferDirectionValues).describe(
    "Transfer direction: 'personal-to-team' or 'team-to-personal'"
  ),
  teamId: z.string().uuid("Invalid team ID").optional().describe(
    "Target team ID. Required when direction is 'personal-to-team'."
  ),
}).refine(
  (data) => data.direction !== "personal-to-team" || !!data.teamId,
  {
    message: "teamId is required when direction is 'personal-to-team'",
    path: ["teamId"],
  }
);

export type TransferEpicScopeInput = z.infer<typeof transferEpicScopeSchema>;
