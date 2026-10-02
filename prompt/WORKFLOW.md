# Codex ↔ Claude handoff

## Roles

Codex is the planner, prompt writer, and coordinator. Claude builds the approved implementation and reports results, validation, questions, and missing requirements. Codex reads each report and discusses it with the user. Codex does not implement application changes unless the user explicitly changes these roles.

## Working shared-folder handoff

Claude's terminal monitor picks up approved prompts from `prompt/` and replies in `report/`. It works only while a Claude session is running its monitor in this project; a fresh clone has no running receiver until one is set up. The separate CLI bridge needs its own authentication.

1. The user describes a requirement to Codex.
2. Codex clarifies material gaps, plans the work, and writes a DRAFT in `prompt/drafts/<task-name>.md` using `CLAUDE_TASK_TEMPLATE.md`.
3. Codex presents the goal, scope, and acceptance criteria to the user.
4. Wait for the user's explicit approval for that task: a typed **send it**, or a click on **Send to Claude** for that draft in the local task panel. Both mean the same thing. Silence, agreement, and approval for a previous task do not authorize sending.
5. After a typed **send it**, Codex publishes the approved task as `prompt/<task-name>.md`, marked **APPROVED FOR EXECUTION**, with the user's authorization and an exact report path such as `report/<task-name>-report.md`. After a panel click, the panel publishes that file itself, with a `User authorization:` line recording the browser-button click, its time, and the reviewed draft's SHA-256. Codex does not publish it a second time.
6. Claude's monitor reads the approved prompt. It must ignore drafts, templates, unapproved files, and completed tasks. Publication alone does not authorize an unapproved task.
7. Claude implements the task within the project folder and runs relevant checks available in the terminal. If requirements are missing, Claude writes questions or blockers to the report and stops dependent work.
8. Codex waits for the exact report file, reads it, reviews relevant changes, and discusses the outcome or questions with the user. Claude's claims remain distinct from Codex's independent verification.
9. Codex incorporates the user's answers into the next plan and prompt.
10. Each new dispatch requires its own **send it** or panel click, unless the panel's Auto-send exception below applies. Claude does not start the next task on his own.

## Auto-send (opt-in)

**Auto-send (opt-in exception).** When the user turns on Auto-send in the local task panel, the panel itself may publish drafts first created after that activation, one at a time, while the activating page stays open, with a `User authorization: Auto-send. …` line recording the activation time and ID and the draft's SHA-256. That record authorizes only that one published task. It is not a blanket authorization: Codex still never publishes drafts itself without a typed **send it** or a panel click, Claude never dispatches anything, and Auto-send stops when it is turned off, the page closes, or a report raises questions or a blocker. While Auto-send may be on, save a draft with the standard `DRAFT - DO NOT EXECUTE` marker only once its requirements are settled, because a complete, well-formed new draft can be sent automatically; keep unsettled plans under a non-standard marker such as `DRAFT - REQUIREMENTS PENDING - DO NOT EXECUTE`, which the panel never sends.

## Local task panel

Build the AI Studio UI once with `npm.cmd run ui:build` (React + Tailwind, output in `scripts/task-panel/dist/`). Then start it with `npm.cmd run panel:start` (background, no window) and open the printed URL (default http://127.0.0.1:4317/). Stop it with `npm.cmd run panel:stop`. Codex writes drafts in the `CLAUDE_TASK_TEMPLATE.md` format, which the panel lists automatically:

- `Task ID` matching the file name
- `Delivery status: DRAFT - DO NOT EXECUTE`
- `Source prompt after approval: prompt/<task-id>.md`
- `Report path: report/<task-id>-report.md`

The panel lets the user send one reviewed draft at a time and shows Claude's matching report when it arrives. It publishes only into `prompt/`. It does not contact Claude's terminal or the CLI bridge, so Claude's shared-folder monitor must be running. See `README.md` for details.

## Optional CLI bridge

When authenticated, the separate CLI bridge can also be used:

1. Prepare a draft with `node scripts/claude-bridge.mjs draft prompt/drafts/<task-name>.md`.
2. Review it with `node scripts/claude-bridge.mjs show <task-id>`.
3. After the user's approval, dispatch with `node scripts/claude-bridge.mjs send <task-id> --approval "send it"`.
4. Keep the execution session open while Claude works; it prints progress every 25 seconds.
5. Read the saved report with `node scripts/claude-bridge.mjs report <task-id>`. `wait <task-id> 55` checks a run started in another terminal.

An approved bridge invocation authorizes its delivered task; shared-folder draft files remain unapproved.

## Connection

For a shared-folder handoff through Claude's existing terminal, use `prompt/TO_CLAUDE.md` and the exact approved task/report paths. This transport does not depend on automatic bridge authentication and does not update the separate bridge's task-status records.

The bridge starts a **separate Claude Code CLI process**, not an injection into an existing interactive conversation. Full task context is in the reviewed prompt. There is no automatic background sender.

Claude Code must already be installed and available as `claude` in the terminal. The bridge uses `--restricted` (requires Claude Code 2.1.248 or newer) and `--bare`, with project-local configuration and temporary files. It never copies or reads your global Claude credentials. Provide `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` in the terminal environment running the bridge. Do not paste credentials into chat, prompts, reports, or source files. Without explicit shell authentication, the bridge keeps the task as an unsent draft.

The default tools are Read, Edit, and Write, confined to the project by restricted mode and project-relative permission rules. Claude cannot run shell commands through this bridge; Codex runs the requested build and tests after the report. The tool does not install or update Claude Code.

References: [Claude CLI](https://code.claude.com/docs/en/cli-reference), [environment variables](https://code.claude.com/docs/en/env-vars), [file permissions](https://code.claude.com/docs/en/permissions).

## Files and failure recovery

- Reviewed prompts and status: `prompt/claude/<task-id>.md` and `.json`.
- Claude's final report: `report/claude/<task-id>.md`.
- Claude runtime state: `.claude-local/`.
- Temporary data: `.tmp/claude-bridge/`.
- Each draft is hash checked before dispatch. A changed prompt must be drafted and reviewed again.
- Only one task can execute at a time. A sent task cannot be sent again; retrying requires a new draft and new approval.
- Connection errors and denied permissions are reported, not labeled completed.
- If a terminal is interrupted or a run times out, inspect its Claude process before another dispatch. A remaining `prompt/claude/.dispatch-lock` deliberately blocks further sends. Clear only that exact project-local lock once you know the previous Claude process has ended. Never remove it while Claude is still working.
