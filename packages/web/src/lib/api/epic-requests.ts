import { api } from './client';

/**
 * Epic Request status values
 */
export type EpicRequestStatus = 'pending' | 'approved' | 'rejected' | 'converted';

/**
 * Reaction type values
 */
export type ReactionType = 'like' | 'fire' | 'dislike';

/**
 * Structured description for Epic Requests
 */
export interface EpicRequestStructuredDesc {
  problemStatement: string;
  proposedSolution: string;
  impactAssessment: string;
  targetAudience?: string;
  successMetrics?: string;
  alternatives?: string;
  dependencies?: string;
  estimatedEffort?: string;
}

/**
 * Epic Request entity
 */
export interface EpicRequest {
  id: string;
  title: string;
  description?: string;
  structuredDesc?: EpicRequestStructuredDesc;
  status: EpicRequestStatus;
  requestedById: string;
  personalScopeId?: string | null;
  requestedBy?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Transfer direction for moving epic requests between scopes
 */
export type TransferDirection = 'personal-to-team' | 'team-to-personal';

/**
 * Input for transferring an epic request between scopes
 */
export interface TransferEpicRequestInput {
  direction: TransferDirection;
}

/**
 * Input for transferring an epic between scopes
 */
export interface TransferEpicInput {
  direction: TransferDirection;
  teamId?: string;
}

/**
 * Input for creating a personal epic request
 */
export interface CreatePersonalEpicRequestInput {
  title: string;
  description?: string;
  structuredDesc?: EpicRequestStructuredDesc;
}

/**
 * Epic Request with aggregated reaction counts
 */
export interface EpicRequestWithReactionCounts extends EpicRequest {
  reactionCounts: {
    reactionType: string;
    count: number;
  }[];
  userReaction?: string | null;
}

/**
 * Comment entity
 */
export interface EpicRequestComment {
  id: string;
  content: string;
  epicRequestId: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Paginated response structure
 */
export interface PaginatedEpicRequestsResponse {
  data: EpicRequestWithReactionCounts[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Paginated comments response structure
 */
export interface PaginatedCommentsResponse {
  data: EpicRequestComment[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Filters for listing epic requests
 */
export interface EpicRequestFilters {
  cursor?: string;
  limit?: number;
  status?: EpicRequestStatus;
  requestedById?: string;
}

/**
 * Filters for listing comments
 */
export interface CommentFilters {
  cursor?: string;
  limit?: number;
}

/**
 * Input for creating a new epic request
 */
export interface CreateEpicRequestInput {
  title: string;
  description?: string;
  structuredDesc?: EpicRequestStructuredDesc;
}

/**
 * Input for updating an epic request
 */
export interface UpdateEpicRequestInput {
  title?: string;
  description?: string;
  structuredDesc?: EpicRequestStructuredDesc;
  status?: EpicRequestStatus;
}

/**
 * Pipeline status values
 */
export type PipelineStatusValue = 'approved' | 'planning' | 'planned' | 'building' | 'done' | 'error';

/**
 * Pipeline status for an epic request
 */
export interface PipelineStatus {
  pipelineStatus: PipelineStatusValue | null;
  pipelineUpdatedAt: string | null;
  convertedEpicId: string | null;
  linkedSessionId: string | null;
  prUrl: string | null;
  pipelineError: string | null;
}

/**
 * Input for updating pipeline status
 */
export interface UpdatePipelineStatusInput {
  pipelineStatus: PipelineStatusValue;
  linkedEntityId?: string;
  errorMessage?: string;
}

/**
 * Input for adding a reaction
 */
export interface AddReactionInput {
  reactionType: ReactionType;
}

/**
 * Input for creating a comment
 */
export interface CreateCommentInput {
  content: string;
}

/**
 * Input for updating a comment
 */
export interface UpdateCommentInput {
  content: string;
}

/**
 * API client for Epic Requests
 */
export const epicRequestsApi = {
  /**
   * List epic requests with cursor-based pagination
   */
  list: (filters: EpicRequestFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });
    const queryString = params.toString();
    return api.get<PaginatedEpicRequestsResponse>(
      `/epic-requests${queryString ? `?${queryString}` : ''}`
    );
  },

  /**
   * Get a single epic request by ID
   */
  get: (id: string) =>
    api.get<{ data: EpicRequestWithReactionCounts }>(`/epic-requests/${id}`),

  /**
   * Create a new epic request
   */
  create: (input: CreateEpicRequestInput) =>
    api.post<{ data: EpicRequest }>('/epic-requests', input),

  /**
   * Update an existing epic request
   */
  update: (id: string, input: UpdateEpicRequestInput) =>
    api.put<{ data: EpicRequest }>(`/epic-requests/${id}`, input),

  /**
   * Delete an epic request
   */
  delete: (id: string) => api.delete(`/epic-requests/${id}`),

  /**
   * Approve an epic request (admin only)
   */
  approve: (id: string) =>
    api.post<{ data: EpicRequest }>(`/epic-requests/${id}/approve`, {}),

  /**
   * Reject an epic request (admin only)
   */
  reject: (id: string) =>
    api.post<{ data: EpicRequest }>(`/epic-requests/${id}/reject`, {}),

  /**
   * Add or update a reaction on an epic request
   */
  react: (id: string, input: AddReactionInput) =>
    api.post<{ message: string; data: { reactionType: string } }>(
      `/epic-requests/${id}/reactions`,
      input
    ),

  /**
   * Remove user's reaction from an epic request
   */
  removeReaction: (id: string) =>
    api.delete(`/epic-requests/${id}/reactions`),

  /**
   * List comments for an epic request
   */
  listComments: (id: string, filters: CommentFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });
    const queryString = params.toString();
    return api.get<PaginatedCommentsResponse>(
      `/epic-requests/${id}/comments${queryString ? `?${queryString}` : ''}`
    );
  },

  /**
   * Create a comment on an epic request
   */
  createComment: (id: string, input: CreateCommentInput) =>
    api.post<{ data: EpicRequestComment }>(
      `/epic-requests/${id}/comments`,
      input
    ),

  /**
   * Update a comment
   */
  updateComment: (
    epicRequestId: string,
    commentId: string,
    input: UpdateCommentInput
  ) =>
    api.put<{ data: EpicRequestComment }>(
      `/epic-requests/${epicRequestId}/comments/${commentId}`,
      input
    ),

  /**
   * Delete a comment
   */
  deleteComment: (epicRequestId: string, commentId: string) =>
    api.delete(`/epic-requests/${epicRequestId}/comments/${commentId}`),

  /**
   * Create a personal epic request (auto-approved)
   */
  createPersonal: (input: CreatePersonalEpicRequestInput) =>
    api.post<{ data: EpicRequest }>('/me/epic-requests', input),

  /**
   * List personal epic requests
   */
  listPersonal: (filters: EpicRequestFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });
    const queryString = params.toString();
    return api.get<PaginatedEpicRequestsResponse>(
      `/me/epic-requests${queryString ? `?${queryString}` : ''}`
    );
  },

  /**
   * Transfer an epic request between personal and team scope
   */
  transfer: (id: string, input: TransferEpicRequestInput) =>
    api.post<{ data: EpicRequest }>(`/epic-requests/${id}/transfer`, input),

  /**
   * Get pipeline status for an epic request
   */
  getPipelineStatus: (id: string) =>
    api.get<{ data: PipelineStatus }>(`/epic-requests/${id}/pipeline`),
};
