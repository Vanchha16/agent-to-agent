import { useMemo, useState } from 'react'
import { ArrowUpRight, UserRound } from 'lucide-react'
import { AgentLogo } from '../components/Studio.tsx'
import { DELIVERY_IDLE, LoadState, attentionLabels, type Workspace } from '../components/Shell.tsx'
import { COLUMNS, STATE_LABEL, groupBoard, type Column } from '../lib/derive.ts'
import { ago } from '../lib/hooks.ts'
import type { Task } from '../lib/types.ts'

const TONE: Record<Task['state'], string> = {
  draft: 'tone-ready', malformed: 'tone-attention', superseded: '', published: 'tone-waiting', working: 'tone-working', report: 'tone-report', blocked: 'tone-attention',
}
const COLUMN_ACCENT: Record<Column, string> = { 'needs-you': 'border-t-warn', 'with-claude': 'border-t-info', reports: 'border-t-ok', archived: 'border-t-line-strong' }
const ARCHIVE_PREVIEW = 4

function Card({ task, fresh, now, onOpen }: { task: Task; fresh: Set<string>; now: number; onOpen: (task: Task) => void }) {
  const labels = attentionLabels(task, fresh)
  return (
    <li>
      <button type="button" onClick={() => onOpen(task)} data-task-id={task.id}
        className={`${TONE[task.state]} board-card group flex w-full flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 text-left shadow-desk transition hover:-translate-y-px hover:border-line-strong`}>
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-sub"><span className="dot" />{STATE_LABEL[task.state]}</span>
        <span className="font-medium leading-snug text-ink">{task.title}</span>
        {task.state === 'working' ? <span className="working-bar" role="presentation" /> : null}
        {labels.length ? (
          <span className="flex flex-wrap gap-1">
            {labels.map(label => <span key={label} className={`rounded-full px-2 py-px text-[11px] font-semibold ${label === 'New' ? 'bg-action text-action-ink' : 'bg-warn-soft text-ink'}`}>{label}</span>)}
          </span>
        ) : null}
        <span className="flex items-center justify-between gap-2 text-[11.5px] text-sub">
          <span className="min-w-0 truncate font-mono">{task.id}</span>
          <span className="shrink-0">{ago(task.updatedAt, now)}</span>
        </span>
      </button>
    </li>
  )
}

export function BoardTemplate({ ws }: { ws: Workspace }) {
  const { state, view, tasks, now, fresh, theme, open, bind } = ws
  const groups = useMemo(() => groupBoard(tasks), [tasks])
  const [picked, setPicked] = useState<Column | null>(null)
  const [archiveAll, setArchiveAll] = useState(false)
  // On phones one column shows at a time; start on the first column that has something in it.
  const shown: Column = picked ?? COLUMNS.find(column => column.id !== 'archived' && groups[column.id].length)?.id ?? 'needs-you'
  const focus = view.focus

  return (
    <main className="flex-1 px-5 pb-10 pt-7 sm:px-8" aria-label="Task board">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <span className="eyebrow">Board</span>
          <h1 className="m-0 mt-1.5 font-display text-[24px] font-semibold leading-tight tracking-[-.015em] sm:text-[27px]">
            {state ? view.headline : ws.error ? 'Can’t reach the panel right now.' : 'Setting up the board…'}
          </h1>
          {state ? <p ref={bind.delivery} className="m-0 mt-2 text-[13px] text-sub">{ws.delivery || DELIVERY_IDLE}</p> : null}
        </div>
        {focus && ws.primary ? (
          <button type="button" onClick={() => open(focus)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 text-[14px] font-semibold text-action-ink transition hover:bg-action-hover">
            {ws.primary} <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {!state ? <LoadState ws={ws} className="mt-6 rounded-2xl border border-dashed border-line-strong" /> : (
        <>
          <ul className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0" aria-label="Who is doing what">
            <li ref={bind.owner} className={`${view.owner.pending ? 'tone-ready' : ''} flex min-w-0 items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-4`}>
              <span className="grid size-6 place-items-center rounded-full bg-action text-action-ink" aria-hidden="true"><UserRound size={13} strokeWidth={2} /></span>
              <span className="min-w-0 text-[13px]"><strong className="font-semibold">You</strong> <span className="text-sub">· {view.owner.line}</span></span>
            </li>
            {(['codex', 'claude'] as const).map(agent => (
              <li key={agent} ref={agent === 'codex' ? bind.codex : bind.claude} className={`tone-${view[agent].tone} flex min-w-0 items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-4`}>
                <AgentLogo agent={agent} theme={theme} size={24} />
                <span className="min-w-0 text-[13px]"><strong className="font-semibold">{agent === 'codex' ? 'Codex' : 'Claude'}</strong> <span className="text-sub">· {view[agent].status}</span></span>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid grid-cols-2 gap-1.5 md:hidden" role="group" aria-label="Choose a column">
            {COLUMNS.map(column => (
              <button key={column.id} type="button" aria-pressed={shown === column.id} onClick={() => setPicked(column.id)}
                className={`flex min-h-10 items-center justify-between gap-2 rounded-lg border px-3 text-[13px] font-medium ${shown === column.id ? 'border-action bg-action text-action-ink' : 'border-line bg-surface text-ink-2'}`}>
                {column.label}<span className="tabular-nums opacity-80">{groups[column.id].length}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 grid items-start gap-4 md:mt-7 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map(column => {
              const list = groups[column.id]
              const visible = column.id === 'archived' && !archiveAll ? list.slice(0, ARCHIVE_PREVIEW) : list
              return (
                <section key={column.id} aria-labelledby={`col-${column.id}`}
                  className={`${shown === column.id ? 'flex' : 'hidden'} min-w-0 flex-col rounded-2xl border-t-[3px] bg-soft p-3 md:flex ${COLUMN_ACCENT[column.id]}`}>
                  <header className="px-1.5 pb-3 pt-1">
                    <h2 id={`col-${column.id}`} className="m-0 flex items-center justify-between gap-2 text-[14px] font-semibold">
                      {column.label}<span className="rounded-full bg-surface px-2 py-px text-[12px] tabular-nums text-sub">{list.length}</span>
                    </h2>
                    <p className="m-0 mt-0.5 text-[12px] leading-snug text-sub">{column.hint}</p>
                  </header>
                  {list.length === 0 ? (
                    <p className="m-0 rounded-xl border border-dashed border-line-strong px-3.5 py-5 text-center text-[12.5px] text-sub">{column.empty}</p>
                  ) : (
                    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                      {visible.map(task => <Card key={task.id} task={task} fresh={fresh} now={now} onOpen={open} />)}
                    </ul>
                  )}
                  {list.length > visible.length || (column.id === 'archived' && archiveAll && list.length > ARCHIVE_PREVIEW) ? (
                    <button type="button" onClick={() => setArchiveAll(value => !value)} className="mt-2 min-h-9 text-[12.5px] font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:decoration-current">
                      {archiveAll ? 'Show fewer' : `Show all ${list.length}`}
                    </button>
                  ) : null}
                </section>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
