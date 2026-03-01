import { api } from "./client";

export interface CaseEvidence {
  type: string;
  reference: string;
  description: string;
}

export interface CaseLaw {
  id: string;
  lawCode: string;
  title: string;
  severity: string;
  description?: string;
  auditLogic?: string;
  consequence?: string;
  appliesTo?: string;
}

export interface Case {
  id: string;
  caseNumber: string;
  accusedAgent: string;
  lawId: string;
  law?: CaseLaw;
  severity: string;
  status: string;
  evidence: CaseEvidence[];
  verdict?: string;
  verdictReason?: string;
  reasoning?: string;
  deductionLevel?: string;
  filedBy?: string;
  filedAt: string;
  hearingAt?: string;
  verdictAt?: string;
  resolvedAt?: string;
  correctedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseFilters {
  status?: string;
  accusedAgent?: string;
  severity?: string;
  lawId?: string;
}

export interface CasesResponse {
  data: Case[];
}

export interface CaseResponse {
  data: Case;
}

export const casesApi = {
  list: (filters: CaseFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append("status", filters.status);
    if (filters.accusedAgent) params.append("accusedAgent", filters.accusedAgent);
    if (filters.severity) params.append("severity", filters.severity);
    if (filters.lawId) params.append("lawId", filters.lawId);
    const queryString = params.toString();
    return api.get<CasesResponse>(`/cases${queryString ? `?${queryString}` : ""}`);
  },

  get: (id: string) => api.get<CaseResponse>(`/cases/${id}`),
};
