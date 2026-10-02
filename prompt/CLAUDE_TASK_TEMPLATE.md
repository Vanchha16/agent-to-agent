# Task title

Task ID: <task-id>
Delivery status: DRAFT - DO NOT EXECUTE
User authorization: pending
Source prompt after approval: `prompt/<task-id>.md`
Report path: `report/<task-id>-report.md`

Save drafts as `prompt/drafts/<task-id>.md`. The task ID must match the file name and use only lowercase letters, digits, and hyphens (for example `20261002-add-login-page`). The local task panel (`npm.cmd run panel:start`) lists drafts in this format. When the user clicks **Send to Claude** for the reviewed draft, the panel publishes `prompt/<task-id>.md` with `Delivery status: APPROVED FOR EXECUTION` and a recorded browser-button approval. A typed **send it** remains equivalent: Codex then publishes the approved prompt with that authorization. The panel explains drafts that miss these fields, and it will not send them.

## Goal

Describe the behavior we agreed on with the user.

## Context

Explain the relevant existing behavior and the user's requirements.

## Files to inspect

List project-relative paths Claude needs to read.

## Work to do

Give concrete steps and boundaries for this task.

## Acceptance criteria

Describe what the user should see when the task is done.

## Validation

Ask Claude to run relevant checks available in the terminal, with downloads, caches, and temporary files kept inside the project folder. Claude must distinguish actual checks from recommended or unavailable ones. The optional CLI bridge has file-only tools, so checks unavailable in that mode must be reported rather than claimed completed.

## Report

Write the Task ID, `Source prompt: prompt/<task-id>.md`, outcome, changed files, actual validation, remaining issues, and questions to the exact report path. If material requirements are missing, report them and stop dependent work so Codex can discuss them with the user. Do not start another task.
