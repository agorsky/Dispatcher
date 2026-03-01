import { prisma } from "../lib/db.js";
import type { Epic } from "../generated/prisma/index.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../errors/index.js";
import { generateSortOrderBetween } from "../utils/ordering.js";
import { getAccessibleScopes, hasAccessibleScopes } from "../utils/scopeContext.js";
import { createPersonalScope } from "./personalScopeService.js";
import * as changelogService from "./changelogService.js";
import { emitEntityCreated, emitEntityUpdated, emitEntityDeleted } from "../events/index.js";

// Types for epic operations
export interface CreateEpicInput {
  name: string;
  teamId: string;
  userId: string; // The authenticated user ID - auto-populates createdBy
  description?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
  sortOrder?: number | undefined;
}

export interface UpdateEpicInput {
  name?: string | undefined;
  description?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
  sortOrder?: number | undefined;
}

export type EpicOrderBy = 'sortOrder' | 'createdAt' | 'updatedAt';

export interface ListEpicsOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  teamId?: string | undefined;
  orderBy?: EpicOrderBy | undefined;
  includeArchived?: boolean | undefined;
  /** Current user ID - when provided, filters to only show epics in accessible scopes */
  currentUserId?: string | undefined;
  /** Filter by epic creator user ID */
  createdBy?: string | undefined;
}

export interface EpicWithCount extends Epic {
  _count: {
    features: number;
  };
  team?: {
    id: string;
    name: string;
    key: string;
  } | null;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/**
 * List epics with cursor-based pagination
 * Ordered by sortOrder, then createdAt
 * When currentUserId is provided, filters to only show epics in accessible scopes
 */
export async function listEpics(
  options: ListEpicsOptions = {}
): Promise<PaginatedResult<EpicWithCount>> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  // Build where clause conditionally to avoid undefined values
  const whereClause: {
    isArchived?: boolean;
    teamId?: string;
    createdBy?: string;
    OR?: Array<{ teamId?: { in: string[] }; personalScopeId?: string | { in: string[] } }>;
  } = {};
  
  if (!options.includeArchived) {
    whereClause.isArchived = false;
  }

  // Apply createdBy filter if provided
  if (options.createdBy !== undefined) {
    whereClause.createdBy = options.createdBy;
  }

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

    // Build OR clause for accessible scopes
    const scopeConditions: Array<{ teamId?: { in: string[] }; personalScopeId?: string }> = [];

    if (accessibleScopes.teamIds.length > 0) {
      scopeConditions.push({ teamId: { in: accessibleScopes.teamIds } });
    }
    if (accessibleScopes.personalScopeId) {
      scopeConditions.push({ personalScopeId: accessibleScopes.personalScopeId });
    }

