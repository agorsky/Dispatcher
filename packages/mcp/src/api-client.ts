/**
 * HTTP API Client for Dispatcher MCP
 *
 * This module provides a type-safe HTTP client for communicating with the Dispatcher API.
 * It replaces direct Prisma database calls with authenticated HTTP requests.
 *
 * Features:
 * - Bearer token authentication (API tokens with st_ prefix)
 * - Automatic retry with exponential backoff for network/server errors
 * - Type-safe request/response handling
 * - Comprehensive error handling
 */

// =============================================================================
// Types and Interfaces
// =============================================================================

/** API Error class for handling HTTP errors */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Pagination metadata returned by list endpoints */
export interface PaginationMeta {
  cursor: string | null;
  hasMore: boolean;
}

/** Team information included in responses */
export interface Team {
  id: string;
  name: string;
  key: string;
}

/** User information for attribution fields */
export interface User {
  id: string;
  name: string;
  email: string;
}

// -----------------------------------------------------------------------------
// Epic Types
// -----------------------------------------------------------------------------

export interface Epic {
  id: string;
  name: string;
  description: string | null;
  structuredDesc: string | null;
  aiContext: string | null;
  aiNotes: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
  teamId: string;
  team?: Team;
  createdAt: string;
  updatedAt: string;
  // Attribution fields
  createdBy: string | null;
  creator?: User | null;
  implementedBy: string | null;
  implementer?: User | null;
  implementedDate: string | null;
  _count?: { features: number };
}

