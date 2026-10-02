---
name: ui-templates
description: "Plan selectable UI templates for the same website, with a preview gallery, saved selection, and shared application behavior. Use when a user wants multiple website designs or layouts to choose from, including Studio, Dashboard, Board, Terminal, Minimal, and Cyber. Not for color-only theme pickers, separate websites, or website generators."
---

# Selectable UI Templates

## Purpose and boundaries

Give one website several complete interface designs that users can choose between. The data, features, business rules, and approval actions remain shared. A template changes composition, hierarchy, density, navigation, and visual style; it is more than a new color palette.

Keep all reads, writes, previews, caches, reports, and temporary artifacts inside the active project root. Derive that root from the current workspace, never from a previous project. Read the project's instructions first.

Follow project role assignments. In the Codex/Claude workflow, Codex discusses scope, prepares a prompt, coordinates delivery, and reviews results; Claude implements application code. Saving or invoking this skill does not approve an implementation task. Do not edit application code or publish an execution prompt without the authorization required by the project.

## Start or resume

1. Inspect the existing UI, framework, shared state/data derivation, theme storage, routing, task/detail views, and validation commands. Read relevant pending prompts and reports to avoid duplicate work.
2. Establish whether the request means different layouts for the same application, color themes, or starting templates for new projects. Clarify only material uncertainty; do not repeat questions the user has already answered.
3. Offer the six defaults below unless the user chooses a different set. Keep the existing layout as the default/fallback, adapting the Studio option to it. Treat names and layouts as design proposals, not approval to build.
4. Prepare a concrete draft using [assets/task-prompt.md](assets/task-prompt.md). Expand all placeholders and include the actual files, agreed designs, implementation steps, acceptance criteria, validation commands, and exact report path.

## Default template collection

Use stable IDs: studio, dashboard, board, terminal, minimal, cyber.

1. **Studio:** calm workspace with the owner's current decision, two agent desks, and a focus/history sidebar. Preserve the existing Studio when present.
2. **Dashboard:** operational overview with a compact navigation rail, agent summaries, and a wide task list/table. Derive counts from actual data. All navigation must lead to implemented views or visible sections.
3. **Board:** task-first status columns and cards opening the shared detail view. For this workflow use exclusive groups: Needs you = draft, malformed, blocked, or reports with questions; With Claude = published or working; Reports = ordinary reports; Archived = superseded. Adapt groups to another application's real state model. Do not imply that dragging changes file-driven task state. Keep every item reachable on phones.
4. **Terminal:** developer-style visual interface with monospaced headings, compact agent summaries, crisp panel boundaries, and chronological activity drawn from real timestamps. It is not an interactive shell. Do not fabricate commands, execution logs, or agent activity.
5. **Minimal:** clean single-column workspace centered on the current task or next decision, compact agent status, and accessible expandable history. All capabilities must remain reachable.
6. **Cyber:** futuristic command center with angular panels, restrained cyan/violet neon accents, subtle grid details, a prominent mission/approval area, and an asymmetric arrangement of agent and task modules. Give it a distinct composition from Terminal. Keep text readable and decorations subtle; honor reduced motion, avoid flashing, and do not apply glow/recoloring to official logos.

These are complete UI designs for one application. Do not create six separate backends or six copies of application logic. Do not satisfy the request with six recolored versions of one composition.

## Template picker and preference

- Provide a clearly labelled Templates entry point and an accessible gallery of accurate composition previews, names, short descriptions, and an active-template indicator.
- Use an explicit Use this template action. Merely browsing a preview must not silently persist a choice.
- Keep previews inert. They must not fetch data, run lifecycle effects, approve tasks, or display sample activity as if it were real.
- Handle keyboard focus, selection, Escape/close, focus return, touch, and narrow widths. Avoid nested/conflicting modal dialogs.
- Store the selected layout locally using a dedicated preference, independent of existing System/Light/Dark settings. Validate IDs, fall back to the existing/default layout, and tolerate unavailable storage.
- Keep the active template discoverable and make returning to the default easy.
- Support existing appearance modes across all templates; a Cyber or Terminal choice must not force dark mode unless the user explicitly requested that behavior.

## Shared application behavior

Keep polling/fetching, selection, detail view, business actions, approval handlers, report badges, and lifecycle tracking above the chosen layout. Reuse the same data derivation and handlers. Switching layouts must not change data, send anything, reset context, clear unseen reports, restart polling as a new session, or replay historical events.

For the shared-folder task panel, preserve:

- Full safe plan/report rendering and shared top-pinned Send/Wait controls.
- Reviewed draft hash protection and one active implementation task at a time.
- Accurate distinction between published and acknowledged/working tasks.
- Blockers, questions, malformed drafts, superseded history, and all task details.
- Factual lifecycle announcements and reduced-motion handling. Adapt visual targets to the active layout without triggering synthetic events.
- Official local logo assets and the correct black/white variant for the resolved appearance.

Provide loading, empty, error, expired-session, and attention states across designs. Check text contrast, status meaning beyond color, accessible names, focus, responsive layouts, and locally scrollable content without body overflow.

## Draft and approval in the Codex/Claude workflow

Use unique task IDs matching the draft filename, such as YYYYMMDD-ui-designs. In this project's local task panel, filenames containing the substring "template" are ignored as instruction/template files; use a slug such as ui-designs rather than ui-templates.

Save drafts in prompt/drafts/ with Delivery status: DRAFT - DO NOT EXECUTE and User authorization: pending. Discuss the concrete draft with the user. Each dispatch requires their actual send it or their Send to Claude click for that reviewed draft, or the panel's opt-in Auto-send when the user has explicitly turned it on (then a complete draft with the standard marker may be sent automatically, so keep unsettled plans under a non-standard marker such as `DRAFT - REQUIREMENTS PENDING - DO NOT EXECUTE`). Any template must show the shared Auto-send control and its status unchanged. Skill invocation, saving the skill, plan agreement, and approval of another task do not authorize this task.

After typed approval, use the project's established transport and publish only the reviewed task. A panel click publishes the approved prompt itself; do not republish it. Record the real authorization, task ID, source prompt, and report path. Distinguish publication, acknowledgement, report receipt, and independent verification. Do not claim a monitor is active from a saved skill alone.

## Validation and report review

Use the project's real type checking, production build, and relevant existing behavioral tests. For this Studio project these are ui:typecheck, ui:build, test:panel, and test:bridge via npm.cmd run. Do not add tests that only repeat CSS or markup. Meaningful coverage may include exclusive board grouping, invalid preference fallback, and switching without losing shared state.

Visually inspect every design at desktop and narrow phone widths, including light/dark, gallery navigation/apply/close, reload persistence, detail access, and attention states. Use isolated project-local fixtures when simulation is necessary, clearly labelled as simulated. Never approve a real task as a UI test.

Verify that switching creates no send request, task-file write, or replayed lifecycle event. Report actual checks separately from code review or unavailable checks. Build the assets the real server serves; restart only the identified application process if necessary and authorized.

Read the matching Claude report, verify material outcomes, and discuss unresolved issues with the user. Route application fixes through a separately approved prompt. Stop after reporting; do not dispatch the next task automatically.

## Saved skill versus active implementation

This package is reusable instruction content, not an approved execution prompt. Saving it does not implement the six designs or send a task to Claude. Do not claim picker discovery, successful invocation, or application completion without observing it.