    whereClause.OR = scopeConditions;
  }

  // If teamId filter is provided, apply it (overrides scope filter for specific team queries)
  if (options.teamId !== undefined) {
    // When teamId is explicitly provided, use it directly
    // The scope filter above already ensures user can only see their accessible projects
    // But if explicitly requesting a team, we filter to just that team
    delete whereClause.OR;
    whereClause.teamId = options.teamId;
  }

  // Determine order by field
  const orderByField = options.orderBy ?? 'createdAt';
  const orderBy = orderByField === 'sortOrder'
    ? [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }]
    : [{ [orderByField]: "desc" as const }];

  const epics = await prisma.epic.findMany({
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor } } : {}),
    where: whereClause,
    orderBy,
    include: { 
      _count: { select: { features: true } },
      team: true,
      creator: { select: { id: true, name: true, email: true } },
      implementer: { select: { id: true, name: true, email: true } },
    },
  }) as EpicWithCount[];

  const hasMore = epics.length > limit;
  if (hasMore) {
    epics.pop();
  }

  const lastEpic = epics.at(-1);
  const nextCursor = hasMore && lastEpic ? lastEpic.id : null;

  return {
    data: epics,
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

export interface GetEpicOptions {
  includeArchived?: boolean | undefined;
}

/**
 * Get a single epic by ID or name.
 * Supports both UUID (e.g., "550e8400-e29b-41d4-a716-446655440000") and
 * exact epic name (case-sensitive) lookups.
 */
export async function getEpicById(
  idOrName: string,
  options: GetEpicOptions = {}
): Promise<EpicWithCount | null> {
  const isUuid = UUID_REGEX.test(idOrName);
  const whereClause: { id?: string; name?: string; isArchived?: boolean } = isUuid
    ? { id: idOrName }
    : { name: idOrName };
  
  if (!options.includeArchived) {
    whereClause.isArchived = false;
  }
  
  return prisma.epic.findFirst({
    where: whereClause,
    include: {
      _count: { select: { features: true } },
      team: { select: { id: true, name: true, key: true } },
      creator: { select: { id: true, name: true, email: true } },
      implementer: { select: { id: true, name: true, email: true } },
    },
  }) as Promise<EpicWithCount | null>;
}

/**
 * Create a new epic
 */
export async function createEpic(input: CreateEpicInput, userId?: string): Promise<Epic> {
  // Validate required fields
  if (!input.name || input.name.trim() === "") {
    throw new ValidationError("Name is required");
  }
  if (!input.teamId || input.teamId.trim() === "") {
    throw new ValidationError("Team ID is required");
  }

  // Verify team exists and is not archived
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { id: true, isArchived: true },
  });

  if (!team || team.isArchived) {
    throw new NotFoundError(`Team with id '${input.teamId}' not found`);
  }

  // Auto-generate sortOrder if not provided
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const lastEpic = await prisma.epic.findFirst({
      where: { teamId: input.teamId, isArchived: false },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    sortOrder = generateSortOrderBetween(lastEpic?.sortOrder ?? null, null);
  }

  // Build data object conditionally to avoid undefined values
  const data: {
    name: string;
    teamId: string;
    sortOrder: number;
    createdBy: string;
    description?: string;
    icon?: string;
    color?: string;
  } = {
    name: input.name.trim(),
    teamId: input.teamId,
    sortOrder,
    createdBy: input.userId,
  };

  if (input.description !== undefined) {
    data.description = input.description.trim();
  }
  if (input.icon !== undefined) {
    data.icon = input.icon.trim();
  }
  if (input.color !== undefined) {
    data.color = input.color.trim();
  }

  const epic = await prisma.epic.create({ data });

  // Emit entity created event
  emitEntityCreated({
    entityType: "epic",
    entityId: epic.id,
    userId: userId ?? null,
    timestamp: new Date().toISOString(),
  });

  // Record creation in changelog (never fails the parent operation)
  changelogService.recordChange({
    entityType: "epic",
    entityId: epic.id,
    field: "_created",
    oldValue: null,
    newValue: JSON.stringify(epic),
    changedBy: userId ?? "system",
    epicId: epic.id,
  }).catch((error) => {
    console.error("Failed to record epic creation in changelog:", error);
  });

  return epic;
}

/**
 * Update an existing epic.
 * Supports both UUID and exact epic name lookups.
 */
