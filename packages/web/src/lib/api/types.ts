export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  teamId: string;
  isActive: boolean;
  isGlobalAdmin: boolean;
  avatarUrl?: string;
  timeZone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  role: string;
  user: User;
}

export interface Team {
  id: string;
  name: string;
  key?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StructuredDescription {
  summary: string;
  aiInstructions?: string;
  acceptanceCriteria?: string[];
  filesInvolved?: string[];
  functionsToModify?: string[];
  testingStrategy?: string;
  testFiles?: string[];
  relatedItemIds?: string[];
  externalLinks?: { url: string; title: string }[];
  technicalNotes?: string;
  riskLevel?: "low" | "medium" | "high";
  estimatedEffort?: "trivial" | "small" | "medium" | "large" | "xl";
}

export interface Epic {
  id: string;
  name: string;
  identifier?: string | null;
  description?: string;
  structuredDesc?: StructuredDescription | null;
  teamId: string;
  team?: {
    id: string;
    name: string;
    key: string;
  } | null;
  creator?: {
    id: string;
    name: string;
    email: string;
  } | null;
  implementer?: {
    id: string;
    name: string;
    email: string;
  } | null;
  implementedDate?: string | null;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Status {
  id: string;
  name: string;
  category: "backlog" | "unstarted" | "started" | "completed" | "canceled";
  color: string;
  position: number;
  teamId: string;
}

export interface Feature {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  statusId: string;
  status?: Status;
  assigneeId?: string;
  assignee?: User;
  epicId: string;
  epic?: Epic;
  priority?: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    tasks: number;
  };
  completedTaskCount?: number;
}

export interface Task {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  statusId: string;
  status?: Status;
  assigneeId?: string;
  assignee?: User;
  featureId: string;
  feature?: {
    id: string;
    identifier: string;
    title: string;
    epicId?: string;
    epic?: {
      id: string;
      name: string;
      teamId: string;
    };
  };
  priority?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface CodeContextResponse {
  relatedFiles: string[];
  relatedFunctions: string[];
  gitBranch: string | null;
  gitCommits: string[];
  gitPrNumber: number | null;
  gitPrUrl: string | null;
}

export interface TaskPhaseItem {
  id: string;
  title: string;
  featureId: string;
  featureTitle: string;
  executionOrder: number;
  canParallelize: boolean;
  parallelGroup: string | null;
  dependencies: string[];
}

export interface TaskPhase {
  phaseKey: string;
  items: TaskPhaseItem[];
}

export interface ExecutionPlan {
  epicId: string;
  phases: TaskPhase[];
}
