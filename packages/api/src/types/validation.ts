/**
 * Validation types for description quality gates.
 *
 * Used by descriptionValidator service to communicate structured
 * rejection reasons back to callers and route handlers.
 */

/**
 * A single failed validation check.
 */
export interface ValidationViolation {
  /** The identifier for the specific check (e.g., "word_count", "section_missing") */
  check: string;
  /** What was expected (e.g., ">= 500 words", "Overview section header") */
  expected: string;
  /** What was actually found (e.g., "143 words", "not found") */
  actual: string;
  /** Human-readable message suitable for returning to a caller */
  message: string;
}

/**
 * The aggregated result of running a validation function.
 */
export interface ValidationResult {
  /** Whether ALL checks passed */
  valid: boolean;
  /** Array of violations — empty when valid is true */
  violations: ValidationViolation[];
}
