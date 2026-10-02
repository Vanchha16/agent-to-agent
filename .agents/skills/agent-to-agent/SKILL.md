---
name: agent-to-agent
description: "Coordinate Codex as planner and prompt writer with Claude Code as implementer using shared project prompt/report files. Use when the user requests agent-to-agent, /agent-to-agent, or $agent-to-agent collaboration, including planning, approved task dispatch, waiting for Claude reports, and discussing Claude's questions."
---

# Agent to Agent

## Roles and approval

Codex plans, clarifies requirements, writes prompts, coordinates handoffs, and reviews reports with the user. Claude implements the approved application changes and performs available validation. Do not implement application code yourself unless the user explicitly changes these roles. Maintaining handoff documents is part of Codex's role.

Follow the loop: **requirement → discussion and plan → draft prompt → user approval → Claude implementation → Claude report or questions → discussion → next draft**.

Wait for the user's **send it** before dispatching each task. An explicit instruction to send a particular message also authorizes that message. When the project has the local task panel (`npm.cmd run panel:start`), the user's click on **Send to Claude** for a reviewed draft is equivalent to **send it** for that one task. The panel publishes the approved prompt itself, with a `User authorization:` line recording the browser-button click, its time, and the draft's SHA-256. Do not republish it, and do not claim the user typed a phrase. Agreement on a plan, silence, skill invocation, and approval of a previous task do not authorize the next dispatch. Once approval is given for an unchanged task, do not ask for it again because transport needed a retry. A material task change requires new approval.

Keep project work, prompts, reports, downloads, caches, and temporary artifacts inside the active project root. Do not inspect other projects or global credentials, install global tools, or change unrelated configuration. Loading this installed skill does not authorize other out-of-project work.

## Start or resume in any project

Follow [assets/repository-setup.md](assets/repository-setup.md) for the user's reusable repository preference: https://github.com/Vanchha16/agent-to-agent.git. On invocation, offer to clone this repository when the current project does not already have it, and wait for the user's explicit approval before cloning. Invocation alone is not clone approval. Keep the clone inside the active project root, do not overwrite existing files, and do not treat cloning as authorization to install dependencies, execute historical tasks, or start implementation. An existing matching checkout should be reused rather than cloned again. This repository preference is separate from approval to dispatch Claude tasks.

1. Identify the active project root from the workspace or user-selected folder. Use that root throughout; never reuse a previous project's absolute path. Read the project's existing instructions and preserve their unrelated content.
2. Inspect existing handoff files and matching reports before creating new ones. Resume a pending approved task or review an unread report instead of sending duplicates. Completed tasks are not re-executed.
3. Use `prompt/drafts/` for unpublished plans, `prompt/` for approved execution prompts, and `report/` for Claude replies. Create only missing directories.
4. Establish whether Claude Code is running in the same project and actively monitoring approved files. A monitor confirmed in another project is not a connection here. Do not replace Claude with an internal subagent or describe a simulated reply as Claude's response.
5. Adapt [assets/claude-instructions.md](assets/claude-instructions.md) into `prompt/AGENT_TO_AGENT.md`, substituting the current root. It is an instruction document, not an execution task. Do not overwrite an existing handoff document without reading and reconciling it.
6. If there is no confirmed receiver, give the user a one-time message for their Claude terminal: `Read prompt/AGENT_TO_AGENT.md and confirm that you can monitor this project's approved prompts and write matching reports.` Use the readiness-report path in that document. Be clear that the user must submit this message when no terminal-delivery tool is available.
7. Verify readiness by reading Claude's actual report. If appropriate, prepare a small greeting handshake and ask for its dispatch approval. Connection setup does not authorize application changes.

## Plan and draft

Clarify material missing requirements while continuing independent planning. Use judgment for routine implementation details. Produce a concrete task containing the goal, context, implementation scope, relevant project-relative files, acceptance criteria, validation, and the exact report path. For destructive requests, identify precisely what to remove and preserve before seeking dispatch approval.

Use [assets/task-prompt.md](assets/task-prompt.md). Assign a unique task ID such as a timestamp plus a short descriptive slug, using only lowercase letters, digits, and hyphens and matching the file name. Save it in `prompt/drafts/<task-id>.md`, explicitly marked **DRAFT - DO NOT EXECUTE**, with authorization pending. This format lets a local task panel list the draft and offer it for a Send to Claude click. Keep substantive draft content out of the receiver's approved-task stream.

Explain the plan and expected result to the user. When asking for dispatch approval, make clear that the **send it** gate comes from this agreed workflow. Do not publish the task while awaiting approval.

## Dispatch to Claude

After approval, publish the reviewed task as `prompt/<task-id>.md` with:

- `Delivery status: APPROVED FOR EXECUTION`
- `User authorization:` recording the user's real instruction for this task
- `Task ID:` and `Source prompt: prompt/<task-id>.md`
- `Report path: report/<task-id>-report.md`
- The actual agreed task and an instruction to stop after reporting

Write the complete approved prompt to a temporary file inside the project, then publish it by an atomic rename so the monitor does not read half a task. Preserve the draft for history. Do not overwrite an existing task ID or completed report. Use the established monitor's supported path convention if it differs, without weakening the approval gate.

Publishing a file makes it available to Claude; it does not prove delivery or execution. Distinguish **drafted**, **published**, **acknowledged/working**, **report received**, and **verified**. Confirm receipt from an actual reply or observed task activity before claiming it was read. Never fabricate a Claude response or bypass missing authentication. If an authenticated CLI bridge is already authorized and configured, it may be used instead; do not silently switch to global credential access.

Do not modify application files while Claude is implementing. Only one implementation task should be active at a time unless the user explicitly approves parallel work.

## Wait, read, and discuss

Check the exact expected report path. Use bounded polling intervals of no more than 55 seconds per blocking call, give meaningful progress updates, and continue waiting while Claude is making progress. Do not send a second task just because the first report is delayed.

Match the report to the task ID and source prompt. Claude should use [assets/report-template.md](assets/report-template.md), write the report completely before publishing it, and distinguish actual tests from recommended or unavailable checks. Treat incomplete or mismatched reports as unconfirmed.

If there is no acknowledgement or activity, inspect the project-local handoff state and ask about the receiver or monitor when needed. Report a stopped listener, missing authentication, denied action, or connection failure accurately; a published prompt is not a finished task. Do not read global login files to recover without authorization.

Read Claude's report and review the resulting project files against the acceptance criteria. Perform proportionate read-only or routine validation when useful and allowed, keeping artifacts local. Distinguish Claude's claims from independently verified results. Do not fix application code yourself; route necessary fixes through another prompt.

Bring Claude's questions, missing requirements, and blockers back to the user. Discuss what happened and what decision is needed. Prepare a revised or follow-up prompt after that discussion, then wait for a new **send it** before publishing it. Do not assume the user's answer to a question authorizes a new implementation task.

When the user says to wait or work is finished, stop dispatching and wait for the next request. Preserve prompt/report history in the project.

## Invocation

The skill is named `agent-to-agent`. In Codex CLI or the IDE extension, explicitly select it using `$agent-to-agent` or `/skills`; in the desktop app, select the skill from the skill picker. Treat a user message `/agent-to-agent` as a request for this workflow when that text reaches the assistant. Do not claim a new native slash command was registered merely by creating this skill.
