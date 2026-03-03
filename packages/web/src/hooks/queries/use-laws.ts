import { useQuery } from '@tanstack/react-query';
import { lawsApi } from '@/lib/api/laws';

export const lawKeys = {
  all: ['laws'] as const,
  lists: () => [...lawKeys.all, 'list'] as const,
  list: (namespace?: string) => [...lawKeys.lists(), { namespace }] as const,
};

export function useLaws(namespace?: string) {
  return useQuery({
    queryKey: lawKeys.list(namespace),
    queryFn: () => lawsApi.list(namespace),
    select: (response) => response.data,
  });
}
