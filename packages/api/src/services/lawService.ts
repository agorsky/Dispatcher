import { prisma } from "../lib/db.js";
import type { Law } from "../generated/prisma/index.js";
import { NotFoundError, ValidationError } from "../errors/index.js";

export interface CreateLawInput {
  lawCode: string;
  title: string;
  description: string;
  severity: string;
  auditLogic: string;
  consequence: string;
  appliesTo: string;
  namespace?: string;
}

export interface UpdateLawInput {
  lawCode?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  severity?: string | undefined;
  auditLogic?: string | undefined;
  consequence?: string | undefined;
  appliesTo?: string | undefined;
  namespace?: string | undefined;
}

export interface ListLawsOptions {
  severity?: string;
  appliesTo?: string;
  isActive?: boolean;
  namespace?: string;
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/**
 * List laws with optional filters and cursor-based pagination.
 */
export async function listLaws(
  options: ListLawsOptions = {}
): Promise<PaginatedResult<Law>> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  const whereClause: {
    severity?: string;
    appliesTo?: string;
    isActive?: boolean;
    namespace?: string;
  } = {};

  if (options.severity !== undefined) {
    whereClause.severity = options.severity;
  }
  if (options.appliesTo !== undefined) {
    whereClause.appliesTo = options.appliesTo;
  }
  if (options.isActive !== undefined) {
    whereClause.isActive = options.isActive;
  }
  if (options.namespace !== undefined) {
    whereClause.namespace = options.namespace;
  }

  const laws = await prisma.law.findMany({
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor } } : {}),
    where: whereClause,
    orderBy: { createdAt: "asc" },
  });

  const hasMore = laws.length > limit;
  if (hasMore) {
    laws.pop();
  }

  const lastLaw = laws.at(-1);
  const nextCursor = hasMore && lastLaw ? lastLaw.id : null;

  return {
    data: laws,
    meta: {
      cursor: nextCursor,
      hasMore,
    },
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Get a single law by ID or lawCode.
 */
export async function getLaw(idOrCode: string): Promise<Law | null> {
  const isUuid = UUID_REGEX.test(idOrCode);
  return prisma.law.findFirst({
    where: isUuid ? { id: idOrCode } : { lawCode: idOrCode },
  });
}

/**
 * Get a law by lawCode.
 */
export async function getLawByCode(lawCode: string): Promise<Law | null> {
  return prisma.law.findUnique({
    where: { lawCode },
  });
}

/**
 * Create a new law.
 */
export async function createLaw(input: CreateLawInput): Promise<Law> {
  // Check for duplicate lawCode
  const existing = await prisma.law.findUnique({
    where: { lawCode: input.lawCode },
  });
  if (existing) {
    throw new ValidationError(`Law with code '${input.lawCode}' already exists`);
  }

  return prisma.law.create({
    data: {
      lawCode: input.lawCode,
      title: input.title,
      description: input.description,
      severity: input.severity,
      auditLogic: input.auditLogic,
      consequence: input.consequence,
      appliesTo: input.appliesTo,
      namespace: input.namespace ?? "production",
    },
  });
}

/**
 * Update an existing law.
 */
export async function updateLaw(
  idOrCode: string,
  input: UpdateLawInput
): Promise<Law> {
  const isUuid = UUID_REGEX.test(idOrCode);
  const existing = await prisma.law.findFirst({
    where: isUuid ? { id: idOrCode } : { lawCode: idOrCode },
  });

  if (!existing) {
    throw new NotFoundError(`Law '${idOrCode}' not found`);
  }

  // If lawCode is being changed, check for duplicate
  if (input.lawCode && input.lawCode !== existing.lawCode) {
    const duplicate = await prisma.law.findUnique({
      where: { lawCode: input.lawCode },
    });
    if (duplicate) {
      throw new ValidationError(`Law with code '${input.lawCode}' already exists`);
    }
  }

  const data: Record<string, unknown> = {};
  if (input.lawCode !== undefined) data.lawCode = input.lawCode;
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.auditLogic !== undefined) data.auditLogic = input.auditLogic;
  if (input.consequence !== undefined) data.consequence = input.consequence;
  if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo;
  if (input.namespace !== undefined) data.namespace = input.namespace;

  return prisma.law.update({
    where: { id: existing.id },
    data,
  });
}

/**
 * Delete a law by ID or lawCode.
 */
export async function deleteLaw(idOrCode: string): Promise<void> {
  const isUuid = UUID_REGEX.test(idOrCode);
  const existing = await prisma.law.findFirst({
    where: isUuid ? { id: idOrCode } : { lawCode: idOrCode },
  });

  if (!existing) {
    throw new NotFoundError(`Law '${idOrCode}' not found`);
  }

  await prisma.law.delete({
    where: { id: existing.id },
  });
}
