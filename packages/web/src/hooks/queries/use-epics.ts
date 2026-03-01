import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  epicsApi,
  type EpicFilters,
  type CreateEpicInput,
  type UpdateEpicInput,
} from '@/lib/api/epics';

export const epicKeys = {
  all: ['epics'] as const,
  lists: () => [...epicKeys.all, 'list'] as const,
  list: (filters: EpicFilters) => [...epicKeys.lists(), filters] as const,
  details: () => [...epicKeys.all, 'detail'] as const,
  detail: (id: string) => [...epicKeys.details(), id] as const,
};

export function useEpics(filters: EpicFilters = {}) {
  return useInfiniteQuery({
    queryKey: epicKeys.list(filters),
    queryFn: ({ pageParam }) =>
      epicsApi.list({ ...filters, cursor: pageParam }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useEpic(id: string) {
  return useQuery({
    queryKey: epicKeys.detail(id),
    queryFn: () => epicsApi.get(id),
    enabled: !!id,
    select: (response) => response.data,
  });
}

export function useCreateEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEpicInput) => epicsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: epicKeys.lists() });
    },
  });
}

export function useUpdateEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateEpicInput) => epicsApi.update(input),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: epicKeys.lists() });
      queryClient.setQueryData(epicKeys.detail(response.data.id), response);
    },
  });
}

export function useDeleteEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => epicsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: epicKeys.lists() });
    },
  });
}

export function useArchiveEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => epicsApi.archive(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: epicKeys.lists() });
      queryClient.setQueryData(epicKeys.detail(response.data.id), response);
    },
  });
}

export function useUnarchiveEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => epicsApi.unarchive(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: epicKeys.lists() });
      queryClient.setQueryData(epicKeys.detail(response.data.id), response);
    },
  });
}

/**
 * Hook for transferring an epic between personal and team scope
 */
export function useTransferEpicScope() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { direction: 'personal-to-team' | 'team-to-personal'; teamId?: string } }) =>
      epicsApi.transfer(id, input),
    onSuccess: (_data, variables) => {
      // Invalidate all epic lists (scope changed)
      void queryClient.invalidateQueries({ queryKey: epicKeys.lists() });
      // Invalidate the specific detail
      void queryClient.invalidateQueries({ queryKey: epicKeys.detail(variables.id) });
    },
  });
}

export function useCompleteEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => epicsApi.complete(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: epicKeys.lists() });
      queryClient.setQueryData(epicKeys.detail(response.data.id), response);
    },
  });
}

export function useReopenEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => epicsApi.reopen(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: epicKeys.lists() });
      queryClient.setQueryData(epicKeys.detail(response.data.id), response);
    },
  });
}

export function useEpicsCount() {
  return useQuery({
    queryKey: [...epicKeys.lists(), 'count'] as const,
    queryFn: async () => {
      const response = await epicsApi.list({ limit: 100, includeArchived: true } as EpicFilters);
      return response.data.length;
    },
  });
}
