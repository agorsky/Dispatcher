import { prisma } from "../lib/db.js";
import type { EpicRequest } from "../generated/prisma/index.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../errors/index.js";
import type {
  CreateEpicRequestInput,
  UpdateEpicRequestInput,
  EpicRequestStatus,
} from "../schemas/epicRequest.js";
import { emitEntityCreated, emitEntityUpdated } from "../events/index.js";
import { dispatch } from "./webhookService.js";
import { transitionTo } from "./pipelineService.js";

// Types for service operations
export interface ListEpicRequestsOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  status?: EpicRequestStatus | undefined;
  requestedById?: string | undefined;
}

export interface EpicRequestWithReactionCounts extends EpicRequest {
  requestedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  reactionCounts: {
    reactionType: string;
    count: number;
  }[];
  userReaction?: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Aggregate raw reactions into counts and extract the current user's reaction
 */
function aggregateReactions(
  reactions: { reactionType: string; userId: string }[],
  userId?: string
): { reactionCounts: { reactionType: string; count: number }[]; userReaction: string | null } {
  const countMap = new Map<string, number>();
  let userReaction: string | null = null;

  for (const reaction of reactions) {
    countMap.set(reaction.reactionType, (countMap.get(reaction.reactionType) ?? 0) + 1);
    if (userId && reaction.userId === userId) {
      userReaction = reaction.reactionType;
    }
  }

  const reactionCounts = Array.from(countMap.entries()).map(
    ([reactionType, count]) => ({ reactionType, count })
  );

  return { reactionCounts, userReaction };
}

/**
 * List epic requests with cursor-based pagination and optional filtering
 * Default sort: newest-first (createdAt DESC)
 * Returns aggregated reaction counts per request
 * 
 * Visibility filtering: When userId is provided, personal requests belonging
 * to other users are excluded. Only team/global requests (personalScopeId IS NULL)
 * and the caller's own personal requests are returned.
 */
export async function listEpicRequests(
  options: ListEpicRequestsOptions = {},
  userId?: string
): Promise<PaginatedResult<EpicRequestWithReactionCounts>> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: Record<string, any> = {};

  if (options.status !== undefined) {
    whereClause.status = options.status;
  }
  if (options.requestedById !== undefined) {
    whereClause.requestedById = options.requestedById;
  }

  // Visibility filtering: exclude other users' personal requests
  if (userId) {
    // Look up the caller's personal scope ID
    const personalScope = await prisma.personalScope.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (personalScope) {
      // Show: team/global requests (no personalScopeId) OR caller's own personal requests
      whereClause.OR = [
        { personalScopeId: null },
        { personalScopeId: personalScope.id },
      ];
    } else {
      // User has no personal scope, only show team/global requests
      whereClause.personalScopeId = null;
    }
  }

