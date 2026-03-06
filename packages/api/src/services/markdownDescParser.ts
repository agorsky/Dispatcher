/**
 * Markdown Description Parser
 *
 * Parses markdown task/feature descriptions into structuredDesc fields.
 * Used by pre-flight auto-backfill to populate structuredDesc from
 * legacy descriptions that contain AI instructions, acceptance criteria, etc.
 */

export interface ParsedStructuredDesc {
  summary: string;
  aiInstructions?: string;
  acceptanceCriteria?: string[];
  filesInvolved?: string[];
  riskLevel?: "low" | "medium" | "high";
  estimatedEffort?: "trivial" | "small" | "medium" | "large" | "xl";
}

/**
 * Parse a markdown description into a structured description object.
 * Uses conservative extraction - only extracts fields it can confidently identify.
 */
export function parseMarkdownToStructuredDesc(markdown: string): ParsedStructuredDesc | null {
  if (!markdown || markdown.trim().length === 0) return null;

  const sections = splitBySections(markdown);
  const result: ParsedStructuredDesc = {
    summary: extractSummary(markdown, sections),
  };

  // Extract AI Instructions
  const aiSection = findSection(sections, [
    "ai instructions",
    "ai agent instructions",
    "implementation instructions",
    "instructions",
  ]);
  if (aiSection) {
    result.aiInstructions = aiSection.trim();
  }

  // Extract acceptance criteria
  const acSection = findSection(sections, [
    "acceptance criteria",
    "criteria",
    "definition of done",
    "done criteria",
  ]);
  if (acSection) {
    result.acceptanceCriteria = extractBulletList(acSection);
  }

  // Extract files involved
  const filesSection = findSection(sections, [
    "files involved",
    "files",
    "affected files",
    "related files",
  ]);
  if (filesSection) {
    result.filesInvolved = extractFilePaths(filesSection);
  }

  // Extract risk level
  const riskMatch = markdown.match(/\*\*Risk Level:\*\*\s*(low|medium|high)/i)
    ?? markdown.match(/Risk Level:\s*(low|medium|high)/i);
  if (riskMatch?.[1]) {
    result.riskLevel = riskMatch[1].toLowerCase() as "low" | "medium" | "high";
  }

  // Extract estimated effort
  const effortMatch = markdown.match(/\*\*Estimated Effort:\*\*\s*(trivial|small|medium|large|xl)/i)
    ?? markdown.match(/Estimated Effort:\s*(trivial|small|medium|large|xl)/i);
  if (effortMatch?.[1]) {
    result.estimatedEffort = effortMatch[1].toLowerCase() as "trivial" | "small" | "medium" | "large" | "xl";
  }

  // Only return if we extracted at least aiInstructions or acceptanceCriteria
  if (!result.aiInstructions && (!result.acceptanceCriteria || result.acceptanceCriteria.length === 0)) {
    return null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface Section {
  heading: string;
  content: string;
}

function splitBySections(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split("\n");
  let currentHeading = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch?.[1]) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join("\n").trim(),
        });
      }
      currentHeading = headingMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Push last section
  if (currentHeading || currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join("\n").trim(),
    });
  }

  return sections;
}

function findSection(sections: Section[], headings: string[]): string | undefined {
  const normalizedHeadings = headings.map((h) => h.toLowerCase());
  for (const section of sections) {
    const normalized = section.heading.toLowerCase();
    if (normalizedHeadings.some((h) => normalized.includes(h))) {
      return section.content;
    }
  }
  return undefined;
}

function extractSummary(markdown: string, sections: Section[]): string {
  // Use first section content if it's before any heading, or first line
  const first = sections[0];
  if (first && !first.heading) {
    const content = first.content.trim();
    if (content) return content.slice(0, 5000);
  }
  // Fall back to first non-empty line
  const firstLine = markdown.split("\n").find((l) => l.trim() && !l.startsWith("#"));
  return firstLine?.trim().slice(0, 5000) ?? markdown.slice(0, 200).trim();
}

function extractBulletList(content: string): string[] {
  const items: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    // Match: - [ ] criterion, - [x] criterion, - criterion, * criterion, numbered lists
    const match = line.match(/^\s*(?:[-*]|\d+\.)\s*(?:\[[ x]\]\s*)?(.+)$/i);
    if (match?.[1]) {
      const item = match[1].trim();
      if (item.length > 0) {
        items.push(item);
      }
    }
  }
  return items;
}

function extractFilePaths(content: string): string[] {
  const paths: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    // Match file paths in backticks or as bullet items
    const backtickMatches = line.match(/`([^`]+\.[a-zA-Z]+)`/g);
    if (backtickMatches) {
      for (const m of backtickMatches) {
        paths.push(m.replace(/`/g, "").trim());
      }
    } else {
      // Match bare bullet items that look like file paths
      const bulletMatch = line.match(/^\s*[-*]\s+(.+\.[a-zA-Z]{1,10})$/);
      if (bulletMatch?.[1]) {
        paths.push(bulletMatch[1].trim());
      }
    }
  }
  return paths;
}
