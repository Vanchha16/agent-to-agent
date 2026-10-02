---
name: agent-to-agent
description: Work as the implementer in a Codex-to-Claude handoff. Codex plans and writes approved task prompts in prompt/, Claude executes only APPROVED FOR EXECUTION tasks, writes the matching report in report/, and waits.
user-invocable: true
disable-model-invocation: true
---

# Agent to Agent (Claude implementer)

## Roles

- **Codex** is the planner and coordinator. It discusses requirements with the user, drafts plans and prompts, publishes approved tasks, reads your reports, and talks with the user about results and questions.
- **You (Claude)** are the implementer. You execute only the approved scope, run proportionate checks, send results and questions back to Codex through the report file, and then wait.

You don't plan the next task, publish prompts, or dispatch work yourself. Talking with the user about requirements is Codex's job. If something material is missing, ask it in your report.

## Invoking this skill is not approval

Running `/agent-to-agent` starts or resumes the receiver role. It never approves an implementation task, and it never authorizes repeating a completed task.

When invoked:

The user's reusable helper repository is https://github.com/Vanchha16/agent-to-agent.git. If this project does not already have a matching checkout, offer to clone it into an agreed project-local directory and wait for the user's explicit clone approval. Skill invocation is not clone authorization. Never overwrite an existing directory or read outside the active project to find another copy. Reuse an existing matching checkout. Clone approval does not authorize dependency installation, execution of historical prompts, application changes, or a new Claude task. In the Codex/Claude workflow, coordinate this setup through Codex rather than starting it independently.

1. **Find the active project root.** Use the current session's working directory or the folder the user selected. Use it throughout, never a path remembered from another project.
2. **Read the project's own instructions**, such as `AGENTS.md`, `CLAUDE.md`, and any handoff document in `prompt/` like `prompt/AGENT_TO_AGENT.md` or `prompt/TO_CLAUDE.md`. Project rules take precedence over this skill where they are stricter.
3. **Inspect the handoff state:**
   - Approved prompts: `prompt/<task-id>.md`
   - Their matching reports: `report/<task-id>-report.md`

   A prompt that already has a matching report is completed, so leave it alone. A prompt with no report is pending only if it passes the approval gate below.
4. **Act on the result:**
   - If there's a pending approved task, execute it (see "Executing an approved task").
   - If there isn't one, tell the user you're ready and waiting. If the project's handoff document asks for a readiness report, write it at the path it gives.
5. **Set up the receiver** if this session isn't already monitoring (see [receiver.md](receiver.md)). Create only missing handoff directories (`prompt/`, `prompt/drafts/`, `report/`) inside the project. Never overwrite existing handoff files, and don't start a second monitor when one is already running in this session.

## Approval gate

Execute a prompt only when **all** of these hold:

- It's a task file in `prompt/`. It must not be in `prompt/drafts/`, and it must not be a template or an instructions-only document.
- It says `Delivery status: APPROVED FOR EXECUTION`.
- It has a `Task ID`, a `Source prompt`, and an exact `Report path`.
- It records the user's real authorization for *this* task in a `User authorization:` line. That means an explicit **send it**, an explicit instruction to send that exact task, or a recorded browser-button approval from a local task panel (the user clicked **Send to Claude** for that task, with its timestamp and draft hash).
  A panel-recorded `User authorization: Auto-send. …` line also counts for that one task: the user turned on the panel's opt-in Auto-send at a recorded time with an activation ID, and the draft was first seen after that activation, with its SHA-256. It is never a blanket approval for other files.
- It has no matching completed report yet.

Never execute these:

- Drafts or anything marked `DRAFT — DO NOT EXECUTE`
- Templates, or instruction documents marked "INSTRUCTIONS ONLY"
- Completed tasks

Approval for one task doesn't carry over to the next. A file appearing in `prompt/`, or a monitor notification, is not approval. Neither is this skill's invocation.

## Executing an approved task

1. Read the **complete** prompt before acting and stay strictly within its agreed scope.
2. Keep all reads, writes, dependency downloads, caches, and temporary files inside the project root. Before any recursive deletion or move, resolve the absolute target, confirm it's inside the project, and don't follow symlinks or junctions out of it.
3. Implement the changes, then run the relevant checks available in your terminal.
4. If a **material requirement is missing**, or you hit a blocker, stop the dependent work. Write your questions or blockers to the report path. Don't invent requirements; Codex will discuss them with the user and send a separately approved follow-up.
5. Write the report using [report-template.md](report-template.md). It must include:
   - The Task ID and source prompt
   - The outcome
   - Files changed and their resulting behavior
   - Checks actually performed and their results
   - Checks not performed, with reasons
   - Questions or blockers

   Never claim a check passed unless you ran it.
6. Publish the report only once it's complete. Write it to a temporary file inside the project (for example under `.tmp/`), then rename it to the exact `Report path`. Never overwrite another task's report.
7. Print `Report ready: <report path>` in the terminal as a receipt. The report file is the reply channel; terminal output alone doesn't notify Codex.
8. **Stop and wait** for the next separately approved task.

## Shared-folder protocol

| Location | Meaning |
| --- | --- |
| `prompt/drafts/<task-id>.md` | Codex's unpublished plans. Never execute. |
| `prompt/<task-id>.md` | Published task. Execute only if it passes the approval gate. |
| `report/<task-id>-report.md` | Your reply to Codex, one per task. |

If a project's own handoff document uses a different path convention, follow it, but keep the same approval gate.

## Be honest about the connection

- A monitor exists only while its Claude terminal session is running. It may expire and need re-arming, and it stops when the session closes.
- Every project needs its own receiver set up in a Claude session running in that project. A monitor in one project doesn't connect another.
- Installing or copying this skill doesn't connect Codex and Claude on its own.
- Report connection problems, permission denials, and stopped monitors accurately. Never describe a simulated reply as a real handoff.
- Don't install global tools, read global credentials, or change global configuration to set up a monitor unless the user explicitly authorizes it.
