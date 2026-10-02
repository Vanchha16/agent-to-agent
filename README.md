# Codex ↔ Claude handoff workspace

Repository: [Vanchha16/agent-to-agent](https://github.com/Vanchha16/agent-to-agent).

The reusable agent-to-agent skill offers to clone this repository when needed in a new project and waits for the user's explicit approval first. It reuses existing matching checkouts. Cloning does not approve Claude tasks or execute saved prompt history.

This folder holds the coordination workflow between Codex (planner and prompt writer) and Claude (implementer). The previous Orbit chat website was removed. The only app here is the local task panel, the **AI Studio**, used to approve tasks; new work starts only from a new approved task.

## Getting started from a clone

```powershell
git clone https://github.com/Vanchha16/agent-to-agent.git   # into a folder you choose, inside your project
cd agent-to-agent
npm.cmd install --cache .npm-cache   # project-local dependencies and cache
npm.cmd run ui:typecheck
npm.cmd run ui:build                 # builds scripts/task-panel/dist/ (not committed)
npm.cmd run panel:start              # prints the local URL
```

A clone contains the app, the skills, and the shared handoff instructions and templates. It contains **no task history and no live approved task**: `prompt/` holds only `WORKFLOW.md`, `AGENT_TO_AGENT.md`, `CLAUDE_TASK_TEMPLATE.md`, and `TO_CLAUDE.md`, and `report/` holds only `CLAUDE_REPORT_TEMPLATE.md`. Task prompts, drafts, and reports you create stay local (they are git-ignored). A clone also does not connect Claude: tasks are received only while a Claude session in that project is running its shared-folder monitor (for example via the `agent-to-agent` skill).

### Skill packages

- `skills/agent-to-agent/`: portable Codex skill package (planner side).
- `.agents/skills/agent-to-agent/`: the same Codex skill, as a project-local discoverable copy.
- `.agents/skills/ui-templates/`: Codex skill for planning selectable UI templates (Studio, Dashboard, Board, Terminal, Minimal, Cyber) for the same website.
- `.claude/skills/agent-to-agent/`: Claude implementer skill (`/agent-to-agent`), including receiver setup.

The agent-to-agent skill may offer to clone this repository into another project, but it clones only after the user explicitly approves the repository and a project-local destination. Invoking or saving the skill is not clone approval, and a clone never authorizes executing old prompts.

## How it works

The handoff scripts and the panel server use only Node's built-in modules. The AI Studio frontend is React + TypeScript + Tailwind CSS, built with Vite. Its dependencies are installed locally in `node_modules/` and are needed only to build the UI.

## Workflow

**discuss → draft → user approves (clicks Send to Claude, or says "send it") → Claude executes → report → discuss**

1. The user describes a requirement to Codex.
2. Codex writes a DRAFT in `prompt/drafts/<task-id>.md` using `prompt/CLAUDE_TASK_TEMPLATE.md`.
3. The user reviews the draft and approves it. They can click **Send to Claude** in the local task panel, which publishes `prompt/<task-id>.md` with a recorded browser-button approval. Or they can say **send it** to Codex, which then publishes the same file. Either way, the published prompt is marked **APPROVED FOR EXECUTION** and carries the report path.
4. Claude executes only approved prompts, keeps all work inside this folder, and writes the report (`report/<task-id>-report.md`, using `report/CLAUDE_REPORT_TEMPLATE.md`).
5. Codex reads the report and discusses it with the user. Each new task needs its own approval: one click or one **send it** per task. Nothing is ever sent automatically.

Rules are in `AGENTS.md` and `CLAUDE.md`. See `prompt/WORKFLOW.md` for full details.

## Local task panel (AI Studio)

A calm local studio where you, the project owner, review Codex's plans, approve them with a real button, and read Claude's reports.

First-time setup, or after changing the UI source in `scripts/task-panel/ui/`:

```powershell
npm.cmd install --cache .tmp/npm-cache   # project-local dependencies (once)
npm.cmd run ui:typecheck                 # TypeScript check
npm.cmd run ui:build                     # build into scripts/task-panel/dist/
npm.cmd run ui:watch                     # optional: rebuild on save, then refresh the page
```

Run the panel:

```powershell
npm.cmd run panel:start   # start in the background (no window) and print the URL
npm.cmd run panel:stop    # stop the background panel
npm.cmd run panel         # or run it in the foreground (Ctrl+C to stop)
npm.cmd run test:panel    # run the panel tests (fixtures stay in .tmp/)
```

The panel listens only on `127.0.0.1`. It uses port **4317** by default (open http://127.0.0.1:4317/); if that port is busy it tries the next ones, and it always prints the actual URL. You can set `TASK_PANEL_PORT` or pass `-- --port <n>` to choose another port.

The studio shows **You** (project owner) directing two workstations: **Codex** (planner, OpenAI Blossom) and **Claude** (builder, Claude Spark). Every status comes from the real files. Plans and reports open in a details drawer with **Send to Claude** and **Wait** pinned at the top; the side panel shows what's on your desk and a filterable project history. Light, dark, and system themes are available from the header.

**Templates** in the header opens a gallery of six layouts for the same panel: **Studio** (default), **Dashboard**, **Board**, **Terminal**, **Minimal**, and **Cyber**. Each shows the same tasks, reports, and Send to Claude approval; only the presentation changes. The choice is saved in the browser and is independent of the light/dark setting. Switching never sends anything or changes task files.

- **Plans awaiting approval**: drafts from `prompt/drafts/`. Open one to read the full plan.
  - **Send to Claude** is your approval for that exact version. The panel checks that the draft hasn't changed since you viewed it. It then publishes `prompt/<task-id>.md` atomically and records the click, time, and draft SHA-256 in its `User authorization:` line. It never overwrites an existing prompt or report.
  - **Wait** leaves the draft unsent and publishes nothing.
  - Drafts with missing or wrong fields are explained and can't be sent.
- **Sent to Claude**: published tasks.
  - "Sent · not yet acknowledged" means only that the file is published.
  - "Working" appears only when Claude's progress receipt (`report/<task-id>-progress.md`) exists.
- **History**: finished tasks with Claude's report (questions and blockers are flagged), and superseded drafts, which can never be sent.

Only one approved task can be waiting for its final report at a time. This is enforced by the server and survives restarts, because it is worked out from the files on disk. The page refreshes by itself, so new drafts and reports appear without reloading.

The button only publishes a task file. It doesn't type into Claude's terminal or restart a stopped monitor: Claude's terminal monitor must be running in this project to pick the task up.

Paths come from the panel's own location (`scripts/task-panel/`), so the folder can be reused in another project that has the same `prompt/` and `report/` layout. The server serves only the built `index.html` (with a per-session token injected), the compiled files listed in the Vite manifest (`dist/.vite/manifest.json`), and the three official logo files. It never serves arbitrary files, and it only accepts task IDs. Approval requests also need a per-session token and must come from the panel's own origin.

## Shared-folder handoff (primary)

Claude's existing terminal watches `prompt/` for approved tasks. Instructions for Claude are in `prompt/TO_CLAUDE.md`. Replies go to the `report/` folder. Draft files, templates, and completed tasks are never executed.

## Terminal bridge (optional)

`scripts/claude-bridge.mjs` starts a separate, restricted Claude Code CLI process for a reviewed task. It requires `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` in the terminal environment. The task panel does not use the bridge.

```powershell
npm.cmd run bridge -- help
npm.cmd run test:bridge
```

The equivalent direct commands are `node scripts/claude-bridge.mjs help` and `node --test scripts/claude-bridge.test.mjs`.

## Layout

- `AGENTS.md`, `CLAUDE.md`: workspace rules for Codex and Claude
- `prompt/`: task prompts, drafts, templates, `TO_CLAUDE.md`, `WORKFLOW.md`, and bridge task records (only the shared instructions and template are committed; task files stay local)
- `report/`: Claude reports and the report template (only the template is committed)
- `skills/`, `.agents/skills/`, `.claude/skills/`: skill packages (see above)
- `scripts/`: terminal bridge and its tests; `scripts/task-panel/` holds the local task panel (server, UI, and tests)
- `.npm-cache/`, `.tmp/`, `.claude-local/`: project-local caches and runtime state (the panel keeps its log, send lock, and approval log in `.tmp/task-panel/`)
