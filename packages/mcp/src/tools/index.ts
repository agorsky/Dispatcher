/**
 * MCP Tool Registry
 *
 * Central registry for all SpecTree MCP tools.
 * Tools are organized by domain and registered with the MCP server.
 *
 * NOTE: Session and workflow tools were removed as part of the orchestrator
 * migration (2025-01). The orchestrator manages sessions and workflow
 * externally rather than through AI-driven MCP tools.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Import tool modules - these export their registrar functions
import { registerEpicTools } from "./epics.js";
import { registerEpicRequestTools } from "./epic-requests.js";
import { registerFeatureTools } from "./features.js";
import { registerTaskTools } from "./tasks.js";
import { registerStatusTools } from "./statuses.js";
import { registerOrderingTools } from "./ordering.js";
import { registerSearchTools } from "./search.js";
import { registerPersonalTools } from "./personal.js";
import { registerExecutionTools } from "./execution.js";
import { registerHelpTools } from "./help.js";
import { registerAiContextTools } from "./ai-context.js";
import { registerProgressTools } from "./progress.js";
import { registerTemplateTools } from "./templates.js";
import { registerStructuredDescTools } from "./structured-desc.js";
import { registerCodeContextTools } from "./code-context.js";
import { registerValidationTools } from "./validations.js";
import { registerSummaryTools } from "./summary.js";
import { registerDecisionTools } from "./decisions.js";
import { registerTeamTools } from "./teams.js";
import { registerCompositeTools } from "./composite.js";
import { registerCodebaseTools } from "./codebase.js";
import { registerPatternTools } from "./patterns.js";
import { registerEffortTools } from "./effort.js";
import { registerWorkflowTools } from "./workflow.js";
import { registerLawTools } from "./laws.js";
import { registerCaseTools } from "./cases.js";
import { registerAgentScoreTools } from "./agent-scores.js";
import { registerMemoryPatternTools } from "./memory-patterns.js";
import { registerPlanScoringTools } from "./plan-scoring.js";
import { registerPlanRequirementTools } from "./plan-requirements.js";

// Import changelog tools
import { registerChangelogTools } from "./changelog.js";
import { registerSessionTools } from "./sessions.js";

// Import skill pack tools
import { registerSkillPackTools } from "./skill-packs/manage.js";

// Tool registration function type
export type ToolRegistrar = (server: McpServer) => void;

// Registry of all tool registration functions
// Order matters: tools registered first appear first in MCP introspection
const toolRegistrars: ToolRegistrar[] = [
  registerHelpTools,         // Help and documentation tools
  registerCompositeTools,    // High-level composite operations (reduce tool call count)
  registerAiContextTools,    // AI context management
  registerChangelogTools,    // Changelog queries
  registerCodeContextTools,  // Code artifact tracking
  registerDecisionTools,     // Decision logging
  registerEpicTools,         // Epic management
  registerEpicRequestTools,  // Epic Request management (user proposals)
  registerExecutionTools,    // Execution planning
  registerFeatureTools,      // Feature management
  registerOrderingTools,     // Item reordering
  registerPersonalTools,     // Personal scope
  registerProgressTools,     // Progress tracking
  registerSearchTools,       // Search functionality
  registerStatusTools,       // Status management
  registerStructuredDescTools, // Structured descriptions
  registerSummaryTools,      // Summary and reporting
  registerTaskTools,         // Task management
  registerTeamTools,         // Team management
  registerTemplateTools,     // Templates
  registerSessionTools,      // AI session lifecycle
  registerValidationTools,   // Validation checks
  registerLawTools,          // Law registry
  registerCaseTools,         // Case management (court cases against agents)
  registerAgentScoreTools,   // Agent score leaderboard and adjustments
  registerCodebaseTools,     // Codebase analysis (scan structure, analyze file impact)
  registerPatternTools,      // Pattern detection & convention extraction
  registerEffortTools,       // Effort estimation engine
  registerWorkflowTools,     // Workflow guidance
  registerMemoryPatternTools, // Memory pattern registry (ENG-65)
  registerPlanScoringTools,  // Plan scoring & task completeness (ENG-E219)
  registerPlanRequirementTools, // Epic requirements traceability (ENG-E219)
  registerSkillPackTools,    // Skill pack management
];

/**
 * Register all tools with the MCP server.
 * Called once during server startup.
 */
export function registerAllTools(server: McpServer): void {
  for (const registrar of toolRegistrars) {
    registrar(server);
  }
}