  // Fetch requests with pagination
  const requests = await prisma.epicRequest.findMany({
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      reactions: {
        select: {
          reactionType: true,
          userId: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const hasMore = requests.length > limit;
  if (hasMore) {
    requests.pop();
  }

  // Transform to include aggregated reaction counts and user's own reaction
  const data: EpicRequestWithReactionCounts[] = requests.map((request) => {
    const { reactionCounts, userReaction } = aggregateReactions(request.reactions, userId);
    const { reactions: _reactions, ...requestWithoutReactions } = request;
    return {
      ...requestWithoutReactions,
      reactionCounts,
      userReaction,
    };
  });

  const lastRequest = data.at(-1);
  const nextCursor = hasMore && lastRequest ? lastRequest.id : null;

  return {
    data,
    meta: {
      cursor: nextCursor,
      hasMore,
    },
  };
}

/**
 * Get a single epic request by ID with reaction counts
 * 
 * Visibility filtering: When userId is provided, personal requests belonging
 * to other users return null (404). Only team/global requests and the caller's
 * own personal requests are accessible.
 */
export async function getEpicRequestById(
  id: string,
  userId?: string
): Promise<EpicRequestWithReactionCounts | null> {
  const request = await prisma.epicRequest.findUnique({
    where: { id },
    include: {
      reactions: {
        select: {
          reactionType: true,
          userId: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      personalScope: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!request) {
    return null;
  }

  // Visibility check: if the request belongs to a personal scope,
  // only the owner of that scope can access it
  if (request.personalScopeId && userId) {
    const requestWithScope = request as typeof request & { personalScope?: { userId: string } };
    const scopeOwnerUserId = requestWithScope.personalScope?.userId;
    if (scopeOwnerUserId !== userId) {
      return null;
    }
  } else if (request.personalScopeId && !userId) {
    // Personal request but no userId provided - treat as not found
    return null;
  }

  const { reactionCounts, userReaction } = aggregateReactions(request.reactions, userId);
  const { reactions: _reactions, personalScope: _personalScope, ...requestWithoutReactions } = request as
    typeof request & { personalScope?: unknown };
  return {
    ...requestWithoutReactions,
    reactionCounts,
    userReaction,
  };
}

/**
 * Create a new epic request
 * When personalScopeId is provided, the request is auto-approved (status set to 'approved')
 */
export async function createEpicRequest(
  input: CreateEpicRequestInput,
  userId: string
): Promise<EpicRequest> {
  // Validate required fields
  if (!input.title || input.title.trim() === "") {
    throw new ValidationError("Title is required");
  }

  // Validate structuredDesc if provided
  let structuredDescJson: string | null = null;
  if (input.structuredDesc) {
    // The Zod schema already validates the required fields
    structuredDescJson = JSON.stringify(input.structuredDesc);
  }

  // Build data object
  const data: {
    title: string;
    requestedById: string;
    description?: string | null;
    structuredDesc?: string | null;
    personalScopeId?: string;
    status?: string;
  } = {
    title: input.title.trim(),
    requestedById: userId,
  };

  if (input.description !== undefined) {
    data.description = input.description.trim() || null;
  }
  if (structuredDescJson !== null) {
    data.structuredDesc = structuredDescJson;
  }

  // Personal scope support: auto-approve personal epic requests
  if (input.personalScopeId) {
    data.personalScopeId = input.personalScopeId;
    data.status = "approved";
  }

  const epicRequest = await prisma.epicRequest.create({ data });

  emitEntityCreated({
    entityType: "epicRequest",
    entityId: epicRequest.id,
    userId,
    timestamp: new Date().toISOString(),
  });

  return epicRequest;
}

/**
 * Update an existing epic request
 * Enforces ownership checks: only creator can edit
 * Enforces status checks: cannot edit if status is "approved" or "converted"
 */
export async function updateEpicRequest(
  id: string,
  input: UpdateEpicRequestInput,
  userId: string,
  isGlobalAdmin: boolean = false
): Promise<EpicRequest> {
  // Fetch existing request
  const existing = await prisma.epicRequest.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError(`Epic request with id '${id}' not found`);
  }

  // Admin converting approved → converted is allowed without ownership check
  const isAdminConverting =
    isGlobalAdmin &&
    input.status === "converted" &&
    existing.status === "approved";

  // Ownership check: only creator can edit (admins can convert)
  if (!isAdminConverting && existing.requestedById !== userId) {
    throw new ForbiddenError("Only the creator can edit this epic request");
  }

  // Status check: cannot edit if approved or converted (admins can convert)
  if (
    !isAdminConverting &&
    (existing.status === "approved" || existing.status === "converted")
  ) {
    throw new ValidationError(
      `Cannot edit epic request with status '${existing.status}'`
    );
  }

  // Validate fields if provided
  if (input.title?.trim() === "") {
    throw new ValidationError("Title cannot be empty");
  }

  // Validate status transition if status is being updated
  if (input.status !== undefined && input.status !== existing.status) {
    if (isAdminConverting) {
      // Allowed: admin marking approved request as converted/implemented
    } else if (existing.status === "rejected" && input.status === "pending") {
      // Allowed: reopening a rejected request
    } else {
      throw new ValidationError(
        `Invalid status transition from '${existing.status}' to '${input.status}'. Use approve/reject endpoints for status changes.`
      );
    }
  }

  // Build data object
  const data: {
    title?: string;
    description?: string | null;
    structuredDesc?: string | null;
    status?: EpicRequestStatus;
  } = {};

  if (input.title !== undefined) {
    data.title = input.title.trim();
  }
  if (input.description !== undefined) {
    data.description = input.description.trim() || null;
  }
  if (input.structuredDesc !== undefined) {
    data.structuredDesc = JSON.stringify(input.structuredDesc);
  }
  if (input.status !== undefined) {
    data.status = input.status;
  }

  const updatedRequest = await prisma.epicRequest.update({
    where: { id },
    data,
  });

  const changedFields = Object.keys(data);
  if (changedFields.length > 0) {
    emitEntityUpdated({
      entityType: "epicRequest",
      entityId: id,
      changedFields,
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  // If converting to 'converted', advance pipeline to 'planned'
  if (data.status === "converted") {
    void transitionTo(id, "planned").catch((err: unknown) => {
      console.error(`[Pipeline] Failed to transition EpicRequest ${id} to planned:`, err);
    });
  }

  return updatedRequest;
}

/**
 * Delete an epic request
 * Enforces ownership checks: creator OR global admin can delete
 */
export async function deleteEpicRequest(
  id: string,
  userId: string,
  isGlobalAdmin: boolean
): Promise<void> {
  // Fetch existing request
  const existing = await prisma.epicRequest.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError(`Epic request with id '${id}' not found`);
  }

  // Authorization check: only creator OR global admin can delete
  if (existing.requestedById !== userId && !isGlobalAdmin) {
    throw new ForbiddenError(
      "Only the creator or a global admin can delete this epic request"
    );
  }

  // Perform deletion (cascades to reactions and comments via Prisma schema)
  await prisma.epicRequest.delete({
    where: { id },
  });

  // TODO: Emit entity deleted event once "epicRequest" is added to EntityType
  // emitEntityDeleted({
  //   entityType: "epicRequest",
  //   entityId: id,
  //   userId,
  //   timestamp: new Date().toISOString(),
  // });
}

/**
 * Upsert a reaction on an epic request
 * Creates a new reaction or replaces an existing one from the same user
 * Uses Prisma's upsert with the unique constraint: epicRequestId_userId
 */
export async function upsertReaction(
  epicRequestId: string,
  userId: string,
  reactionType: string
): Promise<void> {
  // Verify the epic request exists
  const epicRequest = await prisma.epicRequest.findUnique({
    where: { id: epicRequestId },
  });

  if (!epicRequest) {
    throw new NotFoundError(`Epic request with id '${epicRequestId}' not found`);
  }

  // Upsert the reaction using the composite unique key
  await prisma.epicRequestReaction.upsert({
    where: {
      epicRequestId_userId: {
        epicRequestId,
        userId,
      },
    },
    update: {
      reactionType,
    },
    create: {
      epicRequestId,
      userId,
      reactionType,
    },
  });
}

/**
 * Remove a reaction from an epic request
 * Deletes the user's reaction if it exists
 */
export async function removeReaction(
  epicRequestId: string,
  userId: string
): Promise<void> {
  // Verify the epic request exists
  const epicRequest = await prisma.epicRequest.findUnique({
    where: { id: epicRequestId },
  });

  if (!epicRequest) {
    throw new NotFoundError(`Epic request with id '${epicRequestId}' not found`);
  }

  // Delete the reaction if it exists (no error if it doesn't exist)
  await prisma.epicRequestReaction.deleteMany({
    where: {
      epicRequestId,
      userId,
    },
  });
}

// ==================== COMMENT OPERATIONS ====================

/**
 * Comment with author details
 */
export interface CommentWithAuthor {
  id: string;
  epicRequestId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Options for listing comments
 */
export interface ListCommentsOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
}

/**
 * List comments for an epic request with cursor-based pagination
 * Default sort: oldest-first (createdAt ASC)
 * Returns comments with author information
 */
export async function listComments(
  epicRequestId: string,
  options: ListCommentsOptions = {}
): Promise<PaginatedResult<CommentWithAuthor>> {
  // Verify the epic request exists
  const epicRequest = await prisma.epicRequest.findUnique({
    where: { id: epicRequestId },
  });

  if (!epicRequest) {
    throw new NotFoundError(`Epic request with id '${epicRequestId}' not found`);
  }

  const limit = Math.min(100, Math.max(1, options.limit ?? 20));

  // Fetch comments with pagination
  const comments = await prisma.epicRequestComment.findMany({
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    where: { epicRequestId },
    orderBy: { createdAt: "asc" }, // Oldest first for conversation flow
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const hasMore = comments.length > limit;
  if (hasMore) {
    comments.pop();
  }

  const lastComment = comments.at(-1);
  const nextCursor = hasMore && lastComment ? lastComment.id : null;

  return {
    data: comments,
    meta: {
      cursor: nextCursor,
      hasMore,
    },
  };
}

/**
 * Create a new comment on an epic request
 */
export async function createComment(
  epicRequestId: string,
  content: string,
  userId: string
): Promise<CommentWithAuthor> {
  // Verify the epic request exists
  const epicRequest = await prisma.epicRequest.findUnique({
    where: { id: epicRequestId },
  });

  if (!epicRequest) {
    throw new NotFoundError(`Epic request with id '${epicRequestId}' not found`);
  }

  // Validate content
  if (!content || content.trim() === "") {
    throw new ValidationError("Comment content is required");
  }

  // Create the comment
  const comment = await prisma.epicRequestComment.create({
    data: {
      epicRequestId,
      authorId: userId,
      content: content.trim(),
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return comment;
}

/**
 * Update an existing comment
 * Enforces ownership: only the author can update their comment
 */
export async function updateComment(
  commentId: string,
  content: string,
  userId: string
): Promise<CommentWithAuthor> {
  // Fetch existing comment
  const existing = await prisma.epicRequestComment.findUnique({
    where: { id: commentId },
  });

  if (!existing) {
    throw new NotFoundError(`Comment with id '${commentId}' not found`);
  }

  // Ownership check: only author can update
  if (existing.authorId !== userId) {
    throw new ForbiddenError("Only the author can edit this comment");
  }

  // Validate content
  if (!content || content.trim() === "") {
    throw new ValidationError("Comment content is required");
  }

  // Update the comment
  const updatedComment = await prisma.epicRequestComment.update({
    where: { id: commentId },
    data: {
      content: content.trim(),
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return updatedComment;
}

/**
 * Delete a comment
 * Enforces ownership: author OR global admin can delete
 */
export async function deleteComment(
  commentId: string,
  userId: string,
  isGlobalAdmin: boolean
): Promise<void> {
  // Fetch existing comment
  const existing = await prisma.epicRequestComment.findUnique({
    where: { id: commentId },
  });

  if (!existing) {
    throw new NotFoundError(`Comment with id '${commentId}' not found`);
  }

  // Authorization check: only author OR global admin can delete
  if (existing.authorId !== userId && !isGlobalAdmin) {
    throw new ForbiddenError(
      "Only the author or a global admin can delete this comment"
    );
  }

  // Perform deletion
  await prisma.epicRequestComment.delete({
    where: { id: commentId },
  });
}

// ==================== ADMIN STATUS WORKFLOW ====================

/**
 * Approve an epic request
 * Admin-only operation: sets status to 'approved'
 * Validates transition: only 'pending' can be approved
 * Emits status changed event
 * 
 * @throws NotFoundError if request doesn't exist
 * @throws ValidationError if transition is invalid
 */
export async function approveRequest(
  id: string,
  userId: string
): Promise<EpicRequest> {
  // Fetch existing request
  const existing = await prisma.epicRequest.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError(`Epic request with id '${id}' not found`);
  }

  // Validate transition: only 'pending' can be approved
  if (existing.status !== "pending") {
    throw new ValidationError(
      `Cannot approve epic request with status '${existing.status}'. Only 'pending' requests can be approved.`
    );
  }

  // Update status to 'approved'
  const updated = await prisma.epicRequest.update({
    where: { id },
    data: { status: "approved" },
  });

  // Emit status changed event
  console.log(`[Event] EpicRequest status changed:`, {
    entityType: "epicRequest",
    entityId: id,
    oldStatus: existing.status,
    newStatus: "approved",
    changedBy: userId,
    timestamp: new Date().toISOString(),
  });

  // Transition pipeline status to 'approved' (fire-and-forget)
  void transitionTo(id, "approved").catch((err: unknown) => {
    console.error(`[Pipeline] Failed to transition EpicRequest ${id} to approved:`, err);
  });

  // Fire-and-forget webhook dispatch
  const webhookUrl = process.env.DISPATCHER_WEBHOOK_URL;
  if (webhookUrl) {
    void dispatch(webhookUrl, {
      event: "epic_request.approved",
      epicRequestId: id,
      title: updated.title,
      status: "approved",
      structuredDesc: updated.structuredDesc,
      approvedAt: new Date().toISOString(),
    });
  }

  return updated;
}

/**
 * Reject an epic request
 * Admin-only operation: sets status to 'rejected'
 * Validates transition: only 'pending' can be rejected
 * Emits status changed event
 * 
 * @throws NotFoundError if request doesn't exist
 * @throws ValidationError if transition is invalid
 */
export async function rejectRequest(
  id: string,
  userId: string
): Promise<EpicRequest> {
  // Fetch existing request
  const existing = await prisma.epicRequest.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError(`Epic request with id '${id}' not found`);
  }

  // Validate transition: only 'pending' can be rejected
  if (existing.status !== "pending") {
    throw new ValidationError(
      `Cannot reject epic request with status '${existing.status}'. Only 'pending' requests can be rejected.`
    );
  }

  // Update status to 'rejected'
  const updatedRequest = await prisma.epicRequest.update({
    where: { id },
    data: { status: "rejected" },
  });

  // Emit status changed event
  console.log(`[Event] EpicRequest status changed:`, {
    entityType: "epicRequest",
    entityId: id,
    oldStatus: existing.status,
    newStatus: "rejected",
    changedBy: userId,
    timestamp: new Date().toISOString(),
  });

  return updatedRequest;
}

// ==================== SCOPE TRANSFER ====================

/**
 * Transfer direction for scope transfers
 */
export type TransferDirection = "personal-to-team" | "team-to-personal";

/**
 * Transfer an epic request between personal and team scope.
 *
 * personal-to-team:
 *   - Clears personalScopeId (makes it globally visible)
 *   - Sets status to 'pending' (needs team approval)
 *   - Only the creator can initiate
 *
 * team-to-personal:
 *   - Sets personalScopeId to the user's personal scope
 *   - Sets status to 'approved' (auto-approved in personal scope)
 *   - Only the creator can initiate
 *
 * @throws NotFoundError if request doesn't exist
 * @throws ForbiddenError if user is not the creator
 * @throws ValidationError if request is converted, or direction is invalid for current scope
 */
export async function transferEpicRequestScope(
  epicRequestId: string,
  userId: string,
  direction: TransferDirection
): Promise<EpicRequest> {
  // Fetch the existing epic request
  const existing = await prisma.epicRequest.findUnique({
    where: { id: epicRequestId },
  });

  if (!existing) {
    throw new NotFoundError(`Epic request with id '${epicRequestId}' not found`);
  }

  // Only the creator can transfer
  if (existing.requestedById !== userId) {
    throw new ForbiddenError("Only the creator can transfer this epic request");
  }

  // Cannot transfer converted requests
  if (existing.status === "converted") {
    throw new ValidationError("Cannot transfer a converted epic request");
  }

  if (direction === "personal-to-team") {
    // Validate: request must currently be in a personal scope
    if (!existing.personalScopeId) {
      throw new ValidationError(
        "Epic request is not in a personal scope; cannot transfer to team"
      );
    }

    // Clear personalScopeId and set status to pending
    const updatedRequest = await prisma.epicRequest.update({
      where: { id: epicRequestId },
      data: {
        personalScopeId: null,
        status: "pending",
      },
    });

    return updatedRequest;
  } else if (direction === "team-to-personal") {
    // Validate: request must NOT currently be in a personal scope
    if (existing.personalScopeId) {
      throw new ValidationError(
        "Epic request is already in a personal scope; cannot transfer to personal"
      );
    }

    // Look up the user's personal scope, lazily creating it if needed
    let personalScope = await prisma.personalScope.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!personalScope) {
      personalScope = await prisma.personalScope.create({
        data: { userId },
        select: { id: true },
      });
    }

    // Set personalScopeId and auto-approve
    const updatedRequest = await prisma.epicRequest.update({
      where: { id: epicRequestId },
      data: {
        personalScopeId: personalScope.id,
        status: "approved",
      },
    });

    return updatedRequest;
  } else {
    throw new ValidationError(
      `Invalid transfer direction: '${direction}'. Must be 'personal-to-team' or 'team-to-personal'.`
    );
  }
}
