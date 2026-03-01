import { api } from "./client";

export interface AgentScore {
  id: string;
  agentName: string;
  agentTitle: string;
  totalScore: number;
  bustsReceived: number;
  bustsIssued: number;
  cleanCycles: number;
  falseBusts?: number;
  lastAuditAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreEvent {
  id: string;
  agentName: string;
  type: "merit" | "deduction";
  points: number;
  reason: string;
  caseId?: string | null;
  createdAt: string;
}

export interface AgentScoresResponse {
  data: AgentScore[];
}

export interface AgentScoreResponse {
  data: AgentScore;
}

export interface ScoreEventsResponse {
  data: ScoreEvent[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
  };
}

export const agentScoresApi = {
  list: () => api.get<AgentScoresResponse>("/agent-scores"),

  get: (agentName: string) =>
    api.get<AgentScoreResponse>(`/agent-scores/${encodeURIComponent(agentName)}`),

  getScoreEvents: (agentName: string, limit = 20) =>
    api.get<ScoreEventsResponse>(
      `/agent-scores/${encodeURIComponent(agentName)}/events?limit=${limit}`
    ),

  getDelta7Day: (agentName: string) =>
    api.get<{ data: { agentName: string; delta7Day: number } }>(
      `/agent-scores/${encodeURIComponent(agentName)}/delta`
    ),
};
