import { prisma } from "../lib/db.js";
import type { Task } from "../generated/prisma/index.js";
import { NotFoundError, ValidationError } from "../errors/index.js";
import { generateSortOrderBetween } from "../utils/ordering.js";
import { buildDateFilters } from "../utils/dateParser.js";
import {
  resolveAssigneeId,
  isAssigneeNone,
  isAssigneeInvalid,
} from "../utils/assignee.js";
import {
  resolveStatusesToIds,
  getStatusIdsByCategory,
  getDefaultBacklogStatus,
} from "./statusService.js";
import { emitStatusChanged, emitEntityCreated, emitEntityUpdated, emitEntityDeleted, type StatusChangedPayload } from "../events/index.js";
import { getAccessibleScopes, hasAccessibleScopes } from "../utils/scopeContext.js";
import * as changelogService from "./changelogService.js";
import { emitSessionEventToEpic, triggerBarneyAudit } from "./epicService.js";

// Types for task operations
export interface CreateTaskInput {
  title: string;
  featureId: string;
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

export interface UpdateTaskInput {
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

export type TaskOrderBy = 'sortOrder' | 'createdAt' | 'updatedAt';

export interface ListTasksOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  featureId?: string | undefined;
  /** Filter by epic ID (returns tasks across all features in the epic) */
  epicId?: string | undefined;
  /** @deprecated Use `status` instead for enhanced filtering */
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
  orderBy?: TaskOrderBy | undefined;
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

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Generate a unique identifier for a task based on parent feature identifier
 * Format: FEATURE_IDENTIFIER-NUMBER (e.g., "COM-123-1", "COM-123-2")
 * 
 * Uses MAX(identifier suffix) + 1 with retry to avoid race conditions when multiple
 * tasks are created concurrently for the same feature.
 */
async function generateIdentifier(featureId: string, maxRetries = 5): Promise<string> {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
    select: { identifier: true },
  });

  if (!feature) {
    throw new NotFoundError(`Feature with id '${featureId}' not found`);
  }

  // Find the highest existing task number for this feature
  const existingTasks = await prisma.task.findMany({
    where: { featureId },
    select: { identifier: true },
  });

  let maxNumber = 0;
  const prefix = `${feature.identifier}-`;
  
