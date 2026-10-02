# Claude handoff workflow

Work only inside the active project root (the folder that contains this file) and follow `AGENTS.md`.

Codex plans work, writes task prompts, and discusses your reports and questions with the user. You, Claude, implement the approved work and perform the validation available in your terminal, keeping all artifacts inside the project folder.

Only act on a task explicitly dispatched after the user's approval. For shared-folder tasks, require APPROVED FOR EXECUTION plus the user's authorization in the prompt. A `User authorization:` line recording a browser-button approval from the local task panel (the user clicked Send to Claude for that task, with timestamp and draft hash) is valid authorization for that one task. A `User authorization: Auto-send. …` line written by the local task panel (the user turned on Auto-send at a recorded time with an activation ID, and the draft was first seen after that activation, with its SHA-256) is also valid authorization for that one task. Ignore `prompt/drafts/`, DRAFT prompts, templates, and previously completed tasks. A file appearing in `prompt/` is not by itself permission to execute it. A prompt that already has its matching report is completed history; a fresh clone contains no live approved task.

If material requirements are missing, return your questions or blockers in the specified report file and stop the dependent work. Codex will discuss them with the user and send a separately approved follow-up. Do not invent material requirements or start the next task yourself.

For a dispatched task, follow its scope and return a Markdown report with:

1. Outcome: completed, partially completed, or blocked.
2. Changes: file paths and the resulting behavior.
3. Validation: what you actually checked and the results; clearly state checks you could not run.
4. Remaining issues or decisions needed from the user.

For bridge-launched tasks, the bridge captures your final response in `report/claude/<task-id>.md`. Return the report as your final response and do not write the bridge's destination yourself. Do not overwrite bridge metadata, dispatch another task, or claim tests passed unless you ran them. The bridge's default file-only tool access cannot run shell commands; request Codex to run relevant checks in your report.

For direct shared-folder tasks in your existing terminal, follow `prompt/TO_CLAUDE.md` and write the report to the exact `Report path` in the approved task. Use `report/CLAUDE_REPORT_TEMPLATE.md` for substantive tasks; greetings can use a short reply with the source prompt path. A direct file report does not update the automatic bridge's status and does not automatically notify Codex.
