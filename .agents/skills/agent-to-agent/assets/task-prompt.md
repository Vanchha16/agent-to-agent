# {TASK_TITLE}

Task ID: {TASK_ID}
Delivery status: DRAFT - DO NOT EXECUTE
User authorization: pending
Project root: {PROJECT_ROOT}
Source prompt after approval: `prompt/{TASK_ID}.md`
Report path: `report/{TASK_ID}-report.md`

## Goal and context

{AGREED_REQUIREMENT_AND_EXISTING_BEHAVIOR}

## Scope and relevant files

{PROJECT_RELATIVE_FILES_AND_IMPLEMENTATION_BOUNDARIES}

## Implementation plan

{CONCRETE_STEPS_FOR_CLAUDE}

## Acceptance criteria

{OBSERVABLE_DONE_CONDITIONS}

## Validation

{RELEVANT_CHECKS_AND_COMMANDS}

Report checks actually performed separately from recommended or unavailable checks. Keep downloads, caches, temporary files, and all work inside the project root. Before recursive deletion or moving, verify absolute targets remain inside the intended project directory and do not follow links outside it.

## Reply and stopping condition

You are the implementer; Codex is the planner and prompt writer. If material requirements are missing, write the questions or blockers to the exact report path and stop dependent work. Do not invent requirements or start another task.

Write the report with task ID, source prompt, outcome, files changed, actual validation, and remaining issues. Publish the complete report through a project-local temporary file and rename if supported. After reporting, wait for the next separately approved prompt.
