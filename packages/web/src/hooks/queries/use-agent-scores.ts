import { useQuery } from '@tanstack/react-query';
import { agentScoresApi } from '@/lib/api/agent-scores';

export const agentScoreKeys = {
  all: ['agent-scores'] as const,
  lists: () => [...agentScoreKeys.all, 'list'] as const,
  list: () => [...agentScoreKeys.lists()] as const,
  details: () => [...agentScoreKeys.all, 'detail'] as const,
  detail: (agentName: string) => [...agentScoreKeys.details(), agentName] as const,
  events: (agentName: string) => [...agentScoreKeys.all, 'events', agentName] as const,
  delta: (agentName: string) => [...agentScoreKeys.all, 'delta', agentName] as const,
};

export function useAgentScores() {
  return useQuery({
    queryKey: agentScoreKeys.list(),
    queryFn: () => agentScoresApi.list(),
    select: (response) => response.data,
  });
}

export function useAgentScore(agentName: string) {
  return useQuery({
    queryKey: agentScoreKeys.detail(agentName),
    queryFn: () => agentScoresApi.get(agentName),
    enabled: !!agentName,
    select: (response) => response.data,
  });
}

export function useScoreEvents(agentName: string, limit = 20) {
  return useQuery({
    queryKey: agentScoreKeys.events(agentName),
    queryFn: () => agentScoresApi.getScoreEvents(agentName, limit),
    enabled: !!agentName,
    select: (response) => response.data,
  });
}

export function useScoreDelta7Day(agentName: string) {
  return useQuery({
    queryKey: agentScoreKeys.delta(agentName),
    queryFn: () => agentScoresApi.getDelta7Day(agentName),
    enabled: !!agentName,
    select: (response) => response.data.delta7Day,
  });
}
