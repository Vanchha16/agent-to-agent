# Receiver setup (shared-folder monitor)

The receiver is how a running Claude Code session notices that Codex has published a task. It's a convenience only. Every file it reports still has to pass the approval gate in [SKILL.md](SKILL.md).

## Before starting one

- Check whether this session already has an active monitor on this project's `prompt/` folder. If it does, don't start a duplicate.
- Run the monitor from the **active project root**. Never hard-code another project's path.
- Use only the tools this terminal already has. Don't install tools or change global settings to build a monitor without the user's authorization.

## Example monitor (Claude Code Monitor tool, bash)

Run this from the project root as a background monitor. It prints one line whenever a `*.md` file in `prompt/` or one level below is added, changed, or removed. It skips `prompt/drafts/`.

```bash
snap() { find prompt -maxdepth 2 -type f -name '*.md' -not -path 'prompt/drafts/*' -printf '%p %T@ %s\n' 2>/dev/null | sort; }
prev=$(snap)
while true; do
  sleep 2
  cur=$(snap) || continue
  if [ "$cur" != "$prev" ]; then
    comm -13 <(echo "$prev") <(echo "$cur") | awk '{print "CHANGED: " $1; fflush()}'
    comm -23 <(echo "$prev" | awk '{print $1}' | sort -u) <(echo "$cur" | awk '{print $1}' | sort -u) | awk '{print "REMOVED: " $1; fflush()}'
    prev=$cur
  fi
done
```

This snippet needs GNU `find` (for example, Git Bash on Windows). If it isn't available, use an equivalent polling loop with the terminal's own shell.

## When an event arrives

1. Read the changed file in full.
2. Apply the approval gate. Instruction documents, templates, drafts, and completed tasks produce events too; read them and take no action.
3. If the file is an approved, pending task, execute it as described in [SKILL.md](SKILL.md) and publish the report.

## Limits to state honestly

- Monitors time out (in Claude Code, after at most 30 minutes per run). Re-arm on expiry while the user wants the receiver active.
- The monitor stops when the Claude terminal session closes or is interrupted. Delivery resumes only after the user restarts a session and the receiver is re-established.
- The monitor reads files only. It doesn't update any separate CLI-bridge status records.
