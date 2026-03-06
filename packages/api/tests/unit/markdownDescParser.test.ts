/**
 * Unit Tests: Markdown Description Parser (ENG-E1)
 *
 * Tests parseMarkdownToStructuredDesc() for extracting structuredDesc
 * fields from markdown task/feature descriptions.
 */

import { describe, it, expect } from "vitest";
import { parseMarkdownToStructuredDesc } from "../../src/services/markdownDescParser.js";

describe("parseMarkdownToStructuredDesc", () => {
  it("returns null for empty input", () => {
    expect(parseMarkdownToStructuredDesc("")).toBeNull();
    expect(parseMarkdownToStructuredDesc("  ")).toBeNull();
  });

  it("returns null when no AI instructions or acceptance criteria found", () => {
    const result = parseMarkdownToStructuredDesc("Just a plain text description with no sections.");
    expect(result).toBeNull();
  });

  it("extracts AI instructions from ## AI Instructions heading", () => {
    const md = `Some intro text

## AI Instructions
1. Open packages/mcp/src/tools/tasks.ts
2. Add structuredDesc parameter to create_task
3. Wire through api-client.ts
`;
    const result = parseMarkdownToStructuredDesc(md);
    expect(result).not.toBeNull();
    expect(result!.aiInstructions).toContain("Open packages/mcp/src/tools/tasks.ts");
    expect(result!.aiInstructions).toContain("Add structuredDesc parameter");
  });

  it("extracts acceptance criteria from checkbox list", () => {
    const md = `## AI Instructions
Do the thing.

## Acceptance Criteria
- [ ] spectree__create_task accepts optional structuredDesc parameter
- [ ] structuredDesc is persisted to database when provided
- [x] Backward compatibility maintained
`;
    const result = parseMarkdownToStructuredDesc(md);
    expect(result).not.toBeNull();
    expect(result!.acceptanceCriteria).toHaveLength(3);
    expect(result!.acceptanceCriteria![0]).toContain("spectree__create_task accepts optional structuredDesc");
    expect(result!.acceptanceCriteria![2]).toContain("Backward compatibility maintained");
  });

  it("extracts acceptance criteria from plain bullet list", () => {
    const md = `## AI Instructions
Do the thing.

## Acceptance Criteria
- First criterion
- Second criterion
`;
    const result = parseMarkdownToStructuredDesc(md);
    expect(result!.acceptanceCriteria).toHaveLength(2);
  });

  it("extracts files involved from backticked paths", () => {
    const md = `## AI Instructions
Step 1: modify file

## Files Involved
- \`packages/mcp/src/tools/tasks.ts\`
- \`packages/mcp/src/api-client.ts\`
`;
    const result = parseMarkdownToStructuredDesc(md);
    expect(result!.filesInvolved).toHaveLength(2);
    expect(result!.filesInvolved).toContain("packages/mcp/src/tools/tasks.ts");
    expect(result!.filesInvolved).toContain("packages/mcp/src/api-client.ts");
  });

  it("extracts risk level from bold format", () => {
    const md = `## AI Instructions
Do the thing.

**Risk Level:** medium | **Estimated Effort:** small
`;
    const result = parseMarkdownToStructuredDesc(md);
    expect(result!.riskLevel).toBe("medium");
    expect(result!.estimatedEffort).toBe("small");
  });

  it("generates summary from intro text before headings", () => {
    const md = `Add structuredDesc as an optional JSON parameter

## AI Instructions
1. Step 1
`;
    const result = parseMarkdownToStructuredDesc(md);
    expect(result!.summary).toContain("Add structuredDesc");
  });

  it("handles full typical task description", () => {
    const md = `Add the structuredDesc optional parameter to the create_task MCP tool input schema

## AI Instructions
1. Open packages/mcp/src/tools/tasks.ts
2. In the spectree__create_task tool registration, add a new optional parameter
3. Pass the value through to the API client createTask call

## Acceptance Criteria
- [ ] spectree__create_task accepts optional structuredDesc parameter
- [ ] structuredDesc is persisted to database when provided via MCP tools
- [ ] Backward compatibility maintained - omitting structuredDesc still works

## Files Involved
- \`packages/mcp/src/tools/tasks.ts\`
- \`packages/mcp/src/api-client.ts\`

**Risk Level:** medium | **Estimated Effort:** medium
`;
    const result = parseMarkdownToStructuredDesc(md);
    expect(result).not.toBeNull();
    expect(result!.summary).toContain("structuredDesc");
    expect(result!.aiInstructions).toContain("Open packages/mcp/src/tools/tasks.ts");
    expect(result!.acceptanceCriteria).toHaveLength(3);
    expect(result!.filesInvolved).toHaveLength(2);
    expect(result!.riskLevel).toBe("medium");
    expect(result!.estimatedEffort).toBe("medium");
  });
});