export async function updateEpic(
  idOrName: string,
  input: UpdateEpicInput,
  userId?: string
): Promise<Epic> {
  // First check if epic exists and is not archived
  const isUuid = UUID_REGEX.test(idOrName);
  const existing = await prisma.epic.findFirst({
    where: isUuid
      ? { id: idOrName }
      : { name: idOrName },
  });

  if (!existing) {
    throw new NotFoundError(`Epic with id '${idOrName}' not found`);
  }

  // Use the resolved UUID for the update
  const id = existing.id;

  // Validate fields if provided
  if (input.name?.trim() === "") {
    throw new ValidationError("Name cannot be empty");
  }

  // Build data object conditionally to avoid undefined values
  const data: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    sortOrder?: number;
  } = {};

  if (input.name !== undefined) {
    data.name = input.name.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description.trim();
  }
  if (input.icon !== undefined) {
    data.icon = input.icon.trim();
  }
  if (input.color !== undefined) {
    data.color = input.color.trim();
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }

  // Fetch the entity BEFORE the update for changelog diff
  const beforeSnapshot = await prisma.epic.findUnique({
    where: { id },
  });

  const updatedEpic = await prisma.epic.update({
    where: { id },
    data,
  });

  // Compute changed fields
  const changedFields = Object.keys(data);

  // Emit entity updated event
  if (changedFields.length > 0) {
    emitEntityUpdated({
      entityType: "epic",
      entityId: id,
      changedFields,
      userId: userId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  // Record changes in changelog using diffAndRecord (never fails the parent operation)
  if (beforeSnapshot) {
    changelogService.diffAndRecord(
      "epic",
      id,
      beforeSnapshot,
      updatedEpic,
      userId ?? "system",
      id // epicId is the entity's own ID
    ).catch((error) => {
      console.error("Failed to record epic update in changelog:", error);
    });
  }

  return updatedEpic;
}

/**
 * Delete an epic.
 * - If not archived: soft delete (set isArchived = true)
 * - If already archived: hard delete (permanent removal)
 * Supports both UUID and exact epic name lookups.
 */
export async function deleteEpic(idOrName: string, userId?: string): Promise<void> {
  // First check if epic exists
  const isUuid = UUID_REGEX.test(idOrName);
  const existing = await prisma.epic.findFirst({
    where: isUuid
      ? { id: idOrName }
      : { name: idOrName },
  });

  if (!existing) {
    throw new NotFoundError(`Epic with id '${idOrName}' not found`);
  }

  // If already archived, perform hard delete (permanent)
  if (existing.isArchived) {
    await prisma.epic.delete({
      where: { id: existing.id },
    });
    
    // Emit entity deleted event
    emitEntityDeleted({
      entityType: "epic",
      entityId: existing.id,
      userId: userId ?? null,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Otherwise, soft delete (archive)
  await prisma.epic.update({
    where: { id: existing.id },
    data: { isArchived: true },
  });
  
  // Note: We don't emit ENTITY_DELETED for soft deletes (archiving)
  // as the epic still exists in the database
}

/**
 * Archive an epic (set isArchived = true).
 * Returns the updated epic.
 * Supports both UUID and exact epic name lookups.
 */
export async function archiveEpic(idOrName: string): Promise<Epic> {
  const isUuid = UUID_REGEX.test(idOrName);
  const existing = await prisma.epic.findFirst({
    where: isUuid
      ? { id: idOrName }
      : { name: idOrName },
  });

  if (!existing) {
    throw new NotFoundError(`Epic with id '${idOrName}' not found`);
  }

  if (existing.isArchived) {
    throw new ValidationError("Epic is already archived");
  }

  const archivedEpic = await prisma.epic.update({
    where: { id: existing.id },
    data: { isArchived: true },
  });

  // Record archive action in changelog (never fails the parent operation)
  changelogService.recordChange({
    entityType: "epic",
    entityId: existing.id,
    field: "_archived",
    oldValue: false,
    newValue: true,
    changedBy: "system", // TODO: Pass actual user ID when available
    epicId: existing.id,
  }).catch((error) => {
    console.error("Failed to record epic archive in changelog:", error);
  });

  return archivedEpic;
}

/**
 * Unarchive an epic (set isArchived = false).
 * Returns the updated epic.
 * Supports both UUID and exact epic name lookups.
 */
export async function unarchiveEpic(idOrName: string): Promise<Epic> {
  const isUuid = UUID_REGEX.test(idOrName);
  const existing = await prisma.epic.findFirst({
    where: isUuid
      ? { id: idOrName }
      : { name: idOrName },
  });

  if (!existing) {
    throw new NotFoundError(`Epic with id '${idOrName}' not found`);
  }

  if (!existing.isArchived) {
    throw new ValidationError("Epic is not archived");
  }

  return prisma.epic.update({
    where: { id: existing.id },
    data: { isArchived: false },
  });
}

// =============================================================================
// Composite Epic Creation
// =============================================================================

import type {
  CreateEpicCompleteInput,
  CreateEpicCompleteResponse,
  CompositeFeatureResponse,
  CompositeTaskResponse,
} from "../schemas/compositeEpic.js";
import { createEpicCompleteInputSchema } from "../schemas/compositeEpic.js";
import { structuredDescriptionSchema } from "../schemas/structuredDescription.js";
import { structuredDescToMarkdown } from "./structuredDescriptionService.js";

/**
 * Create a complete epic with all features, tasks, and structured descriptions
 * in a single transactional operation.
 *
 * This is an all-or-nothing operation - if any step fails, the entire
 * transaction is rolled back.
 */
export async function createEpicComplete(
  input: CreateEpicCompleteInput,
  userId: string
): Promise<CreateEpicCompleteResponse> {
  // Validate input against schema
  const validationResult = createEpicCompleteInputSchema.safeParse(input);
  if (!validationResult.success) {
    throw new ValidationError(
      `Invalid input: ${validationResult.error.errors.map((e) => e.message).join(", ")}`
    );
  }
  const validatedInput = validationResult.data;

  // Resolve team ID
  const team = await prisma.team.findFirst({
    where: {
      OR: [
        { id: validatedInput.team },
        { name: validatedInput.team },
        { key: validatedInput.team },
      ],
      isArchived: false,
    },
    select: { id: true, key: true },
  });

  if (!team) {
    throw new NotFoundError(`Team '${validatedInput.team}' not found`);
  }

  // Get default backlog status for the team
  const backlogStatus = await prisma.status.findFirst({
    where: {
      teamId: team.id,
      category: "backlog",
    },
    select: { id: true },
  });

  // Use a transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the epic
    const lastEpic = await tx.epic.findFirst({
      where: { teamId: team.id, isArchived: false },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const epicSortOrder = generateSortOrderBetween(lastEpic?.sortOrder ?? null, null);

    // Stringify structured description if provided
    let epicStructuredDesc: string | null = null;
    if (validatedInput.structuredDesc) {
      const structValidation = structuredDescriptionSchema.safeParse(validatedInput.structuredDesc);
      if (!structValidation.success) {
        throw new ValidationError(
          `Invalid structuredDesc for epic '${validatedInput.name}': ${structValidation.error.message}`
        );
      }
      epicStructuredDesc = JSON.stringify(structValidation.data);
    }

    // Build epic data with proper null handling for Prisma
    const epicData: {
      name: string;
      teamId: string;
      sortOrder: number;
      createdBy: string;
      description?: string | null;
      icon?: string | null;
      color?: string | null;
      structuredDesc?: string | null;
    } = {
      name: validatedInput.name.trim(),
      teamId: team.id,
      sortOrder: epicSortOrder,
      createdBy: userId,
    };
    if (validatedInput.description !== undefined) {
      epicData.description = validatedInput.description.trim();
    } else if (validatedInput.structuredDesc) {
      epicData.description = structuredDescToMarkdown(validatedInput.structuredDesc);
    }
    if (validatedInput.icon !== undefined) {
      epicData.icon = validatedInput.icon;
    }
    if (validatedInput.color !== undefined) {
      epicData.color = validatedInput.color;
    }
    if (epicStructuredDesc !== null) {
      epicData.structuredDesc = epicStructuredDesc;
    }

    const epic = await tx.epic.create({ data: epicData });

    // Track feature ID mapping for dependency resolution
    const featureIdMap: Map<number, string> = new Map();
    const createdFeatures: CompositeFeatureResponse[] = [];
    let totalTasks = 0;

    // 2. Create features with their tasks
    for (let featureIndex = 0; featureIndex < validatedInput.features.length; featureIndex++) {
      const featureInput = validatedInput.features[featureIndex]!;

      // Generate feature identifier
      const existingFeatures = await tx.feature.findMany({
        where: { epic: { teamId: team.id } },
        select: { identifier: true },
      });

      let maxNumber = 0;
      const fullPrefix = `${team.key}-`;
      for (const f of existingFeatures) {
        if (f.identifier.startsWith(fullPrefix)) {
          const suffix = f.identifier.slice(fullPrefix.length);
          const match = suffix.match(/^(\d+)/);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNumber) {
              maxNumber = num;
            }
          }
        }
      }
      const featureIdentifier = `${team.key}-${maxNumber + 1}`;

      // Calculate feature sortOrder
      const lastFeature = await tx.feature.findFirst({
        where: { epicId: epic.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const featureSortOrder = generateSortOrderBetween(lastFeature?.sortOrder ?? null, null);

      // Resolve dependencies (convert indices to UUIDs)
      let dependencies: string | null = null;
      if (featureInput.dependencies && featureInput.dependencies.length > 0) {
        const depIds: string[] = [];
        for (const depIndex of featureInput.dependencies) {
          const depId = featureIdMap.get(depIndex);
          if (!depId) {
            throw new ValidationError(
              `Feature at index ${featureIndex} has dependency on index ${depIndex} which hasn't been created yet. Dependencies must reference earlier features.`
            );
          }
          depIds.push(depId);
        }
        dependencies = JSON.stringify(depIds);
      }

      // Stringify structured description if provided
      let featureStructuredDesc: string | null = null;
      if (featureInput.structuredDesc) {
        const structValidation = structuredDescriptionSchema.safeParse(featureInput.structuredDesc);
        if (!structValidation.success) {
          throw new ValidationError(
            `Invalid structuredDesc for feature '${featureInput.title}': ${structValidation.error.message}`
          );
        }
        featureStructuredDesc = JSON.stringify(structValidation.data);
      }

      // Build feature data with proper null handling
      const featureData: {
        title: string;
        epicId: string;
        identifier: string;
        sortOrder: number;
        createdBy: string;
        description?: string | null;
        statusId?: string | null;
        executionOrder?: number | null;
        estimatedComplexity?: string | null;
        canParallelize: boolean;
        parallelGroup?: string | null;
        dependencies?: string | null;
        structuredDesc?: string | null;
      } = {
        title: featureInput.title.trim(),
        epicId: epic.id,
        identifier: featureIdentifier,
        sortOrder: featureSortOrder,
        canParallelize: featureInput.canParallelize ?? false,
        createdBy: userId,
      };
      if (backlogStatus?.id !== undefined) {
        featureData.statusId = backlogStatus.id;
      }
      if (featureInput.description !== undefined) {
        featureData.description = featureInput.description;
      } else if (featureInput.structuredDesc) {
        featureData.description = structuredDescToMarkdown(featureInput.structuredDesc);
      }
      if (featureInput.executionOrder !== undefined) {
        featureData.executionOrder = featureInput.executionOrder;
      }
      if (featureInput.estimatedComplexity !== undefined) {
        featureData.estimatedComplexity = featureInput.estimatedComplexity;
      }
      if (featureInput.parallelGroup !== undefined) {
        featureData.parallelGroup = featureInput.parallelGroup;
      }
      if (dependencies !== null) {
        featureData.dependencies = dependencies;
      }
      if (featureStructuredDesc !== null) {
        featureData.structuredDesc = featureStructuredDesc;
      }

      // Create the feature
      const feature = await tx.feature.create({ data: featureData });

      // Store the feature ID for dependency resolution
      featureIdMap.set(featureIndex, feature.id);

      // 3. Create tasks for this feature
      const createdTasks: CompositeTaskResponse[] = [];

      for (let taskIndex = 0; taskIndex < featureInput.tasks.length; taskIndex++) {
        const taskInput = featureInput.tasks[taskIndex]!;

        // Generate task identifier
        const taskIdentifier = `${featureIdentifier}-${taskIndex + 1}`;

        // Calculate task sortOrder
        const lastTask = await tx.task.findFirst({
          where: { featureId: feature.id },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        const taskSortOrder = generateSortOrderBetween(lastTask?.sortOrder ?? null, null);

        // Stringify structured description if provided
        let taskStructuredDesc: string | null = null;
        if (taskInput.structuredDesc) {
          const structValidation = structuredDescriptionSchema.safeParse(taskInput.structuredDesc);
          if (!structValidation.success) {
            throw new ValidationError(
              `Invalid structuredDesc for task '${taskInput.title}': ${structValidation.error.message}`
            );
          }
          taskStructuredDesc = JSON.stringify(structValidation.data);
        }

        // Build task data with proper null handling
        const taskData: {
          title: string;
          featureId: string;
          identifier: string;
          sortOrder: number;
          createdBy: string;
          description?: string | null;
          statusId?: string | null;
          executionOrder?: number | null;
          estimatedComplexity?: string | null;
          structuredDesc?: string | null;
        } = {
          title: taskInput.title.trim(),
          featureId: feature.id,
          identifier: taskIdentifier,
          sortOrder: taskSortOrder,
          createdBy: userId,
        };
        if (backlogStatus?.id !== undefined) {
          taskData.statusId = backlogStatus.id;
        }
        if (taskInput.description !== undefined) {
          taskData.description = taskInput.description;
        } else if (taskInput.structuredDesc) {
          taskData.description = structuredDescToMarkdown(taskInput.structuredDesc);
        }
        if (taskInput.executionOrder !== undefined) {
          taskData.executionOrder = taskInput.executionOrder;
        }
        if (taskInput.estimatedComplexity !== undefined) {
          taskData.estimatedComplexity = taskInput.estimatedComplexity;
        }
        if (taskStructuredDesc !== null) {
          taskData.structuredDesc = taskStructuredDesc;
        }

        // Create the task
        const task = await tx.task.create({ data: taskData });

        createdTasks.push({
          id: task.id,
          identifier: task.identifier,
          title: task.title,
          executionOrder: task.executionOrder,
          estimatedComplexity: task.estimatedComplexity,
          statusId: task.statusId,
        });

        totalTasks++;
      }

      createdFeatures.push({
        id: feature.id,
        identifier: feature.identifier,
        title: feature.title,
        executionOrder: feature.executionOrder,
        estimatedComplexity: feature.estimatedComplexity,
        canParallelize: feature.canParallelize,
        parallelGroup: feature.parallelGroup,
        dependencies: feature.dependencies,
        statusId: feature.statusId,
        tasks: createdTasks,
      });
    }

    return {
      epic: {
        id: epic.id,
        name: epic.name,
        description: epic.description,
        structuredDesc: epic.structuredDesc,
        teamId: team.id, // Use resolved team.id since we know it exists
      },
      features: createdFeatures,
      summary: {
        totalFeatures: createdFeatures.length,
        totalTasks,
      },
    };
  });

  return result;
}

// =============================================================================
// Scope Transfer
// =============================================================================

/**
 * Transfer direction for scope transfers
 */
export type TransferDirection = "personal-to-team" | "team-to-personal";

/**
 * Transfer an epic between personal and team scope.
 * Cascades scope change to all child features and tasks, remapping statusIds.
 *
 * personal-to-team:
 *   - Sets teamId, clears personalScopeId, scopeType='team'
 *   - Remaps all child feature/task statusIds from personal statuses to team statuses
 *   - Requires user to be a member of the target team
 *
 * team-to-personal:
 *   - Sets personalScopeId, clears teamId, scopeType='personal'
 *   - Remaps all child feature/task statusIds from team statuses to personal statuses
 *   - Only the personal scope owner can initiate
 *
 * Status remapping strategy:
 *   1. Match by status name (e.g., "In Progress" → "In Progress")
 *   2. Fall back to the target scope's backlog status if no match found
 *
 * @throws NotFoundError if epic doesn't exist
 * @throws ForbiddenError if user doesn't own the personal scope or isn't a team member
 * @throws ValidationError if direction is invalid for current scope or target team doesn't exist
 */
export async function transferEpicScope(
  epicId: string,
  userId: string,
  direction: TransferDirection,
  teamId?: string
): Promise<Epic> {
  // Fetch the epic with its features and tasks
  const existing = await prisma.epic.findFirst({
    where: { id: epicId, isArchived: false },
    include: {
      features: {
        select: {
          id: true,
          statusId: true,
          tasks: {
            select: {
              id: true,
              statusId: true,
            },
          },
        },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError(`Epic with id '${epicId}' not found`);
  }

  if (direction === "personal-to-team") {
    // Validate: epic must currently be in a personal scope
    if (!existing.personalScopeId || existing.scopeType !== "personal") {
      throw new ValidationError(
        "Epic is not in a personal scope; cannot transfer to team"
      );
    }

    // Validate: teamId is required
    if (!teamId) {
      throw new ValidationError(
        "teamId is required when transferring to team scope"
      );
    }

    // Validate: user owns the personal scope
    const personalScope = await prisma.personalScope.findUnique({
      where: { id: existing.personalScopeId },
      select: { userId: true },
    });
    if (!personalScope || personalScope.userId !== userId) {
      throw new ForbiddenError(
        "Only the personal scope owner can transfer this epic"
      );
    }

    // Validate: user is a member of the target team
    const membership = await prisma.membership.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenError(
        "You must be a member of the target team to transfer this epic"
      );
    }

    // Validate: target team exists and is not archived
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, isArchived: true },
    });
    if (!team || team.isArchived) {
      throw new NotFoundError(`Team with id '${teamId}' not found`);
    }

    // Build status mapping: personal scope statuses → team statuses
    const statusMap = await buildStatusMapping(existing.personalScopeId, null, teamId);

    // Execute transfer in a transaction
    return prisma.$transaction(async (tx) => {
      // Update the epic
      const updatedEpic = await tx.epic.update({
        where: { id: epicId },
        data: {
          teamId,
          personalScopeId: null,
          scopeType: "team",
        },
      });

      // Remap statuses for all child features and tasks
      await remapChildStatuses(tx, existing.features, statusMap);

      return updatedEpic;
    });
  } else if (direction === "team-to-personal") {
    // Validate: epic must currently be in a team scope
    if (!existing.teamId || existing.scopeType !== "team") {
      throw new ValidationError(
        "Epic is not in a team scope; cannot transfer to personal"
      );
    }

    // Look up user's personal scope, lazily creating it if needed
    let personalScope = await prisma.personalScope.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!personalScope) {
      personalScope = await createPersonalScope(userId);
    }

    // Validate: user is a member of the current team (must have access to transfer)
    const membership = await prisma.membership.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: existing.teamId,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenError(
        "You must be a member of the current team to transfer this epic"
      );
    }

    // Build status mapping: team statuses → personal scope statuses
    const statusMap = await buildStatusMapping(null, existing.teamId, null, personalScope.id);

    // Execute transfer in a transaction
    return prisma.$transaction(async (tx) => {
      // Update the epic
      const updatedEpic = await tx.epic.update({
        where: { id: epicId },
        data: {
          teamId: null,
          personalScopeId: personalScope.id,
          scopeType: "personal",
        },
      });

      // Remap statuses for all child features and tasks
      await remapChildStatuses(tx, existing.features, statusMap);

      return updatedEpic;
    });
  } else {
    throw new ValidationError(
      `Invalid transfer direction: '${direction}'. Must be 'personal-to-team' or 'team-to-personal'.`
    );
  }
}

/**
 * Build a mapping from source scope statusIds to target scope statusIds.
 * Maps by status name, falling back to the target scope's backlog status.
 *
 * For personal-to-team: sourcePersonalScopeId + targetTeamId
 * For team-to-personal: sourceTeamId + targetPersonalScopeId
 */
async function buildStatusMapping(
  sourcePersonalScopeId: string | null,
  sourceTeamId: string | null,
  targetTeamId?: string | null,
  targetPersonalScopeId?: string | null,
): Promise<Map<string, string>> {
  // Fetch source statuses
  const sourceStatuses = await prisma.status.findMany({
    where: sourcePersonalScopeId
      ? { personalScopeId: sourcePersonalScopeId }
      : { teamId: sourceTeamId! },
    select: { id: true, name: true },
  });

  // Fetch target statuses
  const targetStatuses = await prisma.status.findMany({
    where: targetTeamId
      ? { teamId: targetTeamId }
      : { personalScopeId: targetPersonalScopeId! },
    select: { id: true, name: true, category: true },
  });

  // Find the fallback status (backlog in target scope)
  const fallbackStatus = targetStatuses.find((s) => s.category === "backlog");
  const fallbackStatusId = fallbackStatus?.id ?? targetStatuses[0]?.id;

  // Build name → id map for target statuses
  const targetNameMap = new Map<string, string>();
  for (const status of targetStatuses) {
    targetNameMap.set(status.name.toLowerCase(), status.id);
  }

  // Build source id → target id mapping
  const statusMap = new Map<string, string>();
  for (const sourceStatus of sourceStatuses) {
    const targetId = targetNameMap.get(sourceStatus.name.toLowerCase());
    statusMap.set(sourceStatus.id, targetId ?? fallbackStatusId ?? "");
  }

  return statusMap;
}

/**
 * Remap statusIds for all features and tasks using the provided status mapping.
 * Uses a Prisma transaction client.
 */
async function remapChildStatuses(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  features: Array<{
    id: string;
    statusId: string | null;
    tasks: Array<{
      id: string;
      statusId: string | null;
    }>;
  }>,
  statusMap: Map<string, string>
): Promise<void> {
  for (const feature of features) {
    // Remap feature status
    if (feature.statusId) {
      const newStatusId = statusMap.get(feature.statusId);
      if (newStatusId && newStatusId !== feature.statusId) {
        await tx.feature.update({
          where: { id: feature.id },
          data: { statusId: newStatusId },
        });
      } else if (!newStatusId) {
        // Source status not in mapping — clear it
        await tx.feature.update({
          where: { id: feature.id },
          data: { statusId: null },
        });
      }
    }

    // Remap task statuses
    for (const task of feature.tasks) {
      if (task.statusId) {
        const newStatusId = statusMap.get(task.statusId);
        if (newStatusId && newStatusId !== task.statusId) {
          await tx.task.update({
            where: { id: task.id },
            data: { statusId: newStatusId },
          });
        } else if (!newStatusId) {
          await tx.task.update({
            where: { id: task.id },
            data: { statusId: null },
          });
        }
      }
    }
  }
}
