import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { preflightApi } from "@/lib/api/preflight";

export const preflightKeys = {
  all: ["preflight"] as const,
  check: (epicId: string) => [...preflightKeys.all, "check", epicId] as const,
  overrides: () => [...preflightKeys.all, "overrides"] as const,
  epicOverrides: (epicId?: string) =>
    [...preflightKeys.overrides(), epicId] as const,
};

export function usePreflightCheck(epicId: string) {
  return useQuery({
    queryKey: preflightKeys.check(epicId),
    queryFn: () => preflightApi.getResults(epicId),
    enabled: !!epicId,
    staleTime: 0, // Always refetch — preflight state changes frequently
    select: (response) => response.data,
  });
}

export function useRecordOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      epicId,
      reason,
      issues,
    }: {
      epicId: string;
      reason: string;
      issues: string[];
    }) => preflightApi.recordOverride(epicId, reason, issues),
    onSuccess: (_data, variables) => {
      // Invalidate preflight check and overrides list
      queryClient.invalidateQueries({ queryKey: preflightKeys.check(variables.epicId) });
      queryClient.invalidateQueries({ queryKey: preflightKeys.overrides() });
    },
  });
}

export function usePreflightOverrides(epicId?: string) {
  return useQuery({
    queryKey: preflightKeys.epicOverrides(epicId),
    queryFn: () => {
      const params: { epicId?: string } = {};
      if (epicId) params.epicId = epicId;
      return preflightApi.listOverrides(params);
    },
    select: (response) => response,
  });
}
