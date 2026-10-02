# Choose between selectable UI designs for the same website

Task ID: <unique-task-id-without-the-substring-template>
Delivery status: DRAFT - DO NOT EXECUTE
User authorization: pending
Source prompt after approval: prompt/<task-id>.md
Report path: report/<task-id>-report.md
Progress path: report/<task-id>-progress.md

## Goal and agreed scope

Add selectable complete UI designs to <existing application> while keeping the same data, features, and business rules. Provide a gallery with accurate composition previews, an explicit apply action, a visible active choice, and browser-local persistence. Preserve the current layout as the default/fallback and keep existing appearance mode independent.

Agreed design collection: <expand the full descriptions of Studio, Dashboard, Board, Terminal, Minimal, and Cyber from SKILL.md, adapting to this application's actual content and the user's choices>.

## Context and relevant files

Active project root: <current workspace root>.
Read and follow <actual project instruction files>. Follow the project's Codex/Claude role and approval requirements. This draft is not permission to implement.

Current framework, shared data/state, serving/build behavior, URL, and relevant constraints: <verified project facts>.

Files to inspect/change: <actual project-relative paths for the application shell, theme/preferences, data derivation, shared actions/detail view, lifecycle effects, styles, tests, and build configuration>. New presentation components may be added within <approved UI source directory>.

## Implementation steps

1. Introduce a typed registry of stable layout IDs, labels, descriptions, and inert accurate previews. Validate the independent saved layout preference and handle missing, unknown, and inaccessible storage safely.
2. Add the accessible gallery, explicit apply action, selected state, keyboard focus/close/return behavior, and responsive layout. Keep preview components free of application actions and lifecycle effects.
3. Implement the agreed designs with real structural differences. Keep shared fetching, derivation, selection, business/approval handlers, and lifecycle tracking above the selected layout. Reuse one full-detail/action view.
4. Preserve all features, task/status accuracy, current context, unseen-report state, approval safeguards, and factual announcements while switching. Adapt animation targets without replaying events.
5. Support all current appearance modes, logo variants, empty/loading/error/attention states, keyboard access, contrast, reduced motion, and phone layouts.
6. Build the actual served frontend. Keep artifacts and fixtures within the project. Do not alter unrelated rules, history, backend behavior, or configuration. Never approve a live task during testing.

## Acceptance criteria

- All agreed designs appear in an accurate gallery and genuinely change the site's layout/style.
- The default stays available, the applied design persists after reload, and invalid/unavailable storage has a safe fallback.
- Every design exposes the same data and full application capabilities with accurate state.
- Applying a design does not send a task, change data/status, lose detail context, or replay events.
- Appearance remains independent; desktop and phone layouts work with keyboard access and reduced motion.

## Validation

Run <actual type check, build, and relevant existing test commands>. Add only meaningful behavioral coverage for new logic when needed, such as exclusive grouping and preference/shared-state handling.

Inspect every design at desktop and narrow widths in existing light/dark modes. Check gallery/apply/close/focus, reload persistence, default fallback, detail access, empty/error/attention states, and appearance independence. Use labelled project-local simulated fixtures if needed. Verify that switching causes no send request, task writes, or lifecycle replay. Distinguish actual checks from unavailable checks.

## Report and stop

Publish a complete matching report to report/<task-id>-report.md with task ID, Source prompt: prompt/<task-id>.md, outcome, changed files, implemented designs, preference/shared-behavior details, actual validation, unavailable checks, and blockers/questions. Publish atomically using a temporary file inside the project when possible.

If material requirements are missing, report them and stop dependent work. Stop after reporting; wait for a separately approved next task.

This is DRAFT - DO NOT EXECUTE. Execute only after this exact task is approved and published through the established workflow with the user's actual authorization.
