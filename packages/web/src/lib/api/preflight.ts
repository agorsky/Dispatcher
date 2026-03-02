import { api } from "./client";
import type { PreflightResult, PreflightOverride } from "./types";

export const preflightApi = {
  getResults: (epicId: string) =>
    api.get<{ data: PreflightResult }>(`/epics/${epicId}/preflight`),

  recordOverride: (epicId: string, reason: string, issues: string[]) =>
    api.post<{ data: PreflightOverride }>(`/epics/${epicId}/preflight-override`, {
      reason,
      issues,
    }),

  listOverrides: (params?: { epicId?: string; cursor?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.epicId) searchParams.append("epicId", params.epicId);
    if (params?.cursor) searchParams.append("cursor", params.cursor);
    if (params?.limit) searchParams.append("limit", String(params.limit));
    const qs = searchParams.toString();
    return api.get<{ data: PreflightOverride[]; cursor: string | null; hasMore: boolean }>(
      `/preflight-overrides${qs ? `?${qs}` : ""}`
    );
  },
};
