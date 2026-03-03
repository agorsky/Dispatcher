/**
 * MCP Tools for Plan Requirements
 *
 * Fetches Epic Request structured description fields for requirement
 * traceability and provides traceability reports mapping requirements
 * to features and tasks.
 *
 * Tools:
 * - spectree__get_epic_requirements — Fetch Epic Request fields with optional traceability
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiClient } from "../api-client.js";
import { createResponse, createErrorResponse } from "./utils.js";

export function registerPlanRequirementTools(server: McpServer): void {
  // ==========================================================================
  // spectree__get_epic_requirements
  // ==========================================================================
  server.registerTool(
    "spectree__get_epic_requirements",
    {
      description:
        "Fetch Epic Request structured description fields for requirement traceability. " +
        "Returns the original requirements that drove this epic, useful for verifying " +
        "that the implementation plan covers all stated requirements.\n\n" +
        "**Returns:**\n" +
        "- Raw description markdown alongside structured fields\n" +
        "- problemStatement, proposedSolution, impactAssessment, successMetrics, alternatives\n" +
        "- When epicId provided: traceability report mapping requirements to features/tasks\n\n" +
        "**Use in planner Stage 4 to:**\n" +
        "1. Verify all stated requirements have corresponding features\n" +
        "2. Check that success metrics are covered by acceptance criteria\n" +
        "3. Confirm scope is aligned with the original request\n\n" +
        "Handles missing epic request gracefully with descriptive error.",
      inputSchema: {
        epicRequestId: z
          .string()
          .uuid()
          .describe("UUID of the Epic Request to fetch requirements from"),
        epicId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional: UUID of the current epic being planned. When provided, produces " +
            "a traceability report mapping Epic Request requirements to the epic's features and tasks."
          ),
      },
    },
    async (input) => {
      try {
        const apiClient = getApiClient();

        // Fetch the epic request
        const epicRequestResult = await apiClient.getEpicRequest(input.epicRequestId);
        const epicRequest = epicRequestResult.data;

        const requirementsData: Record<string, unknown> = {
          epicRequestId: epicRequest.id,
          title: epicRequest.title,
          status: epicRequest.status,
          description: epicRequest.description,
          structuredFields: epicRequest.structuredDesc
            ? {
                problemStatement: epicRequest.structuredDesc.problemStatement,
                proposedSolution: epicRequest.structuredDesc.proposedSolution,
                impactAssessment: epicRequest.structuredDesc.impactAssessment,
                targetAudience: epicRequest.structuredDesc.targetAudience ?? null,
                successMetrics: epicRequest.structuredDesc.successMetrics ?? null,
                alternatives: epicRequest.structuredDesc.alternatives ?? null,
                dependencies: epicRequest.structuredDesc.dependencies ?? null,
                estimatedEffort: epicRequest.structuredDesc.estimatedEffort ?? null,
              }
            : null,
        };

        // If epicId provided, build traceability report
        if (input.epicId) {
          const traceability = await buildTraceabilityReport(
            apiClient,
            input.epicId,
            epicRequest
          );
          requirementsData.traceabilityReport = traceability;
        }

        return createResponse(requirementsData);
      } catch (error) {
        return createErrorResponse(error);
      }
    }
  );
}

// =============================================================================
// Traceability Helper
// =============================================================================

interface EpicRequestData {
  structuredDesc?: {
    problemStatement?: string;
    proposedSolution?: string;
    successMetrics?: string;
  } | null;
}

async function buildTraceabilityReport(
  apiClient: ReturnType<typeof getApiClient>,
  epicId: string,
  epicRequest: EpicRequestData
): Promise<unknown> {
  // Fetch features for the epic
  const featuresResult = await apiClient.listFeatures({ epicId, limit: 100 });
  const features = featuresResult.data;

  const featureSummaries = features.map((f) => ({
    id: f.id,
    identifier: f.identifier,
    title: f.title,
    taskCount: f._count?.tasks ?? 0,
  }));

  // Extract key requirement phrases for traceability
  const sd = epicRequest.structuredDesc;
  const requirementTopics: string[] = [];

  if (sd?.problemStatement) {
    requirementTopics.push(`Problem: ${sd.problemStatement.slice(0, 100)}...`);
  }
  if (sd?.proposedSolution) {
    requirementTopics.push(`Solution: ${sd.proposedSolution.slice(0, 100)}...`);
  }
  if (sd?.successMetrics) {
    requirementTopics.push(`Success: ${sd.successMetrics.slice(0, 100)}...`);
  }

  return {
    epicId,
    featureCount: features.length,
    features: featureSummaries,
    requirementTopics,
    coverageNote:
      features.length === 0
        ? "⚠️ No features found — epic plan may not cover any requirements yet"
        : `✅ Epic has ${String(features.length)} feature(s) addressing the requirements`,
    recommendation:
      "Verify that each requirement topic from the Epic Request has at least one corresponding feature. " +
      "Check that success metrics from the Epic Request appear in task acceptance criteria.",
  };
}
