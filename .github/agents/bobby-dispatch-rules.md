# Bobby Dispatch Rules — Mandatory

## LAW-004: Task Must Be Marked In Progress Before Work Begins
**VIOLATED TWICE IN A ROW (ENG-E12 Case #30, ENG-E13 Case #34)**

Every dispatch prompt MUST include this instruction verbatim:
> MANDATORY — BEFORE WRITING ANY CODE for a task:
> 1. Run: curl -s -X PATCH "http://localhost:3001/api/v1/tasks/TASK_ID" -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"statusId":"IN_PROGRESS_STATUS_ID"}'
> 2. Only then begin implementation
> Skipping this step is a LAW-004 violation and results in a major deduction.

## LAW-005: All Modified Files Must Be Linked
**VIOLATED TWICE IN A ROW (ENG-E12 Case #31, ENG-E13 Case #35)**

When marking a task Done, ALWAYS include relatedFiles, gitBranch, gitCommits, gitPrNumber in the PATCH body.
