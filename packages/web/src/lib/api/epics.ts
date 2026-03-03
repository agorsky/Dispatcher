import { api } from './client';
import type { Epic, PaginatedResponse, StructuredDescription } from './types';

export interface EpicFilters {
  teamId?: string | undefined;
  createdBy?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
  includeArchived?: boolean | undefined;
  status?: 'active' | 'completed' | undefined;
}

export interface CreateEpicInput {
  name: string;
  description?: string | undefined;
  teamId: string;
  icon?: string | undefined;
  color?: string | undefined;
}

export interface UpdateEpicInput extends Partial<Omit<CreateEpicInput, 'teamId'>> {
  id: string;
  dependencies?: string; // JSON string of epic UUID array
}

export const epicsApi = {
  list: (filters: EpicFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });
    const queryString = params.toString();
    return api.get<PaginatedResponse<Epic>>(`/epics${queryString ? `?${queryString}` : ''}`);
  },

  get: async (id: string) => {
    const response = await api.get<{ data: Epic & { structuredDesc?: string | null } }>(`/epics/${id}`);
    // Parse structuredDesc JSON string from API into object
    if (response.data.structuredDesc && typeof response.data.structuredDesc === 'string') {
      try {
        (response.data as Epic).structuredDesc = JSON.parse(response.data.structuredDesc) as StructuredDescription;
      } catch {
        (response.data as Epic).structuredDesc = null;
      }
    }
    return response as { data: Epic };
  },

  create: (input: CreateEpicInput) => api.post<{ data: Epic }>('/epics', input),

  update: ({ id, ...input }: UpdateEpicInput) =>
    api.put<{ data: Epic }>(`/epics/${id}`, input),

  delete: (id: string) => api.delete<void>(`/epics/${id}`),

  archive: (id: string) => api.post<{ data: Epic }>(`/epics/${id}/archive`, {}),

  unarchive: (id: string) => api.post<{ data: Epic }>(`/epics/${id}/unarchive`, {}),

  /**
   * Transfer an epic between personal and team scope
   */
  transfer: (id: string, input: { direction: 'personal-to-team' | 'team-to-personal'; teamId?: string }) =>
    api.post<{ data: Epic }>(`/epics/${id}/transfer`, input),

  complete: (id: string) => api.patch<{ data: Epic }>(`/epics/${id}/complete`, {}),

  reopen: (id: string) => api.patch<{ data: Epic }>(`/epics/${id}/reopen`, {}),
  dispatch: (id: string) => api.post<{ data: { epicId: string; dispatched: boolean; message: string } }>(`/epics/${id}/dispatch`, {}),

  recordDependencyOverride: (id: string, reason: string) =>
    api.post<{ data: { epicId: string; overrideRecorded: boolean; reason: string; blockingEpics: Array<{ id: string; identifier: string; name: string; status: string }> } }>(
      `/epics/${id}/dependency-override`,
      { reason }
    ),
};
