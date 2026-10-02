# User rules for this workspace

- Reusable workflow repository: `https://github.com/Vanchha16/agent-to-agent.git`. When the agent-to-agent skill is used, offer to clone this repository into an agreed directory inside the active project if no matching checkout exists. Wait for the user's explicit clone approval. Reuse existing matching checkouts and never overwrite files. Clone approval is separate from task-dispatch approval and does not authorize dependency installation or historical task execution.

- Keep all project reads, writes, downloads, caches, reports, and temporary artifacts inside the active project root: the folder that contains this `AGENTS.md`. Do not inspect or modify files outside this folder.
- Codex is the planner, prompt writer, and coordinator. Claude is the implementer. Codex does not build or modify application code unless the user explicitly changes these roles. Maintaining handoff instructions and task/report files is part of Codex's role.
- Codex discusses tasks with the user and prepares a concrete Claude prompt after that discussion.
- Each plan should specify the goal, agreed scope, relevant files, implementation steps, acceptance criteria, validation, and an exact report path. Ask the user about material missing requirements before dispatching dependent work.
- Preparing or agreeing on a prompt is NOT permission to send it. Wait for the user's explicit `send it` before dispatching that specific prompt to Claude.
- In the local task panel (`npm.cmd run panel:start`), the user's click on **Send to Claude** for a reviewed draft is equivalent to typing `send it` for that one task. The panel publishes the approved prompt itself and records the click (task ID, time, and draft SHA-256) as the user authorization. Codex must not republish that task or treat the click as approval for any other task.
- Use `scripts/claude-bridge.mjs` for automatic handoffs. Review the prompt with `show` before sending it. Never use the approval flag without the user's actual authorization in the conversation.
- The user also requested a direct shared-folder handoff for Claude's terminal. Instructions are in `prompt/TO_CLAUDE.md`. Use the specified prompt and report paths, preserve the same approval gate, and do not claim the automatic bridge is connected when it is not.
- Prefer the shared-folder handoff (Claude's terminal monitor watching `prompt/`) for tasks. It works only while a Claude session in this project is running its monitor; a fresh clone has no running receiver and no live approved task until one is set up and approved. Keep draft plans in `prompt/drafts/` with an explicit DRAFT marker. Publish an execution prompt only after authorization and mark it APPROVED FOR EXECUTION with the user's authorization and exact report path.
- After dispatch, wait for the corresponding report, read it, verify relevant changes, and discuss the outcome with the user.
- Do not automatically dispatch another task after receiving a report. Each new prompt needs its own `send it` from the user.
- If Claude returns questions, missing requirements, or blockers, read them and discuss them with the user. Do not guess at material requirements or dispatch a follow-up until its scope is settled and separately approved.
- Report connection failures and permission denials honestly. Do not call a draft sent, a queued task executed, or a Claude report independently verified.
- Do not edit project files concurrently with Claude while he is executing a task.
