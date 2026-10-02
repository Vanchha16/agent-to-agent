# Instructions for Claude: prompts and replies

Claude, you are collaborating with Codex in this shared project folder: the active project root that contains this `prompt/` directory.

Keep all work inside this folder. Read `AGENTS.md` and `CLAUDE.md`.

Codex is the planner and prompt writer. You are the implementer. Build the approved tasks and report results, validation, blockers, and missing requirements; Codex will discuss your report with the user before preparing the next task.

This document is instructions only; it does not approve any task. Execute only a prompt marked APPROVED FOR EXECUTION with the user's authorization for that task: a typed **send it**, a recorded **Send to Claude** click, or a panel-recorded `User authorization: Auto-send. …` line from a verified Auto-send activation. Ignore `prompt/drafts/`, DRAFT prompts, templates, and completed tasks (prompts that already have their matching report). Seeing a new file alone does not authorize work. A fresh clone of this project contains no live approved task.

## Where to read Codex's prompt

Codex writes task prompts in `prompt/`, named `prompt/<task-id>.md`. Read the exact prompt path Codex or the user gives you, or the approved prompt your monitor reports. Do not execute other files just because they appear in `prompt/`. A draft is not approval, and approval for one task does not authorize any other task.

## Where to send your report

Write your report to the exact `Report path` named in the approved task, normally `report/<task-id>-report.md`. If the task names a progress path, publish a short acknowledgement there when you start. Use `report/CLAUDE_REPORT_TEMPLATE.md` as the format and include the Task ID and source prompt path so Codex can match your reply to the task.

Do not overwrite a previous report unless explicitly instructed. Do not change the bridge's task-status JSON files.

## How to reply back to Codex

Your Markdown report in the shared `report/` folder is the reply channel. Include:

1. Outcome: completed, partially completed, or blocked.
2. What you understood or did.
3. Changed files, if any.
4. Checks you actually performed and their results.
5. Questions, blockers, or suggested next steps for Codex to discuss with the user.

If you need clarification, write the question in your report and stop the dependent work. Never claim a test passed unless you ran it.

After saving your reply, say in your terminal:

`Report ready: <report path>`

Codex can read that file on its next check and discuss it with the user. Terminal output alone does not notify Codex; the saved file makes your reply available. A user message such as **Claude's report is ready** tells Codex to check immediately.

After reporting, wait. Codex and the user will discuss the outcome, prepare the next prompt, and wait for another explicit approval before dispatching it.

## If the automatic bridge launches you

For tasks received through `scripts/claude-bridge.mjs`, return the report as your final response. The bridge saves it to `report/claude/<task-id>.md` automatically. Do not write that destination yourself; it is managed by the bridge.

The direct terminal handoff above works through shared files and only while a Claude session in this project is running its monitor. The automatic bridge still requires its own authenticated connection.
