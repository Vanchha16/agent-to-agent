# agent-to-agent (Claude Code skill)

This is the Claude-side half of the Codex ↔ Claude handoff. Codex plans and publishes approved task prompts. Claude implements them and replies with a report file.

## Files

- `SKILL.md`: the skill itself, covering the implementer role, approval gate, task execution, and protocol
- `receiver.md`: how to set up and run a shared-folder monitor honestly
- `report-template.md`: the report format Claude uses

## Using it

- Type `/agent-to-agent` in Claude Code to start or resume the receiver role in the current project. Invoking it does **not** approve any task; tasks still need an `APPROVED FOR EXECUTION` prompt with the user's real authorization (a typed "send it", a recorded Send to Claude click, or a panel-recorded Auto-send activation).
- `/skills` (plural) lists the skills Claude Code has discovered.
- If this folder was added while a session was already running, run `/reload-skills` or start a new session so the skill is picked up.
- The skill sets `disable-model-invocation: true`, so Claude only runs it when you invoke it yourself.

## Using it in another project

Copy this whole `agent-to-agent` folder into the other project's `.claude/skills/` directory (`<project>/.claude/skills/agent-to-agent/`). The files contain no project-specific paths.

Copying the skill doesn't connect anything by itself. In that project you still need to:

1. Set up Codex's side of the workflow (its own handoff document in `prompt/`).
2. Start a Claude Code session in that project root, invoke `/agent-to-agent`, and confirm that its receiver is running.
3. Send tasks only after the user's explicit approval.
