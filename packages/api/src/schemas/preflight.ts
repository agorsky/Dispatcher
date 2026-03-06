import { z } from "zod";

// ---------------------------------------------------------------------------
// Pre-flight check result schemas
// ---------------------------------------------------------------------------

export const preflightCheckItemSchema = z.object({
  identifier: z.string(),
  issue: z.string(),
});

export const preflightCheckResultSchema = z.object({
  checkName: z.string(),
  passed: z.boolean(),
  details: z.string(),
  items: z.array(preflightCheckItemSchema).optional(),
});

export const preflightResultSchema = z.object({
  epicId: z.string().uuid(),
  passed: z.boolean(),
  score: z.number(),
  checks: z.array(preflightCheckResultSchema),
  checkedAt: z.string(),
  backfillCount: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Override input schema
// ---------------------------------------------------------------------------

export const preflightOverrideInputSchema = z.object({
  reason: z.string().min(10, "Reason must be at least 10 characters").max(2000),
  issues: z.array(z.string()).min(1, "At least one issue must be identified"),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type PreflightCheckItem = z.infer<typeof preflightCheckItemSchema>;
export type PreflightCheckResult = z.infer<typeof preflightCheckResultSchema>;
export type PreflightResult = z.infer<typeof preflightResultSchema>;
export type PreflightOverrideInput = z.infer<typeof preflightOverrideInputSchema>;
