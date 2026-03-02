import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { epicRequestsApi, type PipelineStatus } from '@/lib/api/epic-requests';
import { useEventSource } from './useEventSource';

const PIPELINE_POLL_INTERVAL = 5000; // 5 seconds
const PIPELINE_SSE_EVENT_TYPE = 'pipeline_status_changed';

/**
 * Query key factory for pipeline status
 */
export const pipelineKeys = {
  all: ['pipeline'] as const,
  status: (epicRequestId: string) => [...pipelineKeys.all, 'status', epicRequestId] as const,
};

/**
 * usePipelineStatus
 *
 * Provides real-time pipeline status for an epic request.
 * - Polls the pipeline endpoint every 5 seconds
 * - Also subscribes to SSE events for immediate updates on status changes
 * - Enabled only when the epic request is approved/active (pipelineStatus is not null)
 */
export function usePipelineStatus(epicRequestId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();

  // Polling query
  const query = useQuery({
    queryKey: pipelineKeys.status(epicRequestId ?? ''),
    queryFn: () => epicRequestsApi.getPipelineStatus(epicRequestId!),
    enabled: enabled && !!epicRequestId,
    refetchInterval: PIPELINE_POLL_INTERVAL,
    staleTime: 2000,
    select: (data) => data.data,
  });

  // Invalidate pipeline query when SSE receives a pipeline_status_changed event
  const handleSSEEvent = useCallback(
    (event: { type: string; data: unknown }) => {
      if (event.type === 'message' || event.type === PIPELINE_SSE_EVENT_TYPE) {
        // Check if this event is for our epic request
        const data = event.data as Record<string, unknown> | null;
        if (
          data &&
          typeof data === 'object' &&
          'epicRequestId' in data &&
          data.epicRequestId === epicRequestId
        ) {
          void queryClient.invalidateQueries({
            queryKey: pipelineKeys.status(epicRequestId!),
          });
        }
      }
    },
    [epicRequestId, queryClient]
  );

  // SSE subscription for immediate updates
  useEventSource({
    url: '/api/v1/events',
    enabled: enabled && !!epicRequestId,
    onEvent: handleSSEEvent,
  });

  return {
    pipeline: query.data as PipelineStatus | undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
