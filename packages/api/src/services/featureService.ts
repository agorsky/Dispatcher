import { prisma } from "../lib/db.js";
import type { Feature, Task } from "../generated/prisma/index.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { generateSortOrderBetween } from "../utils/ordering.js";
import { buildDateFilters } from "../utils/dateParser.js";
import {
  resolveStatusesToIds,
  getStatusIdsByCategory,
  getDefaultBacklogStatus,
} from "./statusService.js";
import {
  resolveAssigneeId,
  isAssigneeNone,
  isAssigneeInvalid,
} from "../utils/assignee.js";
import { emitStatusChanged, emitEntityCreated, emitEntityUpdated, emitEntityDeleted, type StatusChangedPayload } from "../events/index.js";
import { getAccessibleScopes, hasAccessibleScopes } from "../utils/scopeContext.js";
import * as changelogService from "./changelogService.js";
import { emitSessionEventToEpic } from "./epicService.js";

// Types for feature operations
export interface CreateFeatureInput {
  title: string;
  epicId: string;
  userId: string; // The authenticated user ID - auto-populates createdBy
  description?: string | undefined;
  statusId?: string | undefined;
  assigneeId?: string | undefined;
  sortOrder?: number | undefined;
  // Execution metadata
  executionOrder?: number | undefined;
  canParallelize?: boolean | undefined;
  parallelGroup?: string | undefined;
  dependencies?: string[] | undefined;
  estimatedComplexity?: string | undefined;
}

export interface UpdateFeatureInput {
  title?: string | undefined;
  description?: string | undefined;
  statusId?: string | undefined;
  assigneeId?: string | undefined;
  sortOrder?: number | undefined;
  // Execution metadata
  executionOrder?: number | undefined;
  canParallelize?: boolean | undefined;
  parallelGroup?: string | undefined;
  dependencies?: string[] | undefined;
  estimatedComplexity?: string | undefined;
}

export type FeatureOrderBy = 'sortOrder' | 'createdAt' | 'updatedAt';

export interface ListFeaturesOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  epicId?: string | undefined;
  statusId?: string | undefined;
  /** Status filter - can be ID or name (single or array) */
  status?: string | string[] | undefined;
  /** Filter by status category (backlog, unstarted, started, completed, canceled) */
  statusCategory?: string | undefined;
  /** @deprecated Use `assignee` instead for enhanced filtering */
  assigneeId?: string | undefined;
  /** Assignee filter - supports "me", "none", email, or UUID */
  assignee?: string | undefined;
  /** Current user ID - required for resolving "me" assignee filter */
  currentUserId?: string | undefined;
  orderBy?: FeatureOrderBy | undefined;
  query?: string | undefined;
  /** Filter by createdAt on or after this date (ISO-8601 date or duration like -P7D) */
  createdAt?: string | undefined;
  /** Filter by createdAt before this date (ISO-8601 date or duration like -P7D) */
  createdBefore?: string | undefined;
  /** Filter by updatedAt on or after this date (ISO-8601 date or duration like -P7D) */
  updatedAt?: string | undefined;
  /** Filter by updatedAt before this date (ISO-8601 date or duration like -P7D) */
  updatedBefore?: string | undefined;
}

export interface FeatureWithCount extends Feature {
  _count: {
    tasks: number;
  };
  completedTaskCount: number;
}