export interface ListEpicsParams {
  team?: string | undefined;
  includeArchived?: boolean | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListEpicsResponse {
  data: Epic[];
  meta: PaginationMeta;
}

export interface CreateEpicData {
  name: string;
  teamId: string;
  description?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
}

// -----------------------------------------------------------------------------
// Composite Epic Types (for create_epic_complete)
// -----------------------------------------------------------------------------

/** Structured description for features and tasks */
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

/** Task input for composite epic creation */
export interface CompositeTaskInput {
  title: string;
  executionOrder?: number;
  estimatedComplexity?: EstimatedComplexity;
  structuredDesc?: StructuredDescription;
}

/** Feature input for composite epic creation */
export interface CompositeFeatureInput {
  title: string;
  executionOrder: number;
  estimatedComplexity: EstimatedComplexity;
  canParallelize?: boolean;
  parallelGroup?: string;
  dependencies?: number[]; // Indices of features this depends on
  structuredDesc?: StructuredDescription;
  tasks: CompositeTaskInput[];
}

/** Input for createEpicComplete */
export interface CreateEpicCompleteInput {
  name: string;
  team: string; // Team ID, name, or key
  description?: string;
  icon?: string;
  color?: string;
  features: CompositeFeatureInput[];
}

/** Task in composite epic response */
export interface CompositeTaskResponse {
  id: string;
  identifier: string;
  title: string;
  executionOrder: number | null;
  estimatedComplexity: string | null;
  statusId: string | null;
}

/** Feature in composite epic response */
export interface CompositeFeatureResponse {
  id: string;
  identifier: string;
  title: string;
  executionOrder: number | null;
  estimatedComplexity: string | null;
  canParallelize: boolean;
  parallelGroup: string | null;
  dependencies: string | null;
  statusId: string | null;
  tasks: CompositeTaskResponse[];
}

/** Response from createEpicComplete */
export interface CreateEpicCompleteResponse {
  epic: {
    id: string;
    name: string;
    description: string | null;
    teamId: string;
  };
  features: CompositeFeatureResponse[];
  summary: {
    totalFeatures: number;
    totalTasks: number;
  };
}

// -----------------------------------------------------------------------------
// Feature Types
// -----------------------------------------------------------------------------

/** Valid values for estimated complexity */
export type EstimatedComplexity = "trivial" | "simple" | "moderate" | "complex";

export interface Feature {
  id: string;
  epicId: string;
  identifier: string;
  title: string;
  description: string | null;
  statusId: string | null;
  assigneeId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // Execution metadata
  executionOrder: number | null;
  canParallelize: boolean;
  parallelGroup: string | null;
  dependencies: string | null; // JSON array of feature IDs
  estimatedComplexity: EstimatedComplexity | null;
  // Attribution fields
  createdBy: string | null;
  creator?: User | null;
  implementedBy: string | null;
  implementer?: User | null;
  implementedDate: string | null;
  tasks?: Task[];
  _count?: { tasks: number };
}

export interface ListFeaturesParams {
  epic?: string | undefined;
  epicId?: string | undefined;
  status?: string | undefined;
  statusId?: string | undefined;
  statusCategory?: string | undefined;
  assignee?: string | undefined;
  assigneeId?: string | undefined;
  query?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListFeaturesResponse {
  data: Feature[];
  meta: PaginationMeta;
}

export interface CreateFeatureData {
  title: string;
  epicId: string;
  description?: string | undefined;
  statusId?: string | undefined;
  assigneeId?: string | undefined;
  // Execution metadata
  executionOrder?: number | undefined;
  canParallelize?: boolean | undefined;
  parallelGroup?: string | undefined;
  dependencies?: string[] | undefined;
  estimatedComplexity?: EstimatedComplexity | undefined;
}

export interface UpdateFeatureData {
  title?: string | undefined;
  description?: string | undefined;
  statusId?: string | undefined;
  assigneeId?: string | undefined;
  // Execution metadata
  executionOrder?: number | undefined;
  canParallelize?: boolean | undefined;
  parallelGroup?: string | undefined;
  dependencies?: string[] | undefined;
  estimatedComplexity?: EstimatedComplexity | undefined;
}

// -----------------------------------------------------------------------------
// Task Types
// -----------------------------------------------------------------------------

export interface Task {
  id: string;
  featureId: string;
  identifier: string;
  title: string;
  description: string | null;
  statusId: string | null;
  assigneeId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // Execution metadata
  executionOrder: number | null;
  canParallelize: boolean;
  parallelGroup: string | null;
  dependencies: string | null; // JSON array of task IDs
  estimatedComplexity: EstimatedComplexity | null;
  // Attribution fields
  createdBy: string | null;
  creator?: User | null;
  implementedBy: string | null;
  implementer?: User | null;
  implementedDate: string | null;
}

export interface ListTasksParams {
  feature?: string | undefined;
  featureId?: string | undefined;
  epicId?: string | undefined;
  status?: string | undefined;
  statusId?: string | undefined;
  statusCategory?: string | undefined;
  assignee?: string | undefined;
  assigneeId?: string | undefined;
  query?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListTasksResponse {
  data: Task[];
  meta: PaginationMeta;
}

export interface CreateTaskData {
  title: string;
  featureId: string;
  description?: string | undefined;
  statusId?: string | undefined;
  assigneeId?: string | undefined;
  // Execution metadata
  executionOrder?: number | undefined;
  canParallelize?: boolean | undefined;
  parallelGroup?: string | undefined;
  dependencies?: string[] | undefined;
  estimatedComplexity?: EstimatedComplexity | undefined;
}

export interface UpdateTaskData {
  title?: string | undefined;
  description?: string | undefined;
  statusId?: string | undefined;
  assigneeId?: string | undefined;
  // Execution metadata
  executionOrder?: number | undefined;
  canParallelize?: boolean | undefined;
  parallelGroup?: string | undefined;
  dependencies?: string[] | undefined;
  estimatedComplexity?: EstimatedComplexity | undefined;
}

// -----------------------------------------------------------------------------
// Status Types
// -----------------------------------------------------------------------------

export interface Status {
  id: string;
  name: string;
  category: string;
  color: string | null;
  position: number;
  teamId: string | null;
  personalScopeId?: string | null;
}

export interface ListStatusesResponse {
  data: Status[];
}

// -----------------------------------------------------------------------------
// Personal Scope Types
// -----------------------------------------------------------------------------

/** Personal scope information */
export interface PersonalScope {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/** Personal epic (extends Epic but has personalScopeId instead of teamId) */
export interface PersonalEpic {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
  personalScopeId: string;
  teamId: null;
  createdAt: string;
  updatedAt: string;
  // Attribution fields
  createdBy: string | null;
  creator?: User | null;
  implementedBy: string | null;
  implementer?: User | null;
  implementedDate: string | null;
  _count?: { features: number };
}

export interface ListPersonalEpicsParams {
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface ListPersonalEpicsResponse {
  data: PersonalEpic[];
  meta: PaginationMeta;
}

export interface CreatePersonalEpicData {
  name: string;
  description?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
}

// Backwards compatibility aliases (API still uses /me/projects endpoints)
export type PersonalProject = PersonalEpic;
export type ListPersonalProjectsParams = ListPersonalEpicsParams;
export type ListPersonalProjectsResponse = ListPersonalEpicsResponse;
export type CreatePersonalProjectData = CreatePersonalEpicData;

export interface PersonalStatus {
  id: string;
  name: string;
  category: string;
  color: string | null;
  position: number;
  personalScopeId: string;
  teamId: null;
}

export interface ListPersonalStatusesResponse {
  data: PersonalStatus[];
}

// -----------------------------------------------------------------------------
// Search Types
// -----------------------------------------------------------------------------

export interface SearchParams {
  query?: string | undefined;
  epic?: string | undefined;
  status?: string | undefined;
  statusCategory?: string | undefined;
  assignee?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  type?: "feature" | "task" | "all" | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface SearchResultItem {
  type: "feature" | "task";
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  statusId: string | null;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  epicId?: string;
  featureId?: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  meta: {
    total: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

// -----------------------------------------------------------------------------
// Template Types
// -----------------------------------------------------------------------------

/** Task template within a feature */
export interface TemplateTask {
  titleTemplate: string;
  descriptionPrompt?: string;
  executionOrder: number;
}

/** Feature template within an epic */
export interface TemplateFeature {
  titleTemplate: string;
  descriptionPrompt?: string;
  executionOrder: number;
  canParallelize?: boolean;
  tasks?: TemplateTask[];
}

/** Epic defaults for a template */
export interface TemplateEpicDefaults {
  icon?: string;
  color?: string;
  descriptionPrompt?: string;
}

/** Complete template structure */
export interface TemplateStructure {
  epicDefaults?: TemplateEpicDefaults;
  features: TemplateFeature[];
}

/** Summary of a template for listing */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  featureCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Full template with parsed structure */
export interface Template {
  id: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  structure: TemplateStructure;
  availableVariables: string[];
  createdAt: string;
  updatedAt: string;
}

/** Preview result from applying variables to a template */
export interface TemplatePreviewResult {
  epicName: string;
  epicDescription?: string;
  epicIcon?: string;
  epicColor?: string;
  features: {
    title: string;
    description?: string;
    executionOrder: number;
    canParallelize: boolean;
    tasks: {
      title: string;
      description?: string;
      executionOrder: number;
    }[];
  }[];
}

/** Result from creating epic/features/tasks from a template */
export interface CreateFromTemplateResult {
  epic: {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
  };
  features: {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    executionOrder: number | null;
    canParallelize: boolean;
    tasks: {
      id: string;
      identifier: string;
      title: string;
      description: string | null;
      executionOrder: number | null;
    }[];
  }[];
}

export interface ListTemplatesResponse {
  data: TemplateSummary[];
}

export interface CreateFromTemplateInput {
  epicName: string;
  teamId: string;
  variables?: Record<string, string>;
  epicDescription?: string;
  epicIcon?: string;
  epicColor?: string;
}

export interface SaveAsTemplateInput {
  epicId: string;
  templateName: string;
  description?: string;
}

// -----------------------------------------------------------------------------
// Execution Plan Types
// -----------------------------------------------------------------------------

/** Item with parsed execution metadata */
export interface ExecutionItem {
  type: "feature" | "task";
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  statusId: string | null;
  executionOrder: number | null;
  canParallelize: boolean;
  parallelGroup: string | null;
  dependencies: string[];
  estimatedComplexity: EstimatedComplexity | null;
}

/** A phase in the execution plan */
export interface ExecutionPhase {
  order: number;
  items: ExecutionItem[];
  canRunInParallel: boolean;
  estimatedComplexity: EstimatedComplexity | null;
}

/** Execution plan response */
export interface ExecutionPlanResponse {
  epicId: string;
  phases: ExecutionPhase[];
  totalItems: number;
}

// -----------------------------------------------------------------------------
// AI Context Types
// -----------------------------------------------------------------------------

/** Valid AI note types */
export type AiNoteType = "observation" | "decision" | "blocker" | "next-step" | "context";

/** A single AI note */
export interface AiNote {
  timestamp: string;
  sessionId?: string;
  type: AiNoteType;
  content: string;
}

/** AI context response */
export interface AiContextResponse {
  aiContext: string | null;
  aiNotes: AiNote[];
  lastAiSessionId: string | null;
  lastAiUpdateAt: string | null;
}

/** Input for appending an AI note */
export interface AppendAiNoteInput {
  type: AiNoteType;
  content: string;
  sessionId?: string | undefined;
}

/** Input for setting AI context */
export interface SetAiContextInput {
  context: string;
  sessionId?: string | undefined;
}

// -----------------------------------------------------------------------------
// Progress Tracking Types
// -----------------------------------------------------------------------------

/** Entity type for progress operations */
export type ProgressEntityType = "feature" | "task";

/** Input for starting work on an item */
export interface StartWorkInput {
  sessionId?: string | undefined;
}

/** Input for completing work on an item */
export interface CompleteWorkInput {
  summary?: string | undefined;
  sessionId?: string | undefined;
}

/** Input for logging progress on an item */
export interface LogProgressInput {
  message: string;
  percentComplete?: number | undefined;
  sessionId?: string | undefined;
}

/** Input for reporting a blocker */
export interface ReportBlockerInput {
  reason: string;
  blockedById?: string | undefined;
  sessionId?: string | undefined;
}

/** Response from start work operation */
export interface StartWorkResponse {
  id: string;
  identifier: string;
  title: string;
  statusId: string | null;
  startedAt: string;
  message: string;
}

/** Response from complete work operation */
export interface CompleteWorkResponse {
  id: string;
  identifier: string;
  title: string;
  statusId: string | null;
  startedAt: string | null;
  completedAt: string;
  durationMinutes: number | null;
  message: string;
}

/** Response from log progress operation */
export interface LogProgressResponse {
  id: string;
  identifier: string;
  title: string;
  percentComplete: number | null;
  message: string;
}

/** Response from report blocker operation */
export interface ReportBlockerResponse {
  id: string;
  identifier: string;
  title: string;
  statusId: string | null;
  blockerReason: string;
  blockedById: string | null;
  message: string;
}

// -----------------------------------------------------------------------------
// Structured Description Types
// -----------------------------------------------------------------------------

/** Risk level values */
export type RiskLevel = "low" | "medium" | "high";

/** Estimated effort values */
export type EstimatedEffort = "trivial" | "small" | "medium" | "large" | "xl";

/** External link structure */
export interface ExternalLink {
  url: string;
  title: string;
}

/** Full structured description object */
export interface StructuredDescription {
  summary: string;
  aiInstructions?: string | undefined;
  acceptanceCriteria?: string[] | undefined;
  filesInvolved?: string[] | undefined;
  functionsToModify?: string[] | undefined;
  testingStrategy?: string | undefined;
  testFiles?: string[] | undefined;
  relatedItemIds?: string[] | undefined;
  externalLinks?: ExternalLink[] | undefined;
  technicalNotes?: string | undefined;
  riskLevel?: RiskLevel | undefined;
  estimatedEffort?: EstimatedEffort | undefined;
}

/** Structured description response from API */
export interface StructuredDescriptionResponse {
  structuredDesc: StructuredDescription | null;
  updatedAt: string;
}

/** Valid section names */
export type StructuredDescriptionSection =
  | "summary"
  | "aiInstructions"
  | "acceptanceCriteria"
  | "filesInvolved"
  | "functionsToModify"
  | "testingStrategy"
  | "testFiles"
  | "relatedItemIds"
  | "externalLinks"
  | "technicalNotes"
  | "riskLevel"
  | "estimatedEffort";

// -----------------------------------------------------------------------------
// Validation Checklist Types
// -----------------------------------------------------------------------------

/** Validation check types */
export type ValidationCheckType = 
  | "command" 
  | "file_exists" 
  | "file_contains" 
  | "test_passes" 
  | "manual";

/** Validation check status */
export type ValidationCheckStatus = "pending" | "passed" | "failed";

/** A single validation check */
export interface ValidationCheck {
  id: string;
  type: ValidationCheckType;
  description: string;
  command?: string;
  expectedExitCode?: number;
  timeoutMs?: number;
  filePath?: string;
  searchPattern?: string;
  testCommand?: string;
  status: ValidationCheckStatus;
  lastCheckedAt?: string;
  lastError?: string;
  lastOutput?: string;
}

/** Input for adding a validation check */
export interface AddValidationCheckInput {
  type: ValidationCheckType;
  description: string;
  command?: string;
  expectedExitCode?: number;
  timeoutMs?: number;
  filePath?: string;
  searchPattern?: string;
  testCommand?: string;
}

/** Input for running all validations */
export interface RunAllValidationsInput {
  stopOnFailure?: boolean;
  workingDirectory?: string;
}

/** Result of running a single validation check */
export interface ValidationCheckResult {
  id: string;
  description: string;
  type: ValidationCheckType;
  status: ValidationCheckStatus;
  passed: boolean;
  error?: string;
  output?: string;
  durationMs?: number;
}

/** Response from listing validations */
export interface ListValidationsResponse {
  taskId: string;
  identifier: string;
  checks: ValidationCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
  };
}

/** Response from running all validations */
export interface RunAllValidationsResponse {
  taskId: string;
  identifier: string;
  totalChecks: number;
  passed: number;
  failed: number;
  pending: number;
  allPassed: boolean;
  results: ValidationCheckResult[];
}

// -----------------------------------------------------------------------------
// Session Types
// -----------------------------------------------------------------------------

/** Valid session status values */
export type SessionStatus = "active" | "completed" | "abandoned";

/** Item worked on during a session */
export interface SessionWorkItem {
  type: "feature" | "task";
  id: string;
  identifier: string;
  action: string;
  timestamp: string;
}

/** Decision made during a session */
export interface SessionDecision {
  decision: string;
  rationale?: string | undefined;
}

/** Session response from API */
export interface SessionResponse {
  id: string;
  epicId: string;
  externalId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  itemsWorkedOn: SessionWorkItem[];
  summary: string | null;
  nextSteps: string[] | null;
  blockers: string[] | null;
  decisions: SessionDecision[] | null;
  contextBlob: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Epic progress summary */
export interface EpicProgress {
  totalFeatures: number;
  completedFeatures: number;
  inProgressFeatures: number;
  totalTasks: number;
  completedTasks: number;
}

/** Response from starting a session */
export interface StartSessionResponse {
  session: SessionResponse;
  previousSession: SessionResponse | null;
  epicProgress: EpicProgress;
}

/** Response from getting session history */
export interface SessionHistoryResponse {
  sessions: SessionResponse[];
  total: number;
}

/** Input for starting a session */
export interface StartSessionInput {
  epicId: string;
  externalId?: string | undefined;
}

/** Input for ending a session */
export interface EndSessionInput {
  summary: string;
  nextSteps?: string[] | undefined;
  blockers?: string[] | undefined;
  decisions?: SessionDecision[] | undefined;
  contextBlob?: string | undefined;
}

/** Input for logging work during a session */
export interface LogSessionWorkInput {
  itemId: string;
  itemType: "feature" | "task";
  identifier: string;
  action: string;
}

// -----------------------------------------------------------------------------
// Code Context Types
// -----------------------------------------------------------------------------

/** Code context for a feature or task */
export interface CodeContext {
  files: string[];
  functions: string[];
  branch: string | null;
  commits: string[];
  pr: {
    number: number;
    url: string;
  } | null;
}

/** Code context response from API */
export interface CodeContextResponse {
  entityType: "feature" | "task";
  entityId: string;
  identifier: string;
  codeContext: CodeContext;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// Reorder Types
// -----------------------------------------------------------------------------

export interface ReorderParams {
  afterId?: string | undefined;
  beforeId?: string | undefined;
}

// -----------------------------------------------------------------------------
// Skill Pack Types
// -----------------------------------------------------------------------------

/** Skill pack manifest */
export interface SkillPackManifest {
  name: string;
  version: string;
  description?: string;
  agents?: {
    name: string;
    path: string;
    description?: string;
  }[];
  skills?: {
    name: string;
    path: string;
    description?: string;
  }[];
  instructions?: {
    name: string;
    path: string;
    description?: string;
  }[];
  dependencies?: Record<string, string>;
}

/** Skill pack from registry */
export interface SkillPack {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  authorName: string | null;
  authorUrl: string | null;
  homepageUrl: string | null;
  latestVersion: string | null;
  isOfficial: boolean;
  isDeprecated: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Skill pack version */
export interface SkillPackVersion {
  id: string;
  skillPackId: string;
  version: string;
  manifest: string; // JSON stringified SkillPackManifest
  releaseNotes: string | null;
  isPrerelease: boolean;
  publishedAt: string;
  downloads: number;
}

/** Installed skill pack */
export interface InstalledSkillPack {
  skillPackId: string;
  installedVersion: string;
  isEnabled: boolean;
  installedAt: string;
  lastUpdatedAt: string;
  skillPack?: SkillPack;
}

/** List skill packs params */
export interface ListSkillPacksParams {
  cursor?: string | undefined;
  limit?: number | undefined;
  isOfficial?: boolean | undefined;
  query?: string | undefined;
}

/** List skill packs response */
export interface ListSkillPacksResponse {
  data: SkillPack[];
  meta: PaginationMeta;
}

/** Skill pack with versions */
export interface SkillPackWithVersions extends SkillPack {
  versions: SkillPackVersion[];
}

/** Install skill pack input */
export interface InstallSkillPackInput {
  version: string;
}

// -----------------------------------------------------------------------------
// Summary Types
// -----------------------------------------------------------------------------

export interface BlockedItem {
  id: string;
  type: "feature" | "task";
  identifier: string;
  title: string;
  blockerReason: string;
}

export interface ActionableItem {
  id: string;
  type: "feature" | "task";
  identifier: string;
  title: string;
  executionOrder: number | null;
  complexity: "trivial" | "simple" | "moderate" | "complex" | null;
}

export interface RecentlyCompletedItem {
  id: string;
  type: "feature" | "task";
  identifier: string;
  title: string;
  completedAt: string;
}

export interface LastSessionSummary {
  endedAt: string;
  summary: string;
  nextSteps: string[];
}

export interface ProgressSummary {
  epic: {
    id: string;
    name: string;
    description: string | null;
  };
  totalFeatures: number;
  completedFeatures: number;
  inProgressFeatures: number;
  blockedFeatures: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  overallProgress: number;
  estimatedRemaining: string;
  blockedItems: BlockedItem[];
  nextActionable: ActionableItem[];
  recentlyCompleted: RecentlyCompletedItem[];
  lastSession: LastSessionSummary | null;
}

export interface MyWorkItem {
  id: string;
  type: "feature" | "task";
  identifier: string;
  title: string;
  epicId: string;
  epicName: string;
  status: string | null;
  statusCategory: string | null;
  executionOrder: number | null;
  complexity: "trivial" | "simple" | "moderate" | "complex" | null;
  percentComplete: number | null;
}

export interface MyWorkResponse {
  items: MyWorkItem[];
  inProgress: number;
  blocked: number;
  total: number;
}

export interface BlockedSummaryItem {
  id: string;
  type: "feature" | "task";
  identifier: string;
  title: string;
  epicId: string;
  epicName: string;
  blockerReason: string;
  blockedSince: string | null;
}

export interface BlockedSummaryResponse {
  items: BlockedSummaryItem[];
  totalBlocked: number;
  byEpic: {
    epicId: string;
    epicName: string;
    count: number;
  }[];
}

// -----------------------------------------------------------------------------
// Decision Types
// -----------------------------------------------------------------------------

/** Valid decision categories */
export type DecisionCategory =
  | "architecture"
  | "library"
  | "approach"
  | "scope"
  | "design"
  | "tradeoff"
  | "deferral";

/** Valid impact levels */
export type ImpactLevel = "low" | "medium" | "high";

/** Law record */
export interface Law {
  id: string;
  lawCode: string;
  title: string;
  description: string;
  severity: string;
  auditLogic: string;
  consequence: string;
  appliesTo: string;
  isActive: boolean;
  namespace: string;
  createdAt: string;
  updatedAt: string;
}

/** Case filed against an AI agent */
export interface Case {
  id: string;
  caseNumber: number;
  accusedAgent: string;
  lawId: string;
  evidence: string;
  severity: string;
  status: string;
  filedBy: string;
  verdict: string | null;
  verdictReason: string | null;
  deductionLevel: string | null;
  remediationTaskId: string | null;
  filedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  law?: Law;
  remediationTask?: Record<string, unknown> | null;
}

/** Agent score record */
export interface AgentScore {
  id: string;
  agentName: string;
  agentTitle: string;
  totalScore: number;
  bustsReceived: number;
  bustsIssued: number;
  cleanCycles: number;
  lastAuditAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Pattern registry entry (ENG-65) */
export interface PatternResponse {
  id: string;
  epicId: string | null;
  name: string;
  category: string;
  description: string;
  examples: string[];
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

/** Briefing response (ENG-66) */
export interface BriefingResponse {
  briefing: string;
  tokenCount: number;
  sources: string[];
}

/** Decision record */
export interface Decision {
  id: string;
  epicId: string;
  featureId: string | null;
  taskId: string | null;
  question: string;
  decision: string;
  rationale: string;
  alternatives: string | null; // JSON array
  madeBy: string;
  madeAt: string;
  category: string | null;
  impact: string | null;
  createdAt: string;
  updatedAt: string;
  epic?: {
    id: string;
    name: string;
  };
  feature?: {
    id: string;
    identifier: string;
    title: string;
  } | null;
  task?: {
    id: string;
    identifier: string;
    title: string;
  } | null;
}

/** Input for creating a decision */
export interface CreateDecisionInput {
  epicId: string;
  featureId?: string | undefined;
  taskId?: string | undefined;
  question: string;
  decision: string;
  rationale: string;
  alternatives?: string[] | undefined;
  madeBy?: string | undefined;
  category?: DecisionCategory | undefined;
  impact?: ImpactLevel | undefined;
}

/** Parameters for listing decisions */
export interface ListDecisionsParams {
  cursor?: string | undefined;
  limit?: number | undefined;
  epicId?: string | undefined;
  featureId?: string | undefined;
  taskId?: string | undefined;
  category?: DecisionCategory | undefined;
  impact?: ImpactLevel | undefined;
  createdAt?: string | undefined;
  createdBefore?: string | undefined;
}

/** Parameters for searching decisions */
export interface SearchDecisionsParams {
  query: string;
  epicId?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** Response for listing decisions */
export interface ListDecisionsResponse {
  data: Decision[];
  meta: PaginationMeta;
}

/** Decision context for a task */
export interface TaskDecisionContextResponse {
  taskDecisions: Decision[];
  featureDecisions: Decision[];
  epicDecisions: Decision[];
}

/** Decision context for a feature */
export interface FeatureDecisionContextResponse {
  featureDecisions: Decision[];
  epicDecisions: Decision[];
}

// -----------------------------------------------------------------------------
// Epic Request Types
// -----------------------------------------------------------------------------

/** Valid epic request status values */
export type EpicRequestStatus = "pending" | "approved" | "rejected" | "converted";

/** Valid reaction types */
export type ReactionType = "like" | "fire" | "dislike";

/** Structured description for Epic Requests */
export interface EpicRequestStructuredDesc {
  problemStatement: string;
  proposedSolution: string;
  impactAssessment: string;
  targetAudience?: string;
  successMetrics?: string;
  alternatives?: string;
  dependencies?: string;
  estimatedEffort?: string;
}

/** Epic Request entity */
export interface EpicRequest {
  id: string;
  title: string;
  description: string | null;
  structuredDesc: EpicRequestStructuredDesc | null;
  status: EpicRequestStatus;
  requestedById: string;
  requestedBy?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** Epic Request with aggregated reaction counts */
export interface EpicRequestWithReactionCounts extends EpicRequest {
  reactionCounts: {
    reactionType: string;
    count: number;
  }[];
  userReaction?: string | null;
}

/** Epic Request Comment */
export interface EpicRequestComment {
  id: string;
  content: string;
  epicRequestId: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** Parameters for listing epic requests */
export interface ListEpicRequestsParams {
  cursor?: string | undefined;
  limit?: number | undefined;
  status?: EpicRequestStatus | undefined;
  requestedById?: string | undefined;
}

/** Response for listing epic requests */
export interface ListEpicRequestsResponse {
  data: EpicRequestWithReactionCounts[];
  meta: PaginationMeta;
}

/** Input for creating a new epic request */
export interface CreateEpicRequestInput {
  title: string;
  description?: string | undefined;
  structuredDesc?: EpicRequestStructuredDesc | undefined;
}

/** Input for updating an epic request */
export interface UpdateEpicRequestInput {
  title?: string | undefined;
  description?: string | undefined;
  structuredDesc?: EpicRequestStructuredDesc | undefined;
  status?: EpicRequestStatus | undefined;
}

/** Input for adding a reaction */
export interface AddReactionInput {
  reactionType: ReactionType;
}

/** Input for creating a comment */
export interface CreateCommentInput {
  content: string;
}

/** Input for updating a comment */
export interface UpdateCommentInput {
  content: string;
}

/** Parameters for listing comments */
export interface ListCommentsParams {
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** Response for listing comments */
export interface ListCommentsResponse {
  data: EpicRequestComment[];
  meta: PaginationMeta;
}

// -----------------------------------------------------------------------------
// Changelog Types
// -----------------------------------------------------------------------------

/** Valid entity types for changelog queries */
export type ChangelogEntityType = "epic" | "feature" | "task";

/** Changelog entry record */
export interface ChangelogEntry {
  id: string;
  entityType: string;
  entityId: string;
  epicId: string;
  field: string;
  oldValue: string | null; // JSON stringified value
  newValue: string | null; // JSON stringified value
  changedBy: string;
  changedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Parameters for getting entity changelog */
export interface GetChangelogParams {
  entityType: ChangelogEntityType;
  entityId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
  field?: string | undefined;
  changedBy?: string | undefined;
  since?: string | undefined;
  until?: string | undefined;
}

/** Response for listing changelog entries */
export interface ChangelogResponse {
  data: ChangelogEntry[];
  meta: PaginationMeta;
}

// =============================================================================
// API Client Configuration
// =============================================================================

interface ApiClientConfig {
  baseUrl: string;
  token: string;
}

let clientConfig: ApiClientConfig | null = null;

/**
 * Initialize the API client with configuration.
 * Must be called before using getApiClient().
 */
export function initializeApiClient(config: ApiClientConfig): void {
  if (!config.token) {
    throw new Error("API_TOKEN is required for API client initialization");
  }
  clientConfig = config;
}

/**
 * Get the configured API client instance.
 * Throws if not initialized.
 */
export function getApiClient(): ApiClient {
  if (!clientConfig) {
    // Try to initialize from environment variables
    const token = process.env.API_TOKEN;
    const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

    if (!token) {
      throw new Error(
        "API client not initialized. Call initializeApiClient() or set API_TOKEN environment variable."
      );
    }

    clientConfig = { baseUrl, token };
  }

  return new ApiClient(clientConfig.baseUrl, clientConfig.token);
}

// =============================================================================
// API Client Implementation
// =============================================================================

/** Maximum number of retry attempts for failed requests */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff */
const BASE_RETRY_DELAY = 1000;

/** Network error codes that should trigger a retry */
const RETRYABLE_ERROR_CODES = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"];

export class ApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.token = token;
  }

  // ---------------------------------------------------------------------------
  // Private Request Method with Retry Logic
  // ---------------------------------------------------------------------------

  /**
   * Make an HTTP request with automatic retry for transient failures.
   *
   * Retry behavior:
   * - Retries on network errors (ECONNREFUSED, ETIMEDOUT, etc.)
   * - Retries on 5xx server errors
   * - Does NOT retry on 4xx client errors
   * - Uses exponential backoff: 1s, 2s, 4s
   */
  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "User-Agent": "Dispatcher-MCP/1.0",
            "X-MCP-Request": "true",
          },
        };

        if (body) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        // Handle non-2xx responses
        if (!response.ok) {
          let responseBody: unknown;
          try {
            responseBody = await response.json();
          } catch {
            responseBody = await response.text();
          }

          // Don't retry 4xx errors (client errors)
          if (response.status >= 400 && response.status < 500) {
            const message =
              typeof responseBody === "object" && responseBody !== null && "message" in responseBody
                ? (responseBody as { message: string }).message
                : `HTTP ${String(response.status)}`;
            throw new ApiError(response.status, responseBody, message);
          }

          // Retry 5xx errors
          if (response.status >= 500) {
            lastError = new ApiError(
              response.status,
              responseBody,
              `Server error: HTTP ${String(response.status)}`
            );
            await this.delay(BASE_RETRY_DELAY * Math.pow(2, attempt));
            continue;
          }
        }

        // Parse successful response
        const data = (await response.json()) as T;
        return data;
      } catch (error) {
        // Handle network errors
        if (error instanceof TypeError || this.isNetworkError(error)) {
          lastError = error instanceof Error ? error : new Error(String(error));
          await this.delay(BASE_RETRY_DELAY * Math.pow(2, attempt));
          continue;
        }

        // Re-throw ApiError (don't retry 4xx)
        if (error instanceof ApiError) {
          throw error;
        }

        // Re-throw unexpected errors
        throw error;
      }
    }

    // All retries exhausted
    throw lastError ?? new Error(`Request failed after ${String(MAX_RETRIES)} attempts`);
  }

  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code !== undefined && RETRYABLE_ERROR_CODES.includes(code);
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------------------------
  // Query String Builder
  // ---------------------------------------------------------------------------

  private buildQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, typeof value === "string" ? value : String(value));
      }
    }
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : "";
  }

  // ---------------------------------------------------------------------------
  // Epic Methods
  // ---------------------------------------------------------------------------

  async listEpics(params?: ListEpicsParams): Promise<ListEpicsResponse> {
    const query = this.buildQueryString({
      teamId: params?.team,
      includeArchived: params?.includeArchived,
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.request<ListEpicsResponse>("GET", `/api/v1/epics${query}`);
  }

  async getEpic(idOrName: string): Promise<{ data: Epic }> {
    return this.request<{ data: Epic }>("GET", `/api/v1/epics/${encodeURIComponent(idOrName)}`);
  }

  async createEpic(data: CreateEpicData): Promise<{ data: Epic }> {
    return this.request<{ data: Epic }>("POST", "/api/v1/epics", data);
  }

  async updateEpic(
    id: string,
    data: Partial<Omit<CreateEpicData, "teamId">>
  ): Promise<{ data: Epic }> {
    return this.request<{ data: Epic }>("PUT", `/api/v1/epics/${encodeURIComponent(id)}`, data);
  }

  async reorderEpic(id: string, params: ReorderParams): Promise<{ data: Epic }> {
    return this.request<{ data: Epic }>(
      "PUT",
      `/api/v1/epics/${encodeURIComponent(id)}/reorder`,
      params
    );
  }

  async archiveEpic(id: string): Promise<{ data: Epic }> {
    return this.request<{ data: Epic }>("POST", `/api/v1/epics/${encodeURIComponent(id)}/archive`);
  }

  async unarchiveEpic(id: string): Promise<{ data: Epic }> {
    return this.request<{ data: Epic }>("POST", `/api/v1/epics/${encodeURIComponent(id)}/unarchive`);
  }

  /**
   * Create an epic with all features, tasks, and structured descriptions atomically.
   * This is a composite operation that reduces many tool calls to a single call.
   */
  async createEpicComplete(input: CreateEpicCompleteInput): Promise<{ data: CreateEpicCompleteResponse }> {
    return this.request<{ data: CreateEpicCompleteResponse }>("POST", "/api/v1/epics/complete", input);
  }

  // ---------------------------------------------------------------------------
  // Feature Methods
  // ---------------------------------------------------------------------------

  async listFeatures(params?: ListFeaturesParams): Promise<ListFeaturesResponse> {
    const query = this.buildQueryString({
      epicId: params?.epicId ?? params?.epic,
      statusId: params?.statusId,
      status: params?.status,
      statusCategory: params?.statusCategory,
      assigneeId: params?.assigneeId,
      assignee: params?.assignee,
      query: params?.query,
      createdAt: params?.createdAt,
      updatedAt: params?.updatedAt,
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.request<ListFeaturesResponse>("GET", `/api/v1/features${query}`);
  }

  async getFeature(idOrIdentifier: string): Promise<{ data: Feature }> {
    return this.request<{ data: Feature }>(
      "GET",
      `/api/v1/features/${encodeURIComponent(idOrIdentifier)}`
    );
  }

  async createFeature(data: CreateFeatureData): Promise<{ data: Feature }> {
    return this.request<{ data: Feature }>("POST", "/api/v1/features", data);
  }

  async updateFeature(idOrIdentifier: string, data: UpdateFeatureData): Promise<{ data: Feature }> {
    return this.request<{ data: Feature }>(
      "PUT",
      `/api/v1/features/${encodeURIComponent(idOrIdentifier)}`,
      data
    );
  }

  async reorderFeature(id: string, params: ReorderParams): Promise<{ data: Feature }> {
    return this.request<{ data: Feature }>(
      "PUT",
      `/api/v1/features/${encodeURIComponent(id)}/reorder`,
      params
    );
  }

  // ---------------------------------------------------------------------------
  // Task Methods
  // ---------------------------------------------------------------------------

  async listTasks(params?: ListTasksParams): Promise<ListTasksResponse> {
    const query = this.buildQueryString({
      featureId: params?.featureId ?? params?.feature,
      epicId: params?.epicId,
      statusId: params?.statusId,
      status: params?.status,
      statusCategory: params?.statusCategory,
      assigneeId: params?.assigneeId,
      assignee: params?.assignee,
      query: params?.query,
      createdAt: params?.createdAt,
      updatedAt: params?.updatedAt,
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.request<ListTasksResponse>("GET", `/api/v1/tasks${query}`);
  }

  async getTask(idOrIdentifier: string): Promise<{ data: Task }> {
    return this.request<{ data: Task }>("GET", `/api/v1/tasks/${encodeURIComponent(idOrIdentifier)}`);
  }

  async createTask(data: CreateTaskData): Promise<{ data: Task; warnings?: string[] }> {
    return this.request<{ data: Task; warnings?: string[] }>("POST", "/api/v1/tasks", data);
  }

  async updateTask(idOrIdentifier: string, data: UpdateTaskData): Promise<{ data: Task }> {
    return this.request<{ data: Task }>(
      "PUT",
      `/api/v1/tasks/${encodeURIComponent(idOrIdentifier)}`,
      data
    );
  }

  async reorderTask(id: string, params: ReorderParams): Promise<{ data: Task }> {
    return this.request<{ data: Task }>(
      "PUT",
      `/api/v1/tasks/${encodeURIComponent(id)}/reorder`,
      params
    );
  }

  // ---------------------------------------------------------------------------
  // AI Context Methods
  // ---------------------------------------------------------------------------

  /**
   * Get AI context for a feature.
   */
  async getFeatureAiContext(featureId: string): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "GET",
      `/api/v1/features/${encodeURIComponent(featureId)}/ai-context`
    );
  }

  /**
   * Set AI context for a feature (replaces entire context).
   */
  async setFeatureAiContext(featureId: string, input: SetAiContextInput): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "PUT",
      `/api/v1/features/${encodeURIComponent(featureId)}/ai-context`,
      input
    );
  }

  /**
   * Append an AI note to a feature (non-destructive).
   */
  async appendFeatureAiNote(featureId: string, input: AppendAiNoteInput): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/ai-note`,
      input
    );
  }

  /**
   * Get AI context for a task.
   */
  async getTaskAiContext(taskId: string): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "GET",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/ai-context`
    );
  }

  /**
   * Set AI context for a task (replaces entire context).
   */
  async setTaskAiContext(taskId: string, input: SetAiContextInput): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "PUT",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/ai-context`,
      input
    );
  }

  /**
   * Append an AI note to a task (non-destructive).
   */
  async appendTaskAiNote(taskId: string, input: AppendAiNoteInput): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/ai-note`,
      input
    );
  }

