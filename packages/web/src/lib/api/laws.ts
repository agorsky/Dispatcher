import { api } from "./client";

export interface Law {
  id: string;
  lawCode: string;
  title: string;
  description: string;
  severity: string;
  appliesTo: string;
  isActive: boolean;
  auditLogic: string;
  consequence: string;
  namespace: string;
  createdAt: string;
  updatedAt: string;
}

export interface LawsResponse {
  data: Law[];
}

export const lawsApi = {
  list: (namespace?: string) =>
    api.get<LawsResponse>(namespace ? `/laws?namespace=${encodeURIComponent(namespace)}` : "/laws"),
  listByAgent: (appliesTo: string) =>
    api.get<LawsResponse>(`/laws?appliesTo=${encodeURIComponent(appliesTo)}&isActive=true`),
};
