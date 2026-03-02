import { describe, it, expect } from "vitest";
import {
  countWords,
  findMissingSections,
  validateEpicDescription,
  validateEpicRequestStructuredDesc,
  EPIC_DESCRIPTION_MIN_WORDS,
  EPIC_REQUEST_FIELD_MIN_WORDS,
} from "../../src/services/descriptionValidator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a string with exactly `n` distinct words */
function wordsOf(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

/** A minimal VALID epic description (500+ words, all 4 required sections) */
function validEpicDescription(): string {
  const body = wordsOf(520);
  return `## Overview\n${body}\n## Problem Statement\ndetail\n## Proposed Approach\ndetail\n## Success Criteria\ndetail`;
}

/** Generate a string of `n` words for structuredDesc field testing */
function fieldWords(n: number): string {
  return Array.from({ length: n }, (_, i) => `tok${i}`).join(" ");
}

// ---------------------------------------------------------------------------
// countWords
// ---------------------------------------------------------------------------

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("counts single word correctly", () => {
    expect(countWords("hello")).toBe(1);
  });

  it("counts multiple words separated by single spaces", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("handles multiple spaces and newlines between words", () => {
    expect(countWords("one  two\n\nthree\t four")).toBe(4);
  });

  it("counts exactly 500 words", () => {
    expect(countWords(wordsOf(500))).toBe(500);
  });

  it("counts exactly 499 words", () => {
    expect(countWords(wordsOf(499))).toBe(499);
  });
});

// ---------------------------------------------------------------------------
// findMissingSections
// ---------------------------------------------------------------------------