  /**
   * Get AI context for an epic.
   */
  async getEpicAiContext(epicId: string): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "GET",
      `/api/v1/epics/${encodeURIComponent(epicId)}/ai-context`
    );
  }

  /**
   * Set AI context for an epic (replaces entire context).
   */
  async setEpicAiContext(epicId: string, input: SetAiContextInput): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "PUT",
      `/api/v1/epics/${encodeURIComponent(epicId)}/ai-context`,
      input
    );
  }

  /**
   * Append an AI note to an epic (non-destructive).
   */
  async appendEpicAiNote(epicId: string, input: AppendAiNoteInput): Promise<{ data: AiContextResponse }> {
    return this.request<{ data: AiContextResponse }>(
      "POST",
      `/api/v1/epics/${encodeURIComponent(epicId)}/ai-note`,
      input
    );
  }

  // ---------------------------------------------------------------------------
  // Progress Tracking Methods
  // ---------------------------------------------------------------------------

  /**
   * Start work on a feature - sets status to "In Progress" and records start time
   */
  async startFeatureWork(featureId: string, input?: StartWorkInput): Promise<{ data: StartWorkResponse }> {
    return this.request<{ data: StartWorkResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/progress/start`,
      input ?? {}
    );
  }

  /**
   * Complete work on a feature - sets status to "Done" and records completion time
   */
  async completeFeatureWork(featureId: string, input?: CompleteWorkInput): Promise<{ data: CompleteWorkResponse }> {
    return this.request<{ data: CompleteWorkResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/progress/complete`,
      input ?? {}
    );
  }