  for (const task of existingTasks) {
    if (task.identifier.startsWith(prefix)) {
      const suffix = task.identifier.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  // Try to generate a unique identifier, retrying on collision
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const identifier = `${feature.identifier}-${String(maxNumber + 1 + attempt)}`;

    // Check if this identifier already exists
    const existing = await prisma.task.findUnique({
      where: { identifier },
      select: { id: true },
    });

    if (!existing) {
      return identifier;
    }
  }

  // Fallback: use timestamp-based suffix to guarantee uniqueness
  const timestamp = Date.now();
  return `${feature.identifier}-${String(maxNumber + 1 + maxRetries)}-${timestamp}`;
}

/**
 * List tasks with cursor-based pagination
 * Ordered by sortOrder (asc), then createdAt (desc)
 * When currentUserId is provided, filters to only show tasks in accessible scopes
 */
export async function listTasks(
  options: ListTasksOptions = {}
): Promise<PaginatedResult<Task>> {
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
    featureId?: string;
    feature?: {
      epicId?: string;
      epic?: {
        OR?: Array<{ teamId?: { in: string[] }; personalScopeId?: string }>;
      };
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

    // Build OR clause for epics in accessible scopes (via feature → epic)
    const scopeConditions: Array<{ teamId?: { in: string[] }; personalScopeId?: string }> = [];

    if (accessibleScopes.teamIds.length > 0) {
      scopeConditions.push({ teamId: { in: accessibleScopes.teamIds } });
    }
    if (accessibleScopes.personalScopeId) {
      scopeConditions.push({ personalScopeId: accessibleScopes.personalScopeId });
    }

    whereClause.feature = { epic: { OR: scopeConditions } };
  }

  if (options.featureId !== undefined) {
    whereClause.featureId = options.featureId;
  }

  // Filter by epic (returns tasks across all features in the epic)
  if (options.epicId !== undefined) {
    // Merge with existing feature filter if scope filtering applied
    if (whereClause.feature) {
      whereClause.feature.epicId = options.epicId;
    } else {
      whereClause.feature = { epicId: options.epicId };
    }
  }

  // Handle status filtering (supports statusId, status name/array, and statusCategory)
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Legacy support for direct statusId
  if (options.statusId !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
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
    ? [{ sortOrder: "asc" as const }, { identifier: "asc" as const }]
    : [{ [orderByField]: "desc" as const }];

  const tasks = await prisma.task.findMany({
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    where: whereClause,
    orderBy,
    include: {
      status: true,
      assignee: true,
      creator: { select: { id: true, name: true, email: true } },
      implementer: { select: { id: true, name: true, email: true } },
      feature: {
        select: {
          id: true,
          identifier: true,
          title: true,
        },
      },
    },
  });

  const hasMore = tasks.length > limit;
  if (hasMore) {
    tasks.pop();
  }

  const lastTask = tasks.at(-1);
  const nextCursor = hasMore && lastTask ? lastTask.id : null;

  return {
    data: tasks,
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
 * Get a single task by ID or identifier.
 * Supports both UUID (e.g., "550e8400-e29b-41d4-a716-446655440000") and
 * identifier (e.g., "ENG-4-1") lookups.
 */
export async function getTaskById(idOrIdentifier: string): Promise<Task | null> {
  const isUuid = UUID_REGEX.test(idOrIdentifier);
  return prisma.task.findFirst({
    where: isUuid
      ? { id: idOrIdentifier }
      : { identifier: idOrIdentifier },
    include: {
      status: true,
      assignee: true,
      creator: { select: { id: true, name: true, email: true } },
      implementer: { select: { id: true, name: true, email: true } },
      feature: {
        select: {
          id: true,
          identifier: true,
          title: true,
          epicId: true,
          epic: {
            select: {
              id: true,
              name: true,
              teamId: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Create a new task with auto-generated identifier.
 * Defaults to "Backlog" status if no status is provided.
 */
export async function createTask(input: CreateTaskInput, userId?: string): Promise<Task> {
  // Validate required fields
  if (!input.title || input.title.trim() === "") {
    throw new ValidationError("Title is required");
  }
  if (!input.featureId || input.featureId.trim() === "") {
    throw new ValidationError("Feature ID is required");
  }

  // Verify feature exists and get teamId for status lookup
  const feature = await prisma.feature.findUnique({
    where: { id: input.featureId },
    select: { 
      id: true, 
      epic: { 
        select: { teamId: true } 
      } 
    },
  });

  if (!feature) {
    throw new NotFoundError(`Feature with id '${input.featureId}' not found`);
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
  } else if (feature.epic.teamId) {
    // Default to Backlog status for the team
    const backlogStatus = await getDefaultBacklogStatus(feature.epic.teamId);
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

  // Auto-generate sortOrder if not provided
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const lastTask = await prisma.task.findFirst({
      where: { featureId: input.featureId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    sortOrder = generateSortOrderBetween(lastTask?.sortOrder ?? null, null);
  }

  // Retry loop to handle concurrent task creation (unique constraint on identifier)
  const maxRetries = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Generate identifier based on parent feature (re-generate on retry)
      const identifier = await generateIdentifier(input.featureId);

      // Build data object conditionally to avoid undefined values
      const data: {
        title: string;
        featureId: string;
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
        featureId: input.featureId,
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

      const task = await prisma.task.create({ data });

      // Emit entity created event
      emitEntityCreated({
        entityType: "task",
        entityId: task.id,
        userId: userId ?? null,
        timestamp: new Date().toISOString(),
      });

      // Record creation in changelog (never fails the parent operation)
      // epicId needs to be resolved via feature
      const taskWithFeature = await prisma.task.findUnique({
        where: { id: task.id },
        select: { feature: { select: { epicId: true } } },
      });

      if (taskWithFeature?.feature.epicId) {
        changelogService.recordChange({
          entityType: "task",
          entityId: task.id,
          field: "_created",
          oldValue: null,
          newValue: JSON.stringify(task),
          changedBy: userId ?? "system",
          epicId: taskWithFeature.feature.epicId,
        }).catch((error) => {
          console.error("Failed to record task creation in changelog:", error);
        });
      }

      return task;
    } catch (error) {
      lastError = error;
      // Check if this is a unique constraint error on identifier
      const isUniqueConstraintError = 
        error instanceof Error && 
        (error.message.includes('Unique constraint') || 
         error.message.includes('unique constraint') ||
         error.message.includes('duplicate key'));
      
      if (!isUniqueConstraintError || attempt === maxRetries - 1) {
        throw error;
      }
      // Small delay before retry to reduce collision likelihood
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }

  throw lastError;
}

/**
 * Update an existing task
 */
export async function updateTask(
  idOrIdentifier: string,
  input: UpdateTaskInput,
  userId?: string
): Promise<Task> {
  // Resolve identifier to UUID if needed
  const isUuid = UUID_REGEX.test(idOrIdentifier);
  
  // First check if task exists
  const existing = await prisma.task.findFirst({
    where: isUuid
      ? { id: idOrIdentifier }
      : { identifier: idOrIdentifier },
  });

  if (!existing) {
    throw new NotFoundError(`Task with id '${idOrIdentifier}' not found`);
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

    // Fetch the task with its feature and epic to get the team
    const taskWithFeatureEpic = await prisma.task.findUnique({
      where: { id },
      include: { feature: { include: { epic: { select: { teamId: true } } } } },
    });

    if (taskWithFeatureEpic && status.teamId !== taskWithFeatureEpic.feature.epic.teamId) {
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
  const beforeSnapshot = await prisma.task.findUnique({
    where: { id },
  });

  const updatedTask = await prisma.task.update({
    where: { id },
    data,
  });

  // Compute changed fields
  const changedFields = Object.keys(data);

  // Emit entity updated event
  if (changedFields.length > 0) {
    emitEntityUpdated({
      entityType: "task",
      entityId: id,
      changedFields,
      userId: userId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit status changed event if status was updated
  if (input.statusId !== undefined && input.statusId !== oldStatusId) {
    const payload: StatusChangedPayload = {
      entityType: "task",
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

  // Record changes in changelog + auto-instrumentation session events
  // epicId needs to be resolved via feature
  if (beforeSnapshot) {
    const taskWithFeature = await prisma.task.findUnique({
      where: { id },
      select: {
        feature: { select: { epicId: true } },
        remediationCase: { select: { id: true } },
      },
    });

    if (taskWithFeature?.feature.epicId) {
      const epicId = taskWithFeature.feature.epicId;

      changelogService.diffAndRecord(
        "task",
        id,
        beforeSnapshot,
        updatedTask,
        userId ?? "system",
        epicId
      ).catch((error) => {
        console.error("Failed to record task update in changelog:", error);
      });

      // ENG-113-2 & 113-4 & ENG-163: Auto-emit session event on status change
      if (input.statusId !== undefined && input.statusId !== oldStatusId) {
        const isRemediation = Boolean(taskWithFeature.remediationCase);
        const eventType = isRemediation ? "remediation_complete" : "task_status_change";

        // ENG-163-3: Resolve new status category once — used for both completion
        // summary payload and the Barney audit trigger (avoids duplicate DB query)
        const newStatusInfo = await prisma.status.findUnique({
          where: { id: input.statusId },
          select: { category: true },
        });

        // ENG-163-3: For task completion, include progress summary so session
        // consumers can determine overall feature progress from the event payload
        let progressSummary: Record<string, number> = {};
        if (newStatusInfo?.category === "completed") {
          const [totalTaskCount, completedTaskCount] = await Promise.all([
            prisma.task.count({ where: { featureId: updatedTask.featureId } }),
            prisma.task.count({
              where: {
                featureId: updatedTask.featureId,
                status: { category: "completed" },
              },
            }),
          ]);
          progressSummary = { completedTaskCount, totalTaskCount };
        }

        emitSessionEventToEpic(epicId, {
          type: eventType,
          payload: {
            taskId: id,
            identifier: updatedTask.identifier,
            title: updatedTask.title,
            newStatusId: input.statusId,
            previousStatusId: oldStatusId ?? null,
            ...progressSummary,
          },
        }).catch(() => {});

        // ENG-117-5: When a remediation task completes, re-trigger Barney audit
        if (isRemediation && newStatusInfo?.category === "completed") {
          const activeSession = await prisma.aiSession.findFirst({
            where: { epicId, status: "active" },
            select: { id: true },
          });
          if (activeSession) {
            triggerBarneyAudit(epicId, activeSession.id).catch(() => {});
          }
        }
      }
    }
  }

  return updatedTask;
}

/**
 * Delete a task (hard delete)
 */
export async function deleteTask(idOrIdentifier: string, userId?: string): Promise<void> {
  // Resolve identifier to UUID if needed
  const isUuid = UUID_REGEX.test(idOrIdentifier);
  
  // First check if task exists
  const existing = await prisma.task.findFirst({
    where: isUuid
      ? { id: idOrIdentifier }
      : { identifier: idOrIdentifier },
  });

  if (!existing) {
    throw new NotFoundError(`Task with id '${idOrIdentifier}' not found`);
  }

  await prisma.task.delete({
    where: { id: existing.id },
  });

  // Emit entity deleted event
  emitEntityDeleted({
    entityType: "task",
    entityId: existing.id,
    userId: userId ?? null,
    timestamp: new Date().toISOString(),
  });
}