export interface FeatureWithTasks extends Feature {
  tasks: Task[];
  epic: {
    id: string;
    teamId: string;
  };
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Generate a unique identifier for a feature based on team key
 * Format: TEAM_KEY-NUMBER (e.g., "COM-123")
 */
async function generateIdentifier(epicId: string, maxRetries = 5): Promise<string> {
  const epic = await prisma.epic.findUnique({
    where: { id: epicId },
    include: { team: true, personalScope: true },
  });

  if (!epic) {
    throw new NotFoundError(`Epic with id '${epicId}' not found`);
  }

  // Determine the prefix based on team or personal scope
  let prefix: string;
  let scopeFilter: { epic: { teamId?: string; personalScopeId?: string } };

  if (epic.team) {
    // Team epic - use team key
    prefix = epic.team.key;
    scopeFilter = { epic: { teamId: epic.teamId! } };
  } else if (epic.personalScope) {
    // Personal epic - use PERS prefix
    prefix = "PERS";
    scopeFilter = { epic: { personalScopeId: epic.personalScopeId! } };
  } else {
    throw new Error(`Epic with id '${epicId}' has no associated team or personal scope`);
  }

  // Find the highest existing identifier number for this scope
  // Query all features and find numeric MAX (string sorting doesn't work for numbers)
  const existingFeatures = await prisma.feature.findMany({
    where: scopeFilter,
    select: { identifier: true },
  });

  let maxNumber = 0;
  const fullPrefix = `${prefix}-`;

  for (const feature of existingFeatures) {
    if (feature.identifier.startsWith(fullPrefix)) {
      // Extract number after prefix, handling both "ENG-14" and "ENG-14-timestamp" formats
      const suffix = feature.identifier.slice(fullPrefix.length);
      const match = suffix.match(/^(\d+)/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
  }

  const nextNumber = maxNumber + 1;

  // Try to generate a unique identifier, retrying on collision
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const identifier = `${prefix}-${String(nextNumber + attempt)}`;

    // Check if this identifier already exists
    const existing = await prisma.feature.findUnique({
      where: { identifier },
      select: { id: true },
    });

    if (!existing) {
      return identifier;
    }
  }

  // Fallback: use timestamp-based suffix to guarantee uniqueness
  const timestamp = Date.now();
  return `${prefix}-${String(nextNumber + maxRetries)}-${timestamp}`;
}

/**
 * List features with cursor-based pagination
 * Ordered by sortOrder (asc), then createdAt (desc)
 * When currentUserId is provided, filters to only show features in accessible scopes
 */
export async function listFeatures(
  options: ListFeaturesOptions = {}
): Promise<PaginatedResult<FeatureWithCount>> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  // Build date filters from options (only include defined values)
  const dateFilterOptions: {
    createdAt?: string;
    createdBefore?: string;
    updatedAt?: string;
    updatedBefore?: string;
  } = {};
  if (options.createdAt !== undefined) {
    dateFilterOptions.createdAt = options.createdAt;
  }
  if (options.createdBefore !== undefined) {
    dateFilterOptions.createdBefore = options.createdBefore;
  }
  if (options.updatedAt !== undefined) {
    dateFilterOptions.updatedAt = options.updatedAt;
  }
  if (options.updatedBefore !== undefined) {
    dateFilterOptions.updatedBefore = options.updatedBefore;
  }
  const dateFilters = buildDateFilters(dateFilterOptions);

  // Build where clause conditionally to avoid undefined values
  const whereClause: {
    epicId?: string;
    epic?: {
      OR?: Array<{ teamId?: { in: string[] }; personalScopeId?: string }>;
    };
    statusId?: string | { in: string[] };
    assigneeId?: string | null;
    createdAt?: { gte?: Date; lt?: Date };
    updatedAt?: { gte?: Date; lt?: Date };
    OR?: {
      title?: { contains: string };
      description?: { contains: string };
    }[];
  } = {};

  // Apply scope-based filtering when currentUserId is provided
  if (options.currentUserId) {
    const accessibleScopes = await getAccessibleScopes(options.currentUserId);

    // If user has no accessible scopes, return empty result
    if (!hasAccessibleScopes(accessibleScopes)) {
      return {
        data: [],
        meta: { cursor: null, hasMore: false },
      };
    }

    // Build OR clause for epics in accessible scopes
    const scopeConditions: Array<{ teamId?: { in: string[] }; personalScopeId?: string }> = [];

    if (accessibleScopes.teamIds.length > 0) {
      scopeConditions.push({ teamId: { in: accessibleScopes.teamIds } });
    }
    if (accessibleScopes.personalScopeId) {
      scopeConditions.push({ personalScopeId: accessibleScopes.personalScopeId });
    }

    whereClause.epic = { OR: scopeConditions };
  }

  if (options.epicId !== undefined) {
    whereClause.epicId = options.epicId;
  }

  // Handle status filtering (supports statusId, status name/array, and statusCategory)
  if (options.statusId !== undefined) {
    whereClause.statusId = options.statusId;
  } else if (options.status !== undefined) {
    // Normalize to array (status can be single string or array)
    const statusValues = Array.isArray(options.status) ? options.status : [options.status];
    const statusIds = await resolveStatusesToIds(statusValues);
    if (statusIds.length === 0) {
      // No matching statuses found - return empty result
      return { data: [], meta: { cursor: null, hasMore: false } };
    }
    whereClause.statusId = { in: statusIds };
  } else if (options.statusCategory !== undefined) {
    const statusIds = await getStatusIdsByCategory(options.statusCategory);
    if (statusIds.length === 0) {
      // No matching statuses found - return empty result
      return { data: [], meta: { cursor: null, hasMore: false } };
    }
    whereClause.statusId = { in: statusIds };
  }

  // Handle assignee filtering with enhanced resolution
  if (options.assignee !== undefined) {
    const resolvedAssignee = await resolveAssigneeId(options.assignee, options.currentUserId);
    if (isAssigneeInvalid(resolvedAssignee)) {
      // Invalid assignee - return empty result (not an error per requirements)
      return { data: [], meta: { cursor: null, hasMore: false } };
    }
    if (isAssigneeNone(resolvedAssignee)) {
      // Filter for unassigned items (null assigneeId)
      whereClause.assigneeId = null;
    } else {
      // Use the resolved user ID
      whereClause.assigneeId = resolvedAssignee;
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Legacy support for direct assigneeId
  } else if (options.assigneeId !== undefined) {
    // Legacy support for direct assigneeId
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    whereClause.assigneeId = options.assigneeId;
  }

  if (options.query !== undefined && options.query.trim() !== "") {
    // Note: SQL Server is case-insensitive by default with most collations
    // so we don't need the mode: "insensitive" option (which is PostgreSQL-specific)
    whereClause.OR = [
      { title: { contains: options.query } },
      { description: { contains: options.query } },
    ];
  }

  // Apply date filters
  if (dateFilters.createdAt !== undefined) {
    whereClause.createdAt = dateFilters.createdAt;
  }
  if (dateFilters.updatedAt !== undefined) {
    whereClause.updatedAt = dateFilters.updatedAt;
  }

  // Determine order by field
  const orderByField = options.orderBy ?? 'sortOrder';
  const orderBy = orderByField === 'sortOrder'
    ? [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }]
    : [{ [orderByField]: "desc" as const }];

  // First, get features with total task count and status info
  const featuresRaw = await prisma.feature.findMany({
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    where: whereClause,
    orderBy,
    include: {
      _count: { select: { tasks: true } },
      status: true,
      assignee: true,
      creator: { select: { id: true, name: true, email: true } },
      implementer: { select: { id: true, name: true, email: true } },
    },
  });

  // Get completed task counts efficiently via a separate query
  const featureIds = featuresRaw.map((f) => f.id);
  const completedCounts = await prisma.task.groupBy({
    by: ["featureId"],
    where: {
      featureId: { in: featureIds },
      status: { category: "completed" },
    },
    _count: { id: true },
  });

  // Create a map for quick lookup
  const completedCountMap = new Map(
    completedCounts.map((c) => [c.featureId, c._count.id])
  );

  // Merge completed counts into features
  const features = featuresRaw.map((f) => ({
    ...f,
    completedTaskCount: completedCountMap.get(f.id) ?? 0,
  })) as FeatureWithCount[];

  const hasMore = features.length > limit;
  if (hasMore) {
    features.pop();
  }

  const lastFeature = features.at(-1);
  const nextCursor = hasMore && lastFeature ? lastFeature.id : null;

  return {
    data: features,
    meta: {
      cursor: nextCursor,
      hasMore,
    },
  };
}

/**
 * UUID v4 regex pattern for validation
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Feature identifier pattern (e.g., "ENG-123")
 */
const IDENTIFIER_REGEX = /^[A-Z]+-\d+$/i;

/**
 * Get a single feature by ID, identifier, or title with nested tasks.
 * Supports UUID (e.g., "550e8400-e29b-41d4-a716-446655440000"),
 * identifier (e.g., "ENG-4"), or exact title (case-sensitive) lookups.
 */
export async function getFeatureById(idOrIdentifierOrTitle: string): Promise<FeatureWithTasks | null> {
  const isUuid = UUID_REGEX.test(idOrIdentifierOrTitle);
  const isIdentifier = IDENTIFIER_REGEX.test(idOrIdentifierOrTitle);
  
  // Determine lookup strategy: UUID > identifier > title
  const whereClause = isUuid
    ? { id: idOrIdentifierOrTitle }
    : isIdentifier
      ? { identifier: idOrIdentifierOrTitle }
      : { title: idOrIdentifierOrTitle };

  return prisma.feature.findFirst({
    where: whereClause,
    include: {
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      epic: {
        select: {
          id: true,
          teamId: true,
        },
      },
      creator: { select: { id: true, name: true, email: true } },
      implementer: { select: { id: true, name: true, email: true } },
    },
  }) as Promise<FeatureWithTasks | null>;
}

/**
 * Create a new feature with auto-generated identifier.
 * Defaults to "Backlog" status if no status is provided.
 */
export async function createFeature(input: CreateFeatureInput, userId?: string): Promise<Feature> {
  // Validate required fields
  if (!input.title || input.title.trim() === "") {
    throw new ValidationError("Title is required");
  }
  if (!input.epicId || input.epicId.trim() === "") {
    throw new ValidationError("Epic ID is required");
  }

  // Verify epic exists and is not archived, get teamId for status lookup
  const epic = await prisma.epic.findUnique({
    where: { id: input.epicId },
    select: { id: true, isArchived: true, teamId: true },
  });

  if (!epic || epic.isArchived) {
    throw new NotFoundError(`Epic with id '${input.epicId}' not found`);
  }

  // Determine statusId: use provided, or default to Backlog
  let statusId = input.statusId;
  if (statusId !== undefined) {
    // Verify provided status exists
    const status = await prisma.status.findUnique({
      where: { id: statusId },
      select: { id: true },
    });
    if (!status) {
      throw new NotFoundError(`Status with id '${statusId}' not found`);
    }
  } else if (epic.teamId) {
    // Default to Backlog status for the team
    const backlogStatus = await getDefaultBacklogStatus(epic.teamId);
    if (backlogStatus) {
      statusId = backlogStatus.id;
    }
  }

  // Verify assignee exists and is active if provided
  if (input.assigneeId) {
    const user = await prisma.user.findUnique({
      where: { id: input.assigneeId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) {
      throw new NotFoundError(`User with id '${input.assigneeId}' not found`);
    }
  }

  // Generate identifier
  const identifier = await generateIdentifier(input.epicId);

  // Auto-generate sortOrder if not provided
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const lastFeature = await prisma.feature.findFirst({
      where: { epicId: input.epicId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    sortOrder = generateSortOrderBetween(lastFeature?.sortOrder ?? null, null);
  }

  // Build data object conditionally to avoid undefined values
  const data: {
    title: string;
    epicId: string;
    identifier: string;
    sortOrder: number;
    createdBy: string;
    description?: string;
    statusId?: string;
    assigneeId?: string;
    executionOrder?: number;
    canParallelize?: boolean;
    parallelGroup?: string;
    dependencies?: string;
    estimatedComplexity?: string;
  } = {
    title: input.title.trim(),
    epicId: input.epicId,
    identifier,
    sortOrder,
    createdBy: input.userId,
  };

  if (input.description !== undefined) {
    data.description = input.description.trim();
  }
  if (statusId !== undefined) {
    data.statusId = statusId;
  }
  if (input.assigneeId !== undefined) {
    data.assigneeId = input.assigneeId;
  }
  // Execution metadata
  if (input.executionOrder !== undefined) {
    data.executionOrder = input.executionOrder;
  }
  if (input.canParallelize !== undefined) {
    data.canParallelize = input.canParallelize;
  }
  if (input.parallelGroup !== undefined) {
    data.parallelGroup = input.parallelGroup;
  }
  if (input.dependencies !== undefined) {
    data.dependencies = JSON.stringify(input.dependencies);
  }
  if (input.estimatedComplexity !== undefined) {
    data.estimatedComplexity = input.estimatedComplexity;
  }

  const feature = await prisma.feature.create({ data });

  // Emit entity created event
  emitEntityCreated({
    entityType: "feature",
    entityId: feature.id,
    userId: userId ?? null,
    timestamp: new Date().toISOString(),
  });

  // Record creation in changelog (never fails the parent operation)
  changelogService.recordChange({
    entityType: "feature",
    entityId: feature.id,
    field: "_created",
    oldValue: null,
    newValue: JSON.stringify(feature),
    changedBy: userId ?? "system",
    epicId: feature.epicId,
  }).catch((error) => {
    console.error("Failed to record feature creation in changelog:", error);
  });

  return feature;
}

/**
 * Update an existing feature.
 * Supports UUID, identifier (e.g., "ENG-4"), or exact title lookups.
 */
export async function updateFeature(
  idOrIdentifierOrTitle: string,
  input: UpdateFeatureInput,
  userId?: string
): Promise<Feature> {
  // Resolve to UUID using same logic as getFeatureById
  const isUuid = UUID_REGEX.test(idOrIdentifierOrTitle);
  const isIdentifier = IDENTIFIER_REGEX.test(idOrIdentifierOrTitle);
  
  const whereClause = isUuid
    ? { id: idOrIdentifierOrTitle }
    : isIdentifier
      ? { identifier: idOrIdentifierOrTitle }
      : { title: idOrIdentifierOrTitle };
  
  // First check if feature exists
  const existing = await prisma.feature.findFirst({
    where: whereClause,
  });

  if (!existing) {
    throw new NotFoundError(`Feature with id '${idOrIdentifierOrTitle}' not found`);
  }

  // Use the actual UUID for all subsequent operations
  const id = existing.id;

  // Validate fields if provided
  if (input.title?.trim() === "") {
    throw new ValidationError("Title cannot be empty");
  }

  // Verify status exists and belongs to the same team if provided
  if (input.statusId) {
    const status = await prisma.status.findUnique({
      where: { id: input.statusId },
      select: { id: true, teamId: true },
    });
    if (!status) {
      throw new NotFoundError(`Status with id '${input.statusId}' not found`);
    }

    // Fetch the feature with its epic to get the team
    const featureWithEpic = await prisma.feature.findUnique({
      where: { id },
      include: { epic: { select: { teamId: true } } },
    });

    if (featureWithEpic && status.teamId !== featureWithEpic.epic.teamId) {
      throw new ValidationError("Cannot change status: status belongs to a different team");
    }
  }

  // Verify assignee exists and is active if provided
  if (input.assigneeId) {
    const user = await prisma.user.findUnique({
      where: { id: input.assigneeId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) {
      throw new NotFoundError(`User with id '${input.assigneeId}' not found`);
    }
  }

  // Build data object conditionally to avoid undefined values
  const data: {
    title?: string;
    description?: string;
    statusId?: string;
    assigneeId?: string;
    sortOrder?: number;
    executionOrder?: number;
    canParallelize?: boolean;
    parallelGroup?: string;
    dependencies?: string;
    estimatedComplexity?: string;
  } = {};

  if (input.title !== undefined) {
    data.title = input.title.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description.trim();
  }
  if (input.statusId !== undefined) {
    data.statusId = input.statusId;
  }
  if (input.assigneeId !== undefined) {
    data.assigneeId = input.assigneeId;
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }
  // Execution metadata
  if (input.executionOrder !== undefined) {
    data.executionOrder = input.executionOrder;
  }
  if (input.canParallelize !== undefined) {
    data.canParallelize = input.canParallelize;
  }
  if (input.parallelGroup !== undefined) {
    data.parallelGroup = input.parallelGroup;
  }
  if (input.dependencies !== undefined) {
    data.dependencies = JSON.stringify(input.dependencies);
  }
  if (input.estimatedComplexity !== undefined) {
    data.estimatedComplexity = input.estimatedComplexity;
  }

  // Track old status for event emission
  const oldStatusId = existing.statusId;

  // Fetch the entity BEFORE the update for changelog diff
  const beforeSnapshot = await prisma.feature.findUnique({
    where: { id },
  });

  const updatedFeature = await prisma.feature.update({
    where: { id },
    data,
  });

  // Compute changed fields by comparing input with existing
  const changedFields = Object.keys(data);

  // Emit entity updated event
  if (changedFields.length > 0) {
    emitEntityUpdated({
      entityType: "feature",
      entityId: id,
      changedFields,
      userId: userId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit status changed event if status was updated
  if (input.statusId !== undefined && input.statusId !== oldStatusId) {
    const payload: StatusChangedPayload = {
      entityType: "feature",
      entityId: id,
      oldStatusId,
      newStatusId: input.statusId,
      timestamp: new Date(),
    };
    if (userId) {
      payload.changedBy = userId;
    }
    emitStatusChanged(payload);
  }

  // Record changes in changelog using diffAndRecord (never fails the parent operation)
  if (beforeSnapshot) {
    changelogService.diffAndRecord(
      "feature",
      id,
      beforeSnapshot,
      updatedFeature,
      userId ?? "system",
      updatedFeature.epicId
    ).catch((error) => {
      console.error("Failed to record feature update in changelog:", error);
    });
  }

  // ENG-113-3: Auto-emit session event on feature status change
  if (input.statusId !== undefined && input.statusId !== oldStatusId) {
    emitSessionEventToEpic(updatedFeature.epicId, {
      type: "feature_status_change",
      payload: {
        featureId: id,
        identifier: updatedFeature.identifier,
        title: updatedFeature.title,
        newStatusId: input.statusId,
        previousStatusId: oldStatusId ?? null,
      },
    }).catch(() => {});
  }

  return updatedFeature;
}

/**
 * Delete a feature (hard delete - cascade will remove tasks).
 * Supports UUID, identifier (e.g., "ENG-4"), or exact title lookups.
 */
export async function deleteFeature(idOrIdentifierOrTitle: string, userId?: string): Promise<void> {
  // Resolve to UUID using same logic as getFeatureById
  const isUuid = UUID_REGEX.test(idOrIdentifierOrTitle);
  const isIdentifier = IDENTIFIER_REGEX.test(idOrIdentifierOrTitle);
  
  const whereClause = isUuid
    ? { id: idOrIdentifierOrTitle }
    : isIdentifier
      ? { identifier: idOrIdentifierOrTitle }
      : { title: idOrIdentifierOrTitle };
  
  // First check if feature exists
  const existing = await prisma.feature.findFirst({
    where: whereClause,
  });

  if (!existing) {
    throw new NotFoundError(`Feature with id '${idOrIdentifierOrTitle}' not found`);
  }

  await prisma.feature.delete({
    where: { id: existing.id },
  });

  // Emit entity deleted event
  emitEntityDeleted({
    entityType: "feature",
    entityId: existing.id,
    userId: userId ?? null,
    timestamp: new Date().toISOString(),
  });
}