  /**
   * Log progress on a feature without changing status
   */
  async logFeatureProgress(featureId: string, input: LogProgressInput): Promise<{ data: LogProgressResponse }> {
    return this.request<{ data: LogProgressResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/progress/log`,
      input
    );
  }

  /**
   * Report a blocker on a feature
   */
  async reportFeatureBlocker(featureId: string, input: ReportBlockerInput): Promise<{ data: ReportBlockerResponse }> {
    return this.request<{ data: ReportBlockerResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/progress/blocker`,
      input
    );
  }

  /**
   * Start work on a task - sets status to "In Progress" and records start time
   */
  async startTaskWork(taskId: string, input?: StartWorkInput): Promise<{ data: StartWorkResponse }> {
    return this.request<{ data: StartWorkResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/progress/start`,
      input ?? {}
    );
  }

  /**
   * Complete work on a task - sets status to "Done" and records completion time
   */
  async completeTaskWork(taskId: string, input?: CompleteWorkInput): Promise<{ data: CompleteWorkResponse }> {
    return this.request<{ data: CompleteWorkResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/progress/complete`,
      input ?? {}
    );
  }

  /**
   * Log progress on a task without changing status
   */
  async logTaskProgress(taskId: string, input: LogProgressInput): Promise<{ data: LogProgressResponse }> {
    return this.request<{ data: LogProgressResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/progress/log`,
      input
    );
  }

  /**
   * Report a blocker on a task
   */
  async reportTaskBlocker(taskId: string, input: ReportBlockerInput): Promise<{ data: ReportBlockerResponse }> {
    return this.request<{ data: ReportBlockerResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/progress/blocker`,
      input
    );
  }

  // ---------------------------------------------------------------------------
  // Structured Description Methods
  // ---------------------------------------------------------------------------

