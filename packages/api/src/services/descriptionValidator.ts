/**
 * Description Validator Service
 *
 * Enforces quality standards for epic descriptions and epic request
 * structuredDesc fields at the API layer.
 *
 * All functions are pure (stateless, no DB calls) and can be called from
 * any route handler before persisting data.
 */

import type { ValidationResult, ValidationViolation } from "../types/validation.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum word count for a valid epic description */
export const EPIC_DESCRIPTION_MIN_WORDS = 500;

/** Minimum word count for epic request structuredDesc text fields */
export const EPIC_REQUEST_FIELD_MIN_WORDS = 50;

/**
 * Required section keywords that must appear as heading-formatted lines.
 * Detection is case-insensitive and checks for the keyword anywhere in a
 * heading line (## Heading, ### Heading, **Bold**, etc.).
 */
export const REQUIRED_SECTION_KEYWORDS = [
  "overview",
  "problem",
  "approach",
  "success",
] as const;

/** Human-readable names for the required sections (parallel to REQUIRED_SECTION_KEYWORDS) */
const REQUIRED_SECTION_LABELS: Record<string, string> = {
  overview: "Overview",
  problem: "Problem Statement",
  approach: "Proposed Approach",
  success: "Success Criteria",
};

// ---------------------------------------------------------------------------
// Word count
// ---------------------------------------------------------------------------

/**
 * Count words in a string.  Splits on whitespace; empty / whitespace-only
 * strings return 0.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Section header detection
// ---------------------------------------------------------------------------

/**
 * Returns the set of required section keywords that are missing from the text.
 *
 * A section is considered "present" when:
 * - A line matches a heading pattern (## …, ### …, **…**, or `# …`)
 * - AND the keyword appears somewhere in that line (case-insensitive)
 *
 * Liberal matching: "Problem Statement", "## Problem", "**Problem**" all match "problem".
 */
export function findMissingSections(text: string): string[] {
  const lines = text.split(/\r?\n/);

  // Precompute which keywords appear on heading lines
  const found = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Match any common heading pattern:
    //   Markdown ATX:  ## Heading  /  # Heading
    //   Markdown bold: **Heading**
    //   Setext (line of ===):  handled implicitly (the text line before it is plain)
    const isHeading =
      /^#{1,6}\s/.test(trimmed) ||
      /^\*{1,2}[^*]/.test(trimmed) ||
      /^_{1,2}[^_]/.test(trimmed);

    if (!isHeading) continue;

    const lower = trimmed.toLowerCase();
    for (const keyword of REQUIRED_SECTION_KEYWORDS) {
      if (lower.includes(keyword)) {
        found.add(keyword);
      }
    }
  }

  return REQUIRED_SECTION_KEYWORDS.filter((k) => !found.has(k));
}

// ---------------------------------------------------------------------------
// Epic description validator
// ---------------------------------------------------------------------------

/**
 * Validate an epic description string.
 *
 * Checks:
 * 1. Word count >= 500
 * 2. All four required section headers are present
 *
 * Returns a ValidationResult with `valid: true` when all checks pass,
 * or `valid: false` with a non-empty `violations` array.
 */
export function validateEpicDescription(description: string): ValidationResult {
  const violations: ValidationViolation[] = [];

  // --- Check 1: word count ---
  const wordCount = countWords(description);
  if (wordCount < EPIC_DESCRIPTION_MIN_WORDS) {
    violations.push({
      check: "word_count",
      expected: `>= ${EPIC_DESCRIPTION_MIN_WORDS} words`,
      actual: `${wordCount} words`,
      message: `Epic description must be at least ${EPIC_DESCRIPTION_MIN_WORDS} words. Current count: ${wordCount}.`,
    });
  }

  // --- Check 2: required section headers ---
  const missing = findMissingSections(description);
  for (const keyword of missing) {
    const label = REQUIRED_SECTION_LABELS[keyword] ?? keyword;
    violations.push({
      check: "section_missing",
      expected: `Section header containing "${label}"`,
      actual: "not found",
      message: `Required section is missing: "${label}". Add a heading (e.g., "## ${label}") to the description.`,
    });
  }

  return { valid: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Epic request structuredDesc validator
// ---------------------------------------------------------------------------

/**
 * Shape of the structuredDesc object accepted by POST /api/v1/epic-requests.
 * Only the fields we validate are required here; others are optional.
 */
interface StructuredDescInput {
  problemStatement?: string | null;
  proposedSolution?: string | null;
  successMetrics?: string | null;
  [key: string]: unknown;
}

/**
 * Validate the structuredDesc object on an epic request.
 *
 * Checks:
 * 1. problemStatement is present and >= 50 words
 * 2. proposedSolution is present and >= 50 words
 * 3. successMetrics is present and non-empty
 *
 * Returns a ValidationResult.
 */
export function validateEpicRequestStructuredDesc(
  structuredDesc: StructuredDescInput | null | undefined
): ValidationResult {
  const violations: ValidationViolation[] = [];

  if (!structuredDesc) {
    violations.push({
      check: "structured_desc_missing",
      expected: "structuredDesc object with problemStatement, proposedSolution, and successMetrics",
      actual: "null or missing",
      message: "structuredDesc is required and must include problemStatement, proposedSolution, and successMetrics.",
    });
    return { valid: false, violations };
  }

  // --- problemStatement ---
  const psWords = countWords(structuredDesc.problemStatement ?? "");
  if (psWords < EPIC_REQUEST_FIELD_MIN_WORDS) {
    violations.push({
      check: "problem_statement_word_count",
      expected: `>= ${EPIC_REQUEST_FIELD_MIN_WORDS} words`,
      actual: `${psWords} words`,
      message: `structuredDesc.problemStatement must be at least ${EPIC_REQUEST_FIELD_MIN_WORDS} words. Current count: ${psWords}.`,
    });
  }

  // --- proposedSolution ---
  const psolutionWords = countWords(structuredDesc.proposedSolution ?? "");
  if (psolutionWords < EPIC_REQUEST_FIELD_MIN_WORDS) {
    violations.push({
      check: "proposed_solution_word_count",
      expected: `>= ${EPIC_REQUEST_FIELD_MIN_WORDS} words`,
      actual: `${psolutionWords} words`,
      message: `structuredDesc.proposedSolution must be at least ${EPIC_REQUEST_FIELD_MIN_WORDS} words. Current count: ${psolutionWords}.`,
    });
  }

  // --- successMetrics ---
  const successMetricsTrimmed = (structuredDesc.successMetrics ?? "").trim();
  if (!successMetricsTrimmed) {
    violations.push({
      check: "success_metrics_empty",
      expected: "non-empty string",
      actual: "empty or missing",
      message: "structuredDesc.successMetrics must be a non-empty string.",
    });
  }

  return { valid: violations.length === 0, violations };
}
