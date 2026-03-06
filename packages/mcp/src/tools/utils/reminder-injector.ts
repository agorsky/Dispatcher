/**
 * Reminder injector for MCP tool responses
 * 
 * Adds contextual next-step guidance to tool outputs to remind agents
 * of workflow requirements and best practices.
 */

/**
 * Reminder rules map - defines what reminder to show for each tool
 */
const REMINDER_RULES: Record<string, string> = {
  // Epic creation
  'create_epic': '**Next Step:** Remember to set structured descriptions for all features and tasks using `spectree__set_structured_description`. Consider using `spectree__create_from_template` instead for better structure.',
  'create_epic_complete': '**Next Step:** Start a session with `spectree__start_session` before beginning implementation.',
  'create_from_template': '**Next Step:** Review the execution plan with `spectree__get_execution_plan`, then start a session with `spectree__start_session`.',
  
  // Feature creation
  'create_feature': '**Next Step:** Set structured description with `spectree__set_structured_description` including summary, AI instructions, and acceptance criteria. Then create tasks with `spectree__create_task`.',
  
  // Task creation
  'create_task': '**Next Step:** If you did not include structuredDesc in this call, set it now with `spectree__manage_description` (action: set) including aiInstructions and acceptanceCriteria. Then add validation checks with `spectree__add_validation` to define "done" criteria.',
  
  // Progress tracking
  'start_work': '**Next Step:** As you work, remember to call `spectree__log_progress` at significant milestones and `spectree__link_code_file` for every file you modify.',
  'log_progress': '**Next Step:** Continue implementation. When done, run `spectree__run_all_validations` before marking complete.',
  'complete_work': '**Next Step:** Consider using `spectree__get_next_required_action` to identify what to work on next.',
  
  // Validation
  'add_validation': '**Next Step:** Add more validation checks if needed, or proceed with implementation. Run `spectree__run_all_validations` before completing the task.',
  'run_all_validations': '**Next Step:** If all validations passed, call `spectree__complete_task_with_validation` with a summary. If any failed, fix the issues first.',
  
  // Session management
  'start_session': '**Next Step:** Review the previous session context (if any) and the execution plan. Begin working on the first feature in the plan.',
  'end_session': '**Next Step:** Session ended. Your handoff data will be available to the next session.',
  
  // Code context
  'link_code_file': '**Reminder:** Continue linking ALL modified files. This is critical for context in future sessions.',
  
  // Decisions
  'log_decision': '**Reminder:** Continue logging decisions for non-trivial implementation choices. Future sessions depend on this context.',
  
  // Structured descriptions
  'set_structured_description': '**Next Step:** If this is a task, add validation checks with `spectree__add_validation`. For features, ensure all tasks have structured descriptions too.',
  
  // Execution planning
  'get_execution_plan': '**Next Step:** Start a session with `spectree__start_session`, or if working on a specific phase, begin with the first feature in that phase.',
  'set_execution_metadata': '**Next Step:** After setting execution metadata for all features, generate the execution plan with `spectree__get_execution_plan` to verify the ordering.',
  
  // Teams
  'list_teams': '**Next Step:** Use the team ID or key when creating epics. If unsure which team to use, ask the user to choose.',
  
  // Templates
  'list_templates': '**Next Step:** Preview a template with `spectree__preview_template`, then create from it with `spectree__create_from_template`.',
  'preview_template': '**Next Step:** If the preview looks good, create the epic with `spectree__create_from_template`.',
  
  // Search
  'search': '**Next Step:** If you found existing work, consider whether to continue it or create new items. Use `spectree__get_feature` or `spectree__get_task` for details.',
};

/**
 * Inject a reminder into a tool result
 * 
 * @param toolName - The name of the tool (without spectree__ prefix)
 * @param result - The raw result object
 * @returns The result with reminder appended (if applicable)
 */
export function injectReminder<T extends object>(
  toolName: string,
  result: T
): T {
  // Check if reminders are disabled via environment variable
  if (process.env.SPECTREE_DISABLE_REMINDERS === 'true') {
    return result;
  }
  
  // Get the reminder for this tool
  const reminder = REMINDER_RULES[toolName];
  if (!reminder) {
    return result;
  }
  
  // Append reminder to the message field if it exists
  const rec = result as Record<string, unknown>;
  if (typeof rec.message === 'string') {
    return {
      ...result,
      message: `${rec.message}\n\n> ${reminder}`
    };
  }
  
  // If no message field, add one with just the reminder
  return {
    ...result,
    reminder
  };
}

/**
 * Inject a reminder into an MCP response
 * 
 * This is a wrapper around injectReminder that handles MCP's response format
 * 
 * @param toolName - The name of the tool (without spectree__ prefix)
 * @param response - The MCP response object with content array
 * @returns The response with reminder appended
 */
export function injectReminderIntoMcpResponse(
  toolName: string,
  response: { content: { type: string; text: string }[] }
): { content: { type: string; text: string }[] } {
  // Check if reminders are disabled
  if (process.env.SPECTREE_DISABLE_REMINDERS === 'true') {
    return response;
  }
  
  // Get the reminder for this tool
  const reminder = REMINDER_RULES[toolName];
  if (!reminder) {
    return response;
  }
  
  // Parse the existing JSON response
  const firstContent = response.content[0];
  if (firstContent?.type !== 'text') {
    return response;
  }
  
  try {
    const data = JSON.parse(firstContent.text) as Record<string, unknown>;
    
    // Append reminder to message field
    const updatedData = injectReminder(toolName, data);
    
    // Return updated response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(updatedData, null, 2)
        }
      ]
    };
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: `${firstContent.text}\n\n> ${reminder}`
        }
      ]
    };
  }
}