  /**
   * Get structured description for a feature
   */
  async getFeatureStructuredDesc(featureId: string): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "GET",
      `/api/v1/features/${encodeURIComponent(featureId)}/structured-desc`
    );
  }

  /**
   * Set structured description for a feature (replaces entire object)
   */
  async setFeatureStructuredDesc(
    featureId: string,
    structuredDesc: StructuredDescription
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "PUT",
      `/api/v1/features/${encodeURIComponent(featureId)}/structured-desc`,
      structuredDesc
    );
  }

  /**
   * Update a specific section of a feature's structured description
   */
  async updateFeatureSection(
    featureId: string,
    section: StructuredDescriptionSection,
    value: unknown
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "PATCH",
      `/api/v1/features/${encodeURIComponent(featureId)}/structured-desc/section`,
      { section, value }
    );
  }

  /**
   * Add an acceptance criterion to a feature
   */
  async addFeatureAcceptanceCriterion(
    featureId: string,
    criterion: string
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/structured-desc/acceptance-criteria`,
      { criterion }
    );
  }

  /**
   * Link a file to a feature
   */
  async linkFeatureFile(
    featureId: string,
    filePath: string
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/structured-desc/files`,
      { filePath }
    );
  }

  /**
   * Add an external link to a feature
   */
  async addFeatureExternalLink(
    featureId: string,
    link: ExternalLink
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/structured-desc/links`,
      link
    );
  }

  /**
   * Get structured description for a task
   */
  async getTaskStructuredDesc(taskId: string): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "GET",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/structured-desc`
    );
  }

  /**
   * Set structured description for a task (replaces entire object)
   */
  async setTaskStructuredDesc(
    taskId: string,
    structuredDesc: StructuredDescription
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "PUT",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/structured-desc`,
      structuredDesc
    );
  }

  /**
   * Update a specific section of a task's structured description
   */
  async updateTaskSection(
    taskId: string,
    section: StructuredDescriptionSection,
    value: unknown
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "PATCH",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/structured-desc/section`,
      { section, value }
    );
  }

  /**
   * Add an acceptance criterion to a task
   */
  async addTaskAcceptanceCriterion(
    taskId: string,
    criterion: string
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/structured-desc/acceptance-criteria`,
      { criterion }
    );
  }

  /**
   * Link a file to a task
   */
  async linkTaskFile(
    taskId: string,
    filePath: string
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/structured-desc/files`,
      { filePath }
    );
  }

  /**
   * Add an external link to a task
   */
  async addTaskExternalLink(
    taskId: string,
    link: ExternalLink
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/structured-desc/links`,
      link
    );
  }

  /**
   * Get structured description for an epic
   */
  async getEpicStructuredDesc(epicId: string): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "GET",
      `/api/v1/epics/${encodeURIComponent(epicId)}/structured-desc`
    );
  }

  /**
   * Set structured description for an epic (replaces entire object)
   */
  async setEpicStructuredDesc(
    epicId: string,
    structuredDesc: StructuredDescription
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "PUT",
      `/api/v1/epics/${encodeURIComponent(epicId)}/structured-desc`,
      structuredDesc
    );
  }

  /**
   * Update a specific section of an epic's structured description
   */
  async updateEpicSection(
    epicId: string,
    section: StructuredDescriptionSection,
    value: unknown
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "PATCH",
      `/api/v1/epics/${encodeURIComponent(epicId)}/structured-desc/section`,
      { section, value }
    );
  }

  /**
   * Add an acceptance criterion to an epic
   */
  async addEpicAcceptanceCriterion(
    epicId: string,
    criterion: string
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/epics/${encodeURIComponent(epicId)}/structured-desc/acceptance-criteria`,
      { criterion }
    );
  }

  /**
   * Link a file to an epic
   */
  async linkEpicFile(
    epicId: string,
    filePath: string
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/epics/${encodeURIComponent(epicId)}/structured-desc/files`,
      { filePath }
    );
  }

  /**
   * Add an external link to an epic
   */
  async addEpicExternalLink(
    epicId: string,
    link: ExternalLink
  ): Promise<{ data: StructuredDescriptionResponse }> {
    return this.request<{ data: StructuredDescriptionResponse }>(
      "POST",
      `/api/v1/epics/${encodeURIComponent(epicId)}/structured-desc/links`,
      link
    );
  }

  // ---------------------------------------------------------------------------
  // Status Methods
  // ---------------------------------------------------------------------------

  async listStatuses(teamId: string): Promise<ListStatusesResponse> {
    const query = this.buildQueryString({ teamId });
    return this.request<ListStatusesResponse>("GET", `/api/v1/statuses${query}`);
  }

  async getStatus(id: string): Promise<{ data: Status }> {
    return this.request<{ data: Status }>("GET", `/api/v1/statuses/${encodeURIComponent(id)}`);
  }

  /**
   * Resolve a status name or UUID to a status UUID.
   * If the input is already a UUID, it is returned as-is (after validation).
   * If the input is a name, it looks up the status by name within the team.
   *
   * @param statusNameOrId - The status name (e.g., "Done") or UUID
   * @param teamId - The team ID to scope the search (required for name lookup)
   * @returns The status UUID
   * @throws Error if status is not found
   */
  async resolveStatusId(statusNameOrId: string, teamId: string): Promise<string> {
    // UUID regex pattern
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (UUID_REGEX.test(statusNameOrId)) {
      // Already a UUID - validate it exists
      try {
        await this.getStatus(statusNameOrId);
        return statusNameOrId;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          throw new Error(`Status with id '${statusNameOrId}' not found`);
        }
        throw error;
      }
    }

    // Look up by name in the team
    const { data: statuses } = await this.listStatuses(teamId);
    const status = statuses.find(
      (s) => s.name.toLowerCase() === statusNameOrId.toLowerCase()
    );

    if (!status) {
      throw new Error(
        `Status '${statusNameOrId}' not found in team. Available statuses: ${statuses.map((s) => s.name).join(", ")}`
      );
    }

    return status.id;
  }

  // ---------------------------------------------------------------------------
  // Team Methods (for resolution helpers)
  // ---------------------------------------------------------------------------

  /**
   * List teams the authenticated user has access to.
   */
  async listTeams(options?: {
    cursor?: string;
    limit?: number;
  }): Promise<{ data: Team[]; meta: { cursor: string | null; hasMore: boolean } }> {
    const params = new URLSearchParams();
    if (options?.cursor) params.append("cursor", options.cursor);
    if (options?.limit) params.append("limit", String(options.limit));

    const query = params.toString();
    const url = query ? `/api/v1/teams?${query}` : "/api/v1/teams";

    return this.request<{ data: Team[]; meta: { cursor: string | null; hasMore: boolean } }>(
      "GET",
      url
    );
  }

  async getTeam(idOrNameOrKey: string): Promise<{ data: Team } | null> {
    try {
      return await this.request<{ data: Team }>(
        "GET",
        `/api/v1/teams/${encodeURIComponent(idOrNameOrKey)}`
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Personal Scope Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the current user's personal scope.
   * Creates the personal scope if it doesn't exist (lazy initialization).
   */
  async getPersonalScope(): Promise<{ data: PersonalScope }> {
    return this.request<{ data: PersonalScope }>("GET", "/api/v1/me/scope");
  }

  /**
   * List epics in the current user's personal scope.
   * (API endpoint is still /me/projects for backwards compatibility)
   */
  async listPersonalEpics(params?: ListPersonalEpicsParams): Promise<ListPersonalEpicsResponse> {
    const query = this.buildQueryString({
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.request<ListPersonalEpicsResponse>("GET", `/api/v1/me/projects${query}`);
  }

  /**
   * Create a new epic in the current user's personal scope.
   * (API endpoint is still /me/projects for backwards compatibility)
   */
  async createPersonalEpic(data: CreatePersonalEpicData): Promise<{ data: PersonalEpic }> {
    return this.request<{ data: PersonalEpic }>("POST", "/api/v1/me/projects", data);
  }

  // Backwards compatibility aliases
  async listPersonalProjects(params?: ListPersonalProjectsParams): Promise<ListPersonalProjectsResponse> {
    return this.listPersonalEpics(params);
  }

  async createPersonalProject(data: CreatePersonalProjectData): Promise<{ data: PersonalProject }> {
    return this.createPersonalEpic(data);
  }

  /**
   * List statuses in the current user's personal scope.
   */
  async listPersonalStatuses(): Promise<ListPersonalStatusesResponse> {
    return this.request<ListPersonalStatusesResponse>("GET", "/api/v1/me/statuses");
  }

  /**
   * Resolve a status name or UUID to a status UUID within the personal scope.
   */
  async resolvePersonalStatusId(statusNameOrId: string): Promise<string> {
    // UUID regex pattern
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (UUID_REGEX.test(statusNameOrId)) {
      // Already a UUID - validate it exists
      try {
        await this.getStatus(statusNameOrId);
        return statusNameOrId;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          throw new Error(`Status with id '${statusNameOrId}' not found`);
        }
        throw error;
      }
    }

    // Look up by name in the personal scope
    const { data: statuses } = await this.listPersonalStatuses();
    const status = statuses.find(
      (s) => s.name.toLowerCase() === statusNameOrId.toLowerCase()
    );

    if (!status) {
      throw new Error(
        `Status '${statusNameOrId}' not found in personal scope. Available statuses: ${statuses.map((s) => s.name).join(", ")}`
      );
    }

    return status.id;
  }

  // ---------------------------------------------------------------------------
  // Search Method
  // ---------------------------------------------------------------------------

  /**
   * Search for features and tasks with various filters.
   *
   * Note: This is a client-side implementation since the API doesn't have
   * a dedicated search endpoint. It combines results from features and tasks
   * list endpoints.
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    const searchType = params.type ?? "all";
    const limit = params.limit ?? 50;
    const results: SearchResultItem[] = [];

    let featureCursor: string | null = null;
    let taskCursor: string | null = null;
    let hasMoreFeatures = false;
    let hasMoreTasks = false;

    // Parse cursor if provided
    if (params.cursor) {
      if (params.cursor.startsWith("feature:")) {
        featureCursor = params.cursor.slice(8) || null;
      } else if (params.cursor.startsWith("task:")) {
        taskCursor = params.cursor.slice(5) || null;
      } else if (params.cursor.startsWith("combined:")) {
        const parts = params.cursor.slice(9).split("|");
        featureCursor = parts[0] && parts[0] !== "null" ? parts[0] : null;
        taskCursor = parts[1] && parts[1] !== "null" ? parts[1] : null;
      }
    }

    // Search features if requested
    if (searchType === "feature" || searchType === "all") {
      const featureParams: ListFeaturesParams = {
        limit,
      };
      if (params.epic) featureParams.epic = params.epic;
      if (params.status) featureParams.status = params.status;
      if (params.statusCategory) featureParams.statusCategory = params.statusCategory;
      if (params.assignee) featureParams.assignee = params.assignee;
      if (params.query) featureParams.query = params.query;
      if (params.createdAt) featureParams.createdAt = params.createdAt;
      if (params.updatedAt) featureParams.updatedAt = params.updatedAt;
      if (featureCursor) featureParams.cursor = featureCursor;

      const featureResult = await this.listFeatures(featureParams);

      hasMoreFeatures = featureResult.meta.hasMore;
      featureCursor = featureResult.meta.cursor;

      for (const feature of featureResult.data) {
        results.push({
          type: "feature",
          id: feature.id,
          identifier: feature.identifier,
          title: feature.title,
          description: feature.description,
          statusId: feature.statusId,
          assigneeId: feature.assigneeId,
          createdAt: feature.createdAt,
          updatedAt: feature.updatedAt,
          epicId: feature.epicId,
        });
      }
    }

    // Search tasks if requested
    if (searchType === "task" || searchType === "all") {
      const taskParams: ListTasksParams = {
        limit,
      };
      if (params.epic) taskParams.epicId = params.epic;
      if (params.status) taskParams.status = params.status;
      if (params.statusCategory) taskParams.statusCategory = params.statusCategory;
      if (params.assignee) taskParams.assignee = params.assignee;
      if (params.query) taskParams.query = params.query;
      if (params.createdAt) taskParams.createdAt = params.createdAt;
      if (params.updatedAt) taskParams.updatedAt = params.updatedAt;
      if (taskCursor) taskParams.cursor = taskCursor;

      const taskResult = await this.listTasks(taskParams);

      hasMoreTasks = taskResult.meta.hasMore;
      taskCursor = taskResult.meta.cursor;

      for (const task of taskResult.data) {
        results.push({
          type: "task",
          id: task.id,
          identifier: task.identifier,
          title: task.title,
          description: task.description,
          statusId: task.statusId,
          assigneeId: task.assigneeId,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          featureId: task.featureId,
        });
      }
    }

    // Sort combined results by createdAt (newest first)
    if (searchType === "all") {
      results.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Trim to limit
      if (results.length > limit) {
        results.length = limit;
      }
    }

    // Build pagination cursor
    let nextCursor: string | null = null;
    const hasMore =
      searchType === "all"
        ? hasMoreFeatures || hasMoreTasks
        : searchType === "feature"
          ? hasMoreFeatures
          : hasMoreTasks;

    if (hasMore) {
      if (searchType === "feature") {
        nextCursor = featureCursor ? `feature:${featureCursor}` : null;
      } else if (searchType === "task") {
        nextCursor = taskCursor ? `task:${taskCursor}` : null;
      } else {
        nextCursor = `combined:${featureCursor ?? "null"}|${taskCursor ?? "null"}`;
      }
    }

    return {
      results,
      meta: {
        total: results.length,
        cursor: nextCursor,
        hasMore,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Execution Plan Method
  // ---------------------------------------------------------------------------

  /**
   * Get an execution plan for an epic.
   * Analyzes features and their tasks to produce an ordered execution plan
   * with phases that respect dependencies and parallel groups.
   */
  async getExecutionPlan(epicId: string): Promise<ExecutionPlanResponse> {
    // Fetch all features for the epic
    const featuresResult = await this.listFeatures({ epicId, limit: 100 });
    const features = featuresResult.data;

    // Parse dependencies and build execution items
    const items: ExecutionItem[] = features.map((f) => ({
      type: "feature" as const,
      id: f.id,
      identifier: f.identifier,
      title: f.title,
      description: f.description,
      statusId: f.statusId,
      executionOrder: f.executionOrder,
      canParallelize: f.canParallelize,
      parallelGroup: f.parallelGroup,
      dependencies: f.dependencies ? JSON.parse(f.dependencies) as string[] : [],
      estimatedComplexity: f.estimatedComplexity,
    }));

    // Build dependency graph and perform topological sort
    const phases = this.buildExecutionPhases(items);

    return {
      epicId,
      phases,
      totalItems: items.length,
    };
  }

  /**
   * Build execution phases from items using topological sort.
   * Items with no dependencies or whose dependencies are satisfied go into earlier phases.
   */
  private buildExecutionPhases(items: ExecutionItem[]): ExecutionPhase[] {
    // Create a map for quick lookup
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const completed = new Set<string>();
    const phases: ExecutionPhase[] = [];

    // Sort items by executionOrder first (nulls at end)
    const sortedItems = [...items].sort((a, b) => {
      if (a.executionOrder === null && b.executionOrder === null) return 0;
      if (a.executionOrder === null) return 1;
      if (b.executionOrder === null) return -1;
      return a.executionOrder - b.executionOrder;
    });

    let phaseOrder = 1;
    let remaining = sortedItems.filter((item) => !completed.has(item.id));

    while (remaining.length > 0) {
      // Find items whose dependencies are all completed
      const ready = remaining.filter((item) =>
        item.dependencies.every((depId) => completed.has(depId) || !itemMap.has(depId))
      );

      if (ready.length === 0) {
        // Circular dependency or missing dependency - add remaining items
        ready.push(...remaining);
      }

      // Group ready items by parallelGroup
      const parallelGroups = new Map<string | null, ExecutionItem[]>();
      for (const item of ready) {
        const group = item.canParallelize ? (item.parallelGroup ?? "__parallel__") : null;
        if (!parallelGroups.has(group)) {
          parallelGroups.set(group, []);
        }
        parallelGroups.get(group)?.push(item);
      }

      // Create phases for each group
      for (const [groupKey, groupItems] of parallelGroups) {
        const canRunInParallel = groupKey !== null && groupItems.length > 1;
        
        // Determine overall complexity (use highest complexity in group)
        const complexityOrder = ["trivial", "simple", "moderate", "complex"];
        let maxComplexity: EstimatedComplexity | null = null;
        for (const item of groupItems) {
          if (item.estimatedComplexity) {
            if (!maxComplexity || 
                complexityOrder.indexOf(item.estimatedComplexity) > complexityOrder.indexOf(maxComplexity)) {
              maxComplexity = item.estimatedComplexity;
            }
          }
        }

        phases.push({
          order: phaseOrder++,
          items: groupItems,
          canRunInParallel,
          estimatedComplexity: maxComplexity,
        });

        // Mark items as completed
        for (const item of groupItems) {
          completed.add(item.id);
        }
      }

      remaining = sortedItems.filter((item) => !completed.has(item.id));
    }

    return phases;
  }

  // ---------------------------------------------------------------------------
  // Template Methods
  // ---------------------------------------------------------------------------

  /**
   * List all available templates
   */
  async listTemplates(): Promise<ListTemplatesResponse> {
    return this.request<ListTemplatesResponse>("GET", "/api/v1/templates");
  }

  /**
   * Get a template by ID or name
   */
  async getTemplate(idOrName: string): Promise<{ data: Template }> {
    return this.request<{ data: Template }>(
      "GET",
      `/api/v1/templates/${encodeURIComponent(idOrName)}`
    );
  }

  /**
   * Preview what will be created from a template with variable substitution
   */
  async previewTemplate(
    idOrName: string,
    epicName: string,
    variables?: Record<string, string>
  ): Promise<{ data: TemplatePreviewResult }> {
    return this.request<{ data: TemplatePreviewResult }>(
      "POST",
      `/api/v1/templates/${encodeURIComponent(idOrName)}/preview`,
      { epicName, variables }
    );
  }

  /**
   * Create full epic/feature/task structure from a template
   */
  async createFromTemplate(
    idOrName: string,
    input: CreateFromTemplateInput
  ): Promise<{ data: CreateFromTemplateResult }> {
    return this.request<{ data: CreateFromTemplateResult }>(
      "POST",
      `/api/v1/templates/${encodeURIComponent(idOrName)}/create`,
      input
    );
  }

  /**
   * Save an existing epic as a new template
   */
  async saveAsTemplate(input: SaveAsTemplateInput): Promise<{ data: Template }> {
    return this.request<{ data: Template }>(
      "POST",
      "/api/v1/templates/save-from-epic",
      input
    );
  }

  // ---------------------------------------------------------------------------
  // Session Methods
  // ---------------------------------------------------------------------------

  /**
   * Start a new AI session for an epic.
   * Returns the new session, previous session handoff, and epic progress.
   */
  async startSession(input: StartSessionInput): Promise<{ data: StartSessionResponse }> {
    return this.request<{ data: StartSessionResponse }>(
      "POST",
      "/api/v1/sessions/start",
      input
    );
  }

  /**
   * End the active session for an epic with handoff data.
   */
  async endSession(epicId: string, input: EndSessionInput): Promise<{ data: SessionResponse }> {
    return this.request<{ data: SessionResponse }>(
      "POST",
      `/api/v1/sessions/${encodeURIComponent(epicId)}/end`,
      input
    );
  }

  /**
   * Get the active session for an epic, if any.
   */
  async getActiveSession(epicId: string): Promise<{ data: SessionResponse } | null> {
    try {
      return await this.request<{ data: SessionResponse }>(
        "GET",
        `/api/v1/sessions/${encodeURIComponent(epicId)}/active`
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get the last completed session for an epic.
   */
  async getLastSession(epicId: string): Promise<{ data: SessionResponse } | null> {
    try {
      return await this.request<{ data: SessionResponse }>(
        "GET",
        `/api/v1/sessions/${encodeURIComponent(epicId)}/last`
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get session history for an epic.
   */
  async getSessionHistory(epicId: string, limit?: number): Promise<{ data: SessionHistoryResponse }> {
    const query = limit ? `?limit=${String(limit)}` : "";
    return this.request<{ data: SessionHistoryResponse }>(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(epicId)}/history${query}`
    );
  }

  /**
   * Get a specific session by ID.
   */
  async getSession(sessionId: string): Promise<{ data: SessionResponse }> {
    return this.request<{ data: SessionResponse }>(
      "GET",
      `/api/v1/sessions/by-id/${encodeURIComponent(sessionId)}`
    );
  }

  /**
   * Get session state machine state and allowed transitions.
   */
  async getSessionState(sessionId: string): Promise<{ 
    data: { currentState: string; allowedTransitions: string[] } 
  }> {
    return this.request<{ 
      data: { currentState: string; allowedTransitions: string[] } 
    }>(
      "GET",
      `/api/v1/sessions/by-id/${encodeURIComponent(sessionId)}/state`
    );
  }

  /**
   * Log work done during a session.
   */
  async logSessionWork(epicId: string, input: LogSessionWorkInput): Promise<{ data: SessionResponse } | null> {
    try {
      return await this.request<{ data: SessionResponse }>(
        "POST",
        `/api/v1/sessions/${encodeURIComponent(epicId)}/log-work`,
        input
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Abandon a session without providing handoff data.
   */
  async abandonSession(sessionId: string): Promise<{ data: SessionResponse }> {
    return this.request<{ data: SessionResponse }>(
      "POST",
      `/api/v1/sessions/by-id/${encodeURIComponent(sessionId)}/abandon`
    );
  }

  // ===========================================================================
  // Code Context Methods
  // ===========================================================================

  /**
   * Get code context for a feature
   */
  async getFeatureCodeContext(featureId: string): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "GET",
      `/api/v1/features/${encodeURIComponent(featureId)}/code-context`
    );
  }

  /**
   * Link a file to a feature
   */
  async linkFeatureCodeFile(
    featureId: string,
    filePath: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/code-context/files`,
      { filePath }
    );
  }

  /**
   * Unlink a file from a feature
   */
  async unlinkFeatureCodeFile(
    featureId: string,
    filePath: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "DELETE",
      `/api/v1/features/${encodeURIComponent(featureId)}/code-context/files`,
      { filePath }
    );
  }

  /**
   * Link a function to a feature
   */
  async linkFeatureFunction(
    featureId: string,
    filePath: string,
    functionName: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/code-context/functions`,
      { filePath, functionName }
    );
  }

  /**
   * Link a git branch to a feature
   */
  async linkFeatureBranch(
    featureId: string,
    branchName: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/code-context/branch`,
      { branchName }
    );
  }

  /**
   * Link a commit to a feature
   */
  async linkFeatureCommit(
    featureId: string,
    commitSha: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/code-context/commits`,
      { commitSha }
    );
  }

  /**
   * Link a pull request to a feature
   */
  async linkFeaturePr(
    featureId: string,
    prNumber: number,
    prUrl: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/features/${encodeURIComponent(featureId)}/code-context/pr`,
      { prNumber, prUrl }
    );
  }

  /**
   * Get code context for a task
   */
  async getTaskCodeContext(taskId: string): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "GET",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/code-context`
    );
  }

  /**
   * Link a file to a task
   */
  async linkTaskCodeFile(
    taskId: string,
    filePath: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/code-context/files`,
      { filePath }
    );
  }

  /**
   * Unlink a file from a task
   */
  async unlinkTaskCodeFile(
    taskId: string,
    filePath: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "DELETE",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/code-context/files`,
      { filePath }
    );
  }

  /**
   * Link a function to a task
   */
  async linkTaskFunction(
    taskId: string,
    filePath: string,
    functionName: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/code-context/functions`,
      { filePath, functionName }
    );
  }

  /**
   * Link a git branch to a task
   */
  async linkTaskBranch(
    taskId: string,
    branchName: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/code-context/branch`,
      { branchName }
    );
  }

  /**
   * Link a commit to a task
   */
  async linkTaskCommit(
    taskId: string,
    commitSha: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/code-context/commits`,
      { commitSha }
    );
  }

  /**
   * Link a pull request to a task
   */
  async linkTaskPr(
    taskId: string,
    prNumber: number,
    prUrl: string
  ): Promise<{ data: CodeContextResponse }> {
    return this.request<{ data: CodeContextResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/code-context/pr`,
      { prNumber, prUrl }
    );
  }

  // ---------------------------------------------------------------------------
  // Validation Checklist Methods
  // ---------------------------------------------------------------------------

  /**
   * List all validation checks for a task
   */
  async listValidations(taskId: string): Promise<{ data: ListValidationsResponse }> {
    return this.request<{ data: ListValidationsResponse }>(
      "GET",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/validations`
    );
  }

  /**
   * Add a validation check to a task
   */
  async addValidation(
    taskId: string,
    input: AddValidationCheckInput
  ): Promise<{ data: ValidationCheck }> {
    return this.request<{ data: ValidationCheck }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/validations`,
      input
    );
  }

  /**
   * Remove a validation check from a task
   */
  async removeValidation(taskId: string, checkId: string): Promise<void> {
    await this.request<undefined>(
      "DELETE",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/validations/${encodeURIComponent(checkId)}`
    );
  }

  /**
   * Run a single validation check
   */
  async runValidation(
    taskId: string,
    checkId: string,
    workingDirectory?: string
  ): Promise<{ data: ValidationCheckResult }> {
    return this.request<{ data: ValidationCheckResult }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/validations/${encodeURIComponent(checkId)}/run`,
      workingDirectory ? { workingDirectory } : {}
    );
  }

  /**
   * Run all validation checks for a task
   */
  async runAllValidations(
    taskId: string,
    input?: RunAllValidationsInput
  ): Promise<{ data: RunAllValidationsResponse }> {
    return this.request<{ data: RunAllValidationsResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/validations/run-all`,
      input ?? {}
    );
  }

  /**
   * Mark a manual validation check as validated
   */
  async markManualValidated(
    taskId: string,
    checkId: string,
    notes?: string
  ): Promise<{ data: ValidationCheck }> {
    return this.request<{ data: ValidationCheck }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/validations/${encodeURIComponent(checkId)}/manual-validate`,
      notes ? { notes } : {}
    );
  }

  /**
   * Reset all validation checks to pending
   */
  async resetValidations(taskId: string): Promise<{ data: ListValidationsResponse }> {
    return this.request<{ data: ListValidationsResponse }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/validations/reset`
    );
  }

  // ===========================================================================
  // Summary Methods
  // ===========================================================================

  /**
   * Get comprehensive progress summary for an epic.
   */
  async getProgressSummary(epicId: string): Promise<{ data: ProgressSummary }> {
    return this.request<{ data: ProgressSummary }>(
      "GET",
      `/api/v1/epics/${encodeURIComponent(epicId)}/progress-summary`
    );
  }

  /**
   * Get work items assigned to the current user.
   */
  async getMyWork(): Promise<{ data: MyWorkResponse }> {
    return this.request<{ data: MyWorkResponse }>(
      "GET",
      `/api/v1/me/work`
    );
  }

  /**
   * Get all blocked items across accessible epics.
   */
  async getBlockedSummary(): Promise<{ data: BlockedSummaryResponse }> {
    return this.request<{ data: BlockedSummaryResponse }>(
      "GET",
      `/api/v1/me/blocked`
    );
  }

  // ===========================================================================
  // Decision Methods
  // ===========================================================================

  /**
   * Create a new decision record.
   */
  async createDecision(input: CreateDecisionInput): Promise<{ data: Decision }> {
    return this.request<{ data: Decision }>("POST", "/api/v1/decisions", input);
  }

  /**
   * Get a decision by ID.
   */
  async getDecision(id: string): Promise<{ data: Decision }> {
    return this.request<{ data: Decision }>(
      "GET",
      `/api/v1/decisions/${encodeURIComponent(id)}`
    );
  }

  /**
   * List decisions with optional filters.
   */
  async listDecisions(params?: ListDecisionsParams): Promise<ListDecisionsResponse> {
    const query = this.buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
      epicId: params?.epicId,
      featureId: params?.featureId,
      taskId: params?.taskId,
      category: params?.category,
      impact: params?.impact,
      createdAt: params?.createdAt,
      createdBefore: params?.createdBefore,
    });
    return this.request<ListDecisionsResponse>("GET", `/api/v1/decisions${query}`);
  }

  /**
   * Search decisions by query string.
   */
  async searchDecisions(params: SearchDecisionsParams): Promise<ListDecisionsResponse> {
    const query = this.buildQueryString({
      query: params.query,
      epicId: params.epicId,
      cursor: params.cursor,
      limit: params.limit,
    });
    return this.request<ListDecisionsResponse>("GET", `/api/v1/decisions/search${query}`);
  }

  /**
   * Get decision context for a task.
   * Returns decisions for the task, its parent feature, and the epic.
   */
  async getTaskDecisionContext(taskId: string): Promise<{ data: TaskDecisionContextResponse }> {
    return this.request<{ data: TaskDecisionContextResponse }>(
      "GET",
      `/api/v1/decisions/context/task/${encodeURIComponent(taskId)}`
    );
  }

  /**
   * Get decision context for a feature.
   * Returns decisions for the feature and the epic.
   */
  async getFeatureDecisionContext(featureId: string): Promise<{ data: FeatureDecisionContextResponse }> {
    return this.request<{ data: FeatureDecisionContextResponse }>(
      "GET",
      `/api/v1/decisions/context/feature/${encodeURIComponent(featureId)}`
    );
  }

  // ---------------------------------------------------------------------------
  // Changelog Methods
  // ---------------------------------------------------------------------------

  /**
   * Get changelog for a specific entity.
   * Returns paginated history of field-level changes.
   */
  async getChangelog(params: GetChangelogParams): Promise<ChangelogResponse> {
    const query = this.buildQueryString({
      cursor: params.cursor,
      limit: params.limit,
      field: params.field,
      changedBy: params.changedBy,
      since: params.since,
      until: params.until,
    });
    return this.request<ChangelogResponse>(
      "GET",
      `/api/v1/changelog/${encodeURIComponent(params.entityType)}/${encodeURIComponent(params.entityId)}${query}`
    );
  }

  // ---------------------------------------------------------------------------
  // Epic Request Methods
  // ---------------------------------------------------------------------------

  /**
   * List epic requests with cursor-based pagination and optional filtering.
   * Returns requests with aggregated reaction counts.
   */
  async listEpicRequests(params?: ListEpicRequestsParams): Promise<ListEpicRequestsResponse> {
    const query = this.buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
      status: params?.status,
      requestedById: params?.requestedById,
    });
    return this.request<ListEpicRequestsResponse>("GET", `/api/v1/epic-requests${query}`);
  }

  /**
   * Get a single epic request by ID with reaction counts and user's own reaction.
   */
  async getEpicRequest(id: string): Promise<{ data: EpicRequestWithReactionCounts }> {
    return this.request<{ data: EpicRequestWithReactionCounts }>(
      "GET",
      `/api/v1/epic-requests/${encodeURIComponent(id)}`
    );
  }

  /**
   * Create a new epic request.
   */
  async createEpicRequest(input: CreateEpicRequestInput): Promise<{ data: EpicRequest }> {
    return this.request<{ data: EpicRequest }>("POST", "/api/v1/epic-requests", input);
  }

  /**
   * Update an existing epic request.
   * Only the creator can update (unless approved/converted status prevents edits).
   */
  async updateEpicRequest(id: string, input: UpdateEpicRequestInput): Promise<{ data: EpicRequest }> {
    return this.request<{ data: EpicRequest }>(
      "PUT",
      `/api/v1/epic-requests/${encodeURIComponent(id)}`,
      input
    );
  }

  /**
   * Delete an epic request.
   * Only the creator or global admin can delete.
   */
  async deleteEpicRequest(id: string): Promise<void> {
    await this.request<undefined>("DELETE", `/api/v1/epic-requests/${encodeURIComponent(id)}`);
  }

  /**
   * Add or update (upsert) a reaction on an epic request.
   * Replaces any existing reaction from the same user.
   */
  async addEpicRequestReaction(id: string, input: AddReactionInput): Promise<{ message: string; data: { reactionType: string } }> {
    return this.request<{ message: string; data: { reactionType: string } }>(
      "POST",
      `/api/v1/epic-requests/${encodeURIComponent(id)}/reactions`,
      input
    );
  }

  /**
   * Remove user's reaction from an epic request.
   */
  async removeEpicRequestReaction(id: string): Promise<void> {
    await this.request<undefined>("DELETE", `/api/v1/epic-requests/${encodeURIComponent(id)}/reactions`);
  }

  /**
   * List comments for an epic request with pagination.
   * Returns comments with author information.
   */
  async listEpicRequestComments(id: string, params?: ListCommentsParams): Promise<ListCommentsResponse> {
    const query = this.buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
    });
    return this.request<ListCommentsResponse>(
      "GET",
      `/api/v1/epic-requests/${encodeURIComponent(id)}/comments${query}`
    );
  }

  /**
   * Create a new comment on an epic request.
   * Current user is automatically set as the author.
   */
  async createEpicRequestComment(id: string, input: CreateCommentInput): Promise<{ data: EpicRequestComment }> {
    return this.request<{ data: EpicRequestComment }>(
      "POST",
      `/api/v1/epic-requests/${encodeURIComponent(id)}/comments`,
      input
    );
  }

  /**
   * Update an existing comment.
   * Only the comment author can update.
   */
  async updateEpicRequestComment(
    epicRequestId: string,
    commentId: string,
    input: UpdateCommentInput
  ): Promise<{ data: EpicRequestComment }> {
    return this.request<{ data: EpicRequestComment }>(
      "PUT",
      `/api/v1/epic-requests/${encodeURIComponent(epicRequestId)}/comments/${encodeURIComponent(commentId)}`,
      input
    );
  }

  /**
   * Delete a comment.
   * Only the comment author or global admin can delete.
   */
  async deleteEpicRequestComment(epicRequestId: string, commentId: string): Promise<void> {
    await this.request<undefined>(
      "DELETE",
      `/api/v1/epic-requests/${encodeURIComponent(epicRequestId)}/comments/${encodeURIComponent(commentId)}`
    );
  }

  // ===========================================================================
  // Personal Epic Requests
  // ===========================================================================

  /**
   * Create a new epic request in the user's personal scope.
   * Personal epic requests are auto-approved.
   */
  async createPersonalEpicRequest(input: CreateEpicRequestInput): Promise<{ data: EpicRequest }> {
    return this.request<{ data: EpicRequest }>("POST", "/api/v1/me/epic-requests", input);
  }

  /**
   * List epic requests in the user's personal scope.
   */
  async listPersonalEpicRequests(params?: ListEpicRequestsParams): Promise<ListEpicRequestsResponse> {
    const query = this.buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
      status: params?.status,
    });
    return this.request<ListEpicRequestsResponse>("GET", `/api/v1/me/epic-requests${query}`);
  }

  // ===========================================================================
  // Scope Transfers
  // ===========================================================================

  /**
   * Transfer an epic request between personal and team scope.
   */
  async transferEpicRequestScope(
    id: string,
    input: { direction: "personal-to-team" | "team-to-personal" }
  ): Promise<{ data: EpicRequest }> {
    return this.request<{ data: EpicRequest }>(
      "POST",
      `/api/v1/epic-requests/${encodeURIComponent(id)}/transfer`,
      input
    );
  }

  /**
   * Transfer an epic between personal and team scope.
   */
  async transferEpicScope(
    id: string,
    input: { direction: "personal-to-team" | "team-to-personal"; teamId?: string }
  ): Promise<{ data: unknown }> {
    return this.request<{ data: unknown }>(
      "POST",
      `/api/v1/epics/${encodeURIComponent(id)}/transfer`,
      input
    );
  }

  // ===========================================================================
  // Skill Packs
  // ===========================================================================

  /**
   * List skill packs with pagination and filtering
   */
  async listSkillPacks(params?: ListSkillPacksParams): Promise<ListSkillPacksResponse> {
    const query = this.buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
      isOfficial: params?.isOfficial,
      query: params?.query,
    });
    return this.request<ListSkillPacksResponse>("GET", `/api/v1/skill-packs${query}`);
  }

  /**
   * Get a single skill pack by ID or name
   */
  async getSkillPack(idOrName: string): Promise<{ data: SkillPack }> {
    return this.request<{ data: SkillPack }>(
      "GET",
      `/api/v1/skill-packs/${encodeURIComponent(idOrName)}`
    );
  }

  /**
   * Get a skill pack with all its versions
   */
  async getSkillPackWithVersions(idOrName: string): Promise<{ data: SkillPackWithVersions }> {
    return this.request<{ data: SkillPackWithVersions }>(
      "GET",
      `/api/v1/skill-packs/${encodeURIComponent(idOrName)}/versions`
    );
  }

  /**
   * Get a specific version of a skill pack
   */
  async getSkillPackVersion(
    idOrName: string,
    version: string
  ): Promise<{ data: SkillPackVersion }> {
    return this.request<{ data: SkillPackVersion }>(
      "GET",
      `/api/v1/skill-packs/${encodeURIComponent(idOrName)}/versions/${encodeURIComponent(version)}`
    );
  }

  /**
   * Get the latest stable version of a skill pack
   */
  async getLatestSkillPackVersion(idOrName: string): Promise<{ data: SkillPackVersion }> {
    return this.request<{ data: SkillPackVersion }>(
      "GET",
      `/api/v1/skill-packs/${encodeURIComponent(idOrName)}/latest`
    );
  }

  /**
   * List all installed skill packs
   */
  async listInstalledSkillPacks(): Promise<{ data: InstalledSkillPack[] }> {
    return this.request<{ data: InstalledSkillPack[] }>("GET", "/api/v1/skill-packs/installed");
  }

  /**
   * Install a skill pack
   */
  async installSkillPack(
    idOrName: string,
    input: InstallSkillPackInput
  ): Promise<{ data: InstalledSkillPack }> {
    return this.request<{ data: InstalledSkillPack }>(
      "POST",
      `/api/v1/skill-packs/${encodeURIComponent(idOrName)}/install`,
      input
    );
  }

  /**
   * Uninstall a skill pack
   */
  async uninstallSkillPack(idOrName: string): Promise<void> {
    await this.request<undefined>(
      "DELETE",
      `/api/v1/skill-packs/${encodeURIComponent(idOrName)}/install`
    );
  }

  /**
   * Enable or disable an installed skill pack
   */
  async setSkillPackEnabled(
    idOrName: string,
    isEnabled: boolean
  ): Promise<{ data: InstalledSkillPack }> {
    return this.request<{ data: InstalledSkillPack }>(
      "PATCH",
      `/api/v1/skill-packs/${encodeURIComponent(idOrName)}/enabled`,
      { isEnabled }
    );
  }

  // ---------------------------------------------------------------------------
  // Laws
  // ---------------------------------------------------------------------------

  async listLaws(params?: {
    severity?: string;
    appliesTo?: string;
    isActive?: boolean;
    namespace?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ data: Law[]; meta: { cursor: string | null; hasMore: boolean } }> {
    const query = this.buildQueryString({
      severity: params?.severity,
      appliesTo: params?.appliesTo,
      isActive: params?.isActive,
      namespace: params?.namespace,
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.request<{ data: Law[]; meta: { cursor: string | null; hasMore: boolean } }>(
      "GET",
      `/api/v1/laws${query}`
    );
  }

  async getLaw(idOrCode: string): Promise<{ data: Law }> {
    return this.request<{ data: Law }>(
      "GET",
      `/api/v1/laws/${encodeURIComponent(idOrCode)}`
    );
  }

  async createLaw(input: {
    lawCode: string;
    title: string;
    description: string;
    severity: string;
    auditLogic: string;
    consequence: string;
    appliesTo: string;
    namespace?: string;
  }): Promise<{ data: Law }> {
    return this.request<{ data: Law }>("POST", "/api/v1/laws", input);
  }

  async updateLaw(
    idOrCode: string,
    input: Record<string, unknown>
  ): Promise<{ data: Law }> {
    return this.request<{ data: Law }>(
      "PUT",
      `/api/v1/laws/${encodeURIComponent(idOrCode)}`,
      input
    );
  }

  // ---------------------------------------------------------------------------
  // Cases
  // ---------------------------------------------------------------------------

  async listCases(params?: {
    status?: string;
    accusedAgent?: string;
    severity?: string;
    lawId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ data: Case[]; meta: { cursor: string | null; hasMore: boolean } }> {
    const query = this.buildQueryString({
      status: params?.status,
      accusedAgent: params?.accusedAgent,
      severity: params?.severity,
      lawId: params?.lawId,
      limit: params?.limit,
      cursor: params?.cursor,
    });
    return this.request<{ data: Case[]; meta: { cursor: string | null; hasMore: boolean } }>(
      "GET",
      `/api/v1/cases${query}`
    );
  }

  async getCase(id: string): Promise<{ data: Case }> {
    return this.request<{ data: Case }>(
      "GET",
      `/api/v1/cases/${encodeURIComponent(id)}`
    );
  }

  async fileCase(input: {
    accusedAgent: string;
    lawId: string;
    evidence: Array<{ type: string; reference: string; description: string }>;
    severity: string;
    filedBy?: string | undefined;
  }): Promise<{ data: Case }> {
    return this.request<{ data: Case }>("POST", "/api/v1/cases", input);
  }

  async startHearing(id: string): Promise<{ data: Case }> {
    return this.request<{ data: Case }>(
      "PUT",
      `/api/v1/cases/${encodeURIComponent(id)}/hearing`
    );
  }

  async issueVerdict(
    id: string,
    input: { verdict: string; verdictReason: string; deductionLevel: string }
  ): Promise<{ data: Case }> {
    return this.request<{ data: Case }>(
      "PUT",
      `/api/v1/cases/${encodeURIComponent(id)}/verdict`,
      input
    );
  }

  async markCaseCorrected(id: string): Promise<{ data: Case }> {
    return this.request<{ data: Case }>(
      "PUT",
      `/api/v1/cases/${encodeURIComponent(id)}/correct`
    );
  }

  async dismissCase(id: string, reason: string): Promise<{ data: Case }> {
    return this.request<{ data: Case }>(
      "PUT",
      `/api/v1/cases/${encodeURIComponent(id)}/dismiss`,
      { reason }
    );
  }

  // ---------------------------------------------------------------------------
  // Agent Scores
  // ---------------------------------------------------------------------------

  async listAgentScores(): Promise<{ data: Array<AgentScore & { rank: number }> }> {
    return this.request<{ data: Array<AgentScore & { rank: number }> }>(
      "GET",
      "/api/v1/agent-scores"
    );
  }

  async getAgentScore(agentName: string): Promise<{ data: AgentScore }> {
    return this.request<{ data: AgentScore }>(
      "GET",
      `/api/v1/agent-scores/${encodeURIComponent(agentName)}`
    );
  }

  async adjustAgentScore(
    agentName: string,
    input: { delta: number; reason: string }
  ): Promise<{ data: AgentScore }> {
    return this.request<{ data: AgentScore }>(
      "PUT",
      `/api/v1/agent-scores/${encodeURIComponent(agentName)}/adjust`,
      input
    );
  }

  // ---------------------------------------------------------------------------
  // Pattern Registry (ENG-65)
  // ---------------------------------------------------------------------------

  async listPatterns(params?: {
    epicId?: string;
    category?: string;
    global?: boolean;
  }): Promise<{ data: PatternResponse[] }> {
    const query = this.buildQueryString({
      epicId: params?.epicId,
      category: params?.category,
      global: params?.global ? "true" : undefined,
    });
    return this.request<{ data: PatternResponse[] }>("GET", `/api/v1/patterns${query}`);
  }

  async getPattern(id: string): Promise<{ data: PatternResponse }> {
    return this.request<{ data: PatternResponse }>(
      "GET",
      `/api/v1/patterns/${encodeURIComponent(id)}`
    );
  }

  async createPattern(input: {
    name: string;
    category: string;
    description: string;
    examples?: string[];
    epicId?: string | null;
    source?: string;
    confidence?: number;
  }): Promise<{ data: PatternResponse }> {
    return this.request<{ data: PatternResponse }>("POST", "/api/v1/patterns", input);
  }

  async updatePattern(id: string, input: {
    name?: string;
    category?: string;
    description?: string;
    examples?: string[];
    epicId?: string | null;
    source?: string;
    confidence?: number;
  }): Promise<{ data: PatternResponse }> {
    return this.request<{ data: PatternResponse }>(
      "PATCH",
      `/api/v1/patterns/${encodeURIComponent(id)}`,
      input
    );
  }

  async deletePattern(id: string): Promise<void> {
    await this.request<void>("DELETE", `/api/v1/patterns/${encodeURIComponent(id)}`);
  }

  // ---------------------------------------------------------------------------
  // Briefings (ENG-66)
  // ---------------------------------------------------------------------------

  async getBriefing(epicId: string): Promise<{ data: BriefingResponse }> {
    return this.request<{ data: BriefingResponse }>(
      "GET",
      `/api/v1/epics/${encodeURIComponent(epicId)}/briefing`
    );
  }
}
