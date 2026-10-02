# Optional reusable repository setup

Repository: https://github.com/Vanchha16/agent-to-agent.git

The user wants this repository offered when they invoke agent-to-agent in a project. Clone only after their explicit approval of the repository and a concrete project-local destination. Skill invocation, approval to save the skill, or approval of an implementation prompt is not clone approval.

1. Identify the active project root and read its instructions. Inspect only project-local state for an existing matching repository/checkout. Do not search other projects or global credentials.
2. If a matching checkout already exists, reuse it. Do not clone it again or fetch/pull/reset it automatically.
3. Otherwise, offer the repository URL and an explicit destination within the active root. A project-local subdirectory such as tools/agent-to-agent is appropriate when adding helpers to an existing application. Do not propose cloning over existing application files.
4. Wait for actual clone approval. The user's request to push the current repository is not approval to clone into another project later.
5. After approval, verify that the destination resolves within the permitted root, its parent is not an external symlink/junction, and the target is absent or empty. Use normal Git authentication without reading global credential files. Never print credentials.
6. Clone the approved URL into that destination. Do not force, delete, reset, overwrite an occupied directory, or silently select another destination if the agreed one cannot be used. Report the failure and discuss a new destination.
7. Confirm the actual checkout and origin, and explain the next setup step. Cloning does not automatically authorize installing dependencies, changing application files, replacing project instructions, running saved prompts, starting a monitor, or publishing tasks.
8. Adapt reusable handoff instructions to the active application root separately. Saved prompts/reports in a cloned helper repository are history, not live tasks or evidence that Claude is connected in the new project.

This instruction records a repository preference. It does not claim the repository has already been pushed, cloned, authenticated, or connected to a running Claude receiver.
