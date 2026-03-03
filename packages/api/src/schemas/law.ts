import { z } from "zod";

/**
 * Validation schemas for Law entities.
 */

const lawSeverityValues = ["minor", "major", "critical"] as const;
export type LawSeverity = (typeof lawSeverityValues)[number];

export const lawNamespaceValues = ["production", "test", "archived"] as const;
export type LawNamespace = (typeof lawNamespaceValues)[number];

/**
 * Schema for creating a new law
 */
export const createLawSchema = z.object({
  lawCode: z
    .string()
    .min(1)
    .max(50)
    .regex(/^LAW-\d{3,}$/, "lawCode must match format LAW-001"),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  severity: z.enum(lawSeverityValues),
  auditLogic: z.string().min(1).max(5000),
  consequence: z.string().min(1).max(2000),
  appliesTo: z.string().min(1).max(255),
  namespace: z.enum(lawNamespaceValues).optional().default("production"),
});

/**
 * Schema for updating an existing law (all fields optional)
 */
export const updateLawSchema = createLawSchema.partial();

/**
 * Schema for listing laws with optional filters
 */
export const listLawsQuerySchema = z.object({
  severity: z.enum(lawSeverityValues).optional(),
  appliesTo: z.string().optional(),
  isActive: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  namespace: z.enum(lawNamespaceValues).optional(),
  cursor: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional(),
});

// Type exports
export type CreateLawInput = z.infer<typeof createLawSchema>;
export type UpdateLawInput = z.infer<typeof updateLawSchema>;
export type ListLawsQuery = z.infer<typeof listLawsQuerySchema>;