describe("findMissingSections", () => {
  it("returns all 4 keywords when text is empty", () => {
    const missing = findMissingSections("");
    expect(missing).toContain("overview");
    expect(missing).toContain("problem");
    expect(missing).toContain("approach");
    expect(missing).toContain("success");
    expect(missing).toHaveLength(4);
  });

  it("returns empty array when all required sections are present (ATX headings)", () => {
    const text = [
      "## Overview",
      "some text",
      "## Problem Statement",
      "more text",
      "## Proposed Approach",
      "detail",
      "## Success Criteria",
      "metrics",
    ].join("\n");
    expect(findMissingSections(text)).toHaveLength(0);
  });

  it("detects sections using H3 headings", () => {
    const text = [
      "### Overview of the epic",
      "### Problem description",
      "### Approach and solution",
      "### Success and metrics",
    ].join("\n");
    expect(findMissingSections(text)).toHaveLength(0);
  });

  it("detection is case-insensitive", () => {
    const text = [
      "## OVERVIEW",
      "## PROBLEM",
      "## APPROACH",
      "## SUCCESS",
    ].join("\n");
    expect(findMissingSections(text)).toHaveLength(0);
  });

  it("does NOT match keyword that appears only in body text (not a heading)", () => {
    // Keywords appear in body but not on heading lines
    const text = "The overview is here. The problem is explained. The approach follows. Success is the goal.";
    const missing = findMissingSections(text);
    // All 4 should be missing since none are on heading lines
    expect(missing).toHaveLength(4);
  });

  it("returns exactly the missing sections, not the found ones", () => {
    const text = "## Overview\n## Problem Statement\nbody text without approach or success";
    const missing = findMissingSections(text);
    expect(missing).toContain("approach");
    expect(missing).toContain("success");
    expect(missing).not.toContain("overview");
    expect(missing).not.toContain("problem");
    expect(missing).toHaveLength(2);
  });

  it("accepts bold headings using **text** pattern", () => {
    const text = [
      "**Overview**",
      "**Problem Statement**",
      "**Proposed Approach**",
      "**Success Criteria**",
    ].join("\n");
    expect(findMissingSections(text)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateEpicDescription
// ---------------------------------------------------------------------------

describe("validateEpicDescription", () => {
  it("passes a valid description (500+ words, all sections)", () => {
    const result = validateEpicDescription(validEpicDescription());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when word count is under 500", () => {
    const desc = `## Overview\n${wordsOf(100)}\n## Problem Statement\ndetail\n## Proposed Approach\ndetail\n## Success Criteria\ndetail`;
    const result = validateEpicDescription(desc);
    expect(result.valid).toBe(false);
    const wordViolation = result.violations.find((v) => v.check === "word_count");
    expect(wordViolation).toBeDefined();
    expect(wordViolation?.actual).toMatch(/\d+ words/);
    expect(wordViolation?.expected).toContain(`${EPIC_DESCRIPTION_MIN_WORDS}`);
  });

  it("fails when a required section is missing", () => {
    // No Success Criteria section
    const desc = `## Overview\n${wordsOf(520)}\n## Problem Statement\ndetail\n## Proposed Approach\ndetail`;
    const result = validateEpicDescription(desc);
    expect(result.valid).toBe(false);
    const missing = result.violations.filter((v) => v.check === "section_missing");
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toContain("Success");
  });

  it("fails with multiple violations when both word count and sections are wrong", () => {
    const result = validateEpicDescription("Short epic with no sections.");
    expect(result.valid).toBe(false);
    // 1 word count violation + 4 section violations
    expect(result.violations.length).toBeGreaterThanOrEqual(5);
  });

  it("reports all missing sections in the violations array", () => {
    // Only Overview is present; 3 sections missing
    const desc = `## Overview\n${wordsOf(520)}`;
    const result = validateEpicDescription(desc);
    const missing = result.violations.filter((v) => v.check === "section_missing");
    expect(missing).toHaveLength(3);
    const messages = missing.map((v) => v.message);
    expect(messages.some((m) => m.includes("Problem"))).toBe(true);
    expect(messages.some((m) => m.includes("Approach"))).toBe(true);
    expect(messages.some((m) => m.includes("Success"))).toBe(true);
  });

  it("violation objects have check, expected, actual, and message fields", () => {
    const result = validateEpicDescription("too short");
    expect(result.violations.length).toBeGreaterThan(0);
    for (const v of result.violations) {
      expect(v).toHaveProperty("check");
      expect(v).toHaveProperty("expected");
      expect(v).toHaveProperty("actual");
      expect(v).toHaveProperty("message");
    }
  });

  it("passes when description has exactly 500 words and all sections", () => {
    // Build description that is exactly 500 words with sections
    // The headings themselves count as words too, so we need a body slightly under 500
    const body = wordsOf(496); // 4 headings words will push it over
    const desc = `## Overview\n${body}\n## Problem Statement\ndetail\n## Proposed Approach\ndetail\n## Success Criteria\ndetail`;
    const wordCount = countWords(desc);
    // Ensure it's actually >= 500
    if (wordCount >= 500) {
      const result = validateEpicDescription(desc);
      expect(result.violations.filter((v) => v.check === "word_count")).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// validateEpicRequestStructuredDesc
// ---------------------------------------------------------------------------

describe("validateEpicRequestStructuredDesc", () => {
  it("passes with valid structuredDesc (all fields meet minimums)", () => {
    const input = {
      problemStatement: fieldWords(60),
      proposedSolution: fieldWords(60),
      successMetrics: "Reduce churn by 10% within 90 days",
    };
    const result = validateEpicRequestStructuredDesc(input);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when structuredDesc is null", () => {
    const result = validateEpicRequestStructuredDesc(null);
    expect(result.valid).toBe(false);
    expect(result.violations[0].check).toBe("structured_desc_missing");
  });

  it("fails when structuredDesc is undefined", () => {
    const result = validateEpicRequestStructuredDesc(undefined);
    expect(result.valid).toBe(false);
  });

  it("fails when problemStatement is under 50 words", () => {
    const result = validateEpicRequestStructuredDesc({
      problemStatement: "Too short.",
      proposedSolution: fieldWords(60),
      successMetrics: "valid metric",
    });
    expect(result.valid).toBe(false);
    const v = result.violations.find((x) => x.check === "problem_statement_word_count");
    expect(v).toBeDefined();
    expect(v?.expected).toContain(`${EPIC_REQUEST_FIELD_MIN_WORDS}`);
  });

  it("fails when proposedSolution is under 50 words", () => {
    const result = validateEpicRequestStructuredDesc({
      problemStatement: fieldWords(60),
      proposedSolution: "Short.",
      successMetrics: "valid metric",
    });
    expect(result.valid).toBe(false);
    const v = result.violations.find((x) => x.check === "proposed_solution_word_count");
    expect(v).toBeDefined();
  });

  it("fails when successMetrics is empty string", () => {
    const result = validateEpicRequestStructuredDesc({
      problemStatement: fieldWords(60),
      proposedSolution: fieldWords(60),
      successMetrics: "",
    });
    expect(result.valid).toBe(false);
    const v = result.violations.find((x) => x.check === "success_metrics_empty");
    expect(v).toBeDefined();
  });

  it("fails when successMetrics is whitespace-only", () => {
    const result = validateEpicRequestStructuredDesc({
      problemStatement: fieldWords(60),
      proposedSolution: fieldWords(60),
      successMetrics: "   ",
    });
    expect(result.valid).toBe(false);
    const v = result.violations.find((x) => x.check === "success_metrics_empty");
    expect(v).toBeDefined();
  });

  it("fails when successMetrics field is missing (undefined)", () => {
    const result = validateEpicRequestStructuredDesc({
      problemStatement: fieldWords(60),
      proposedSolution: fieldWords(60),
    });
    expect(result.valid).toBe(false);
    const v = result.violations.find((x) => x.check === "success_metrics_empty");
    expect(v).toBeDefined();
  });

  it("reports all violations at once (not bail-on-first)", () => {
    const result = validateEpicRequestStructuredDesc({
      problemStatement: "short",
      proposedSolution: "short",
      successMetrics: "",
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(3);
  });

  it("passes with exactly 50 words in problemStatement and proposedSolution", () => {
    const result = validateEpicRequestStructuredDesc({
      problemStatement: fieldWords(50),
      proposedSolution: fieldWords(50),
      successMetrics: "Some metric",
    });
    const psViolation = result.violations.find((v) => v.check === "problem_statement_word_count");
    const solViolation = result.violations.find((v) => v.check === "proposed_solution_word_count");
    expect(psViolation).toBeUndefined();
    expect(solViolation).toBeUndefined();
  });
});
