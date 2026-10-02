import { useMemo, useState, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { AgentLogo } from '../components/Studio.tsx'
import { Stages, explain } from '../components/Desk.tsx'
import { DELIVERY_IDLE, LoadState, extraLabels, stamp, type Workspace } from '../components/Shell.tsx'
import { COLUMNS, STATE_LABEL, byNewest, groupBoard, matchesFilter, type Filter } from '../lib/derive.ts'
import { ago } from '../lib/hooks.ts'
import type { Task } from '../lib/types.ts'

const TAG: Record<Task['state'], [string, string]> = {
  draft: ['PLAN', 'text-ink'], malformed: ['FIX', 'text-bad'], superseded: ['ARCHIVED', 'text-sub'], published: ['SENT', 'text-info'],
  working: ['ACK', 'text-warn'], report: ['REPORT', 'text-ok'], blocked: ['BLOCKED', 'text-bad'],
}
const FILTERS: Array<[Filter, string]> = [['all', 'all'], ['needs-you', 'needs-you'], ['with-claude', 'with-claude'], ['done', 'done']]
const PREVIEW = 14

function Panel({ title, meta, children, className = '' }: { title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`term-panel min-w-0 border border-line-strong bg-surface ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line-strong bg-sunk px-4 py-2">
        <h2 className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[.14em] text-ink">{title}</h2>
        {meta ? <span className="min-w-0 truncate font-mono text-[11.5px] text-sub">{meta}</span> : null}
      </header>
      {children}
    </section>
  )
}

export function TerminalTemplate({ ws }: { ws: Workspace }) {
  const { state, view, tasks, now, fresh, theme, open, bind } = ws
  const [filter, setFilter] = useState<Filter>('all')
  const [all, setAll] = useState(false)
  const groups = useMemo(() => groupBoard(tasks), [tasks])
  const log = useMemo(() => byNewest(tasks).filter(task => matchesFilter(task, filter)), [tasks, filter])
  const visible = all ? log : log.slice(0, PREVIEW)
  const focus = view.focus

  return (
    <main className="flex-1 space-y-5 px-5 pb-10 pt-6 sm:px-8" aria-label="Terminal workspace">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[12px] uppercase tracking-[.16em] text-sub">workspace / {state?.project ?? 'project'}</p>
          <h1 className="m-0 mt-1.5 font-display text-[21px] font-semibold leading-snug sm:text-[24px]">
            {state ? view.headline : ws.error ? 'Can’t reach the panel right now.' : 'Reading project files…'}
          </h1>
        </div>
        {focus && ws.primary ? (
          <button type="button" onClick={() => open(focus)}
            className="inline-flex min-h-10 items-center gap-2 border border-action bg-action px-4 font-mono text-[13px] font-semibold text-action-ink transition hover:bg-action-hover">
            {ws.primary} <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {!state ? <Panel title="Status"><LoadState ws={ws} /></Panel> : (
        <>
          <Panel title="Status" meta="derived from prompt/ and report/">
            <dl className="m-0 grid gap-px bg-line font-mono text-[13px] sm:grid-cols-3">
              <div ref={bind.owner} className={`${view.owner.pending ? 'tone-ready' : ''} flex min-w-0 items-start gap-3 bg-surface px-4 py-3`}>
                <span className="grid size-6 shrink-0 place-items-center rounded-[3px] border border-line bg-sunk text-[11px] font-bold" aria-hidden="true">U</span>
                <div className="min-w-0"><dt className="text-[11.5px] uppercase tracking-[.12em] text-sub">you</dt><dd className="m-0 flex items-center gap-2 text-ink"><span className="dot" />{view.owner.line}</dd></div>
              </div>
              {(['codex', 'claude'] as const).map(agent => (
                <div key={agent} ref={agent === 'codex' ? bind.codex : bind.claude} className={`tone-${view[agent].tone} flex min-w-0 items-start gap-3 bg-surface px-4 py-3`}>
                  <AgentLogo agent={agent} theme={theme} size={24} square />
                  <div className="min-w-0"><dt className="text-[11.5px] uppercase tracking-[.12em] text-sub">{agent}</dt><dd className="m-0 flex items-center gap-2 text-ink"><span className="dot" />{view[agent].status}</dd></div>
                </div>
              ))}
            </dl>
            <p ref={bind.delivery} className="m-0 border-t border-line-strong px-4 py-2 font-mono text-[12px] text-sub">{ws.delivery || DELIVERY_IDLE}</p>
          </Panel>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Panel title="Task files" meta="latest change per task · newest first">
              <div className="flex flex-wrap gap-x-1 gap-y-1 border-b border-line px-3 py-2" role="group" aria-label="Filter task files">
                {FILTERS.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setAll(false) }}
                    className={`min-h-8 px-2.5 font-mono text-[12px] ${filter === value ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-soft'}`}>{label}</button>
                ))}
              </div>
              {log.length === 0 ? (
                <p className="m-0 px-4 py-6 font-mono text-[12.5px] text-sub">{filter === 'all' ? 'No task files yet. Codex’s first plan in prompt/drafts/ appears here.' : 'No task files match this filter.'}</p>
              ) : (
                <ol className="m-0 list-none p-0">
                  {visible.map(task => {
                    const [tag, color] = TAG[task.state]
                    const labels = extraLabels(task, fresh)
                    return (
                      <li key={task.id} className="border-b border-line last:border-b-0">
                        <button type="button" onClick={() => open(task)} data-task-id={task.id}
                          className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-2.5 text-left font-mono text-[12.5px] hover:bg-soft sm:grid-cols-[130px_76px_minmax(0,1fr)]">
                          <time dateTime={new Date(task.updatedAt).toISOString()} className="text-sub">{stamp(task.updatedAt)}</time>
                          <span className={`font-semibold ${color}`}>{tag}</span>
                          <span className="col-span-2 min-w-0 sm:col-span-1">
                            <span className="block truncate font-sans text-[13.5px] font-medium text-ink">{task.title}</span>
                            <span className="block truncate text-[11.5px] text-sub">{STATE_LABEL[task.state]}{labels.length ? ` · ${labels.join(' · ')}` : ''} · {ago(task.updatedAt, now)}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )}
              {log.length > PREVIEW ? (
                <button type="button" onClick={() => setAll(value => !value)} className="min-h-10 w-full border-t border-line font-mono text-[12px] text-ink-2 hover:bg-soft">
                  {all ? 'show fewer' : `show all ${log.length}`}
                </button>
              ) : null}
            </Panel>

            <div className="space-y-5">
              <Panel title="Focus">
                {focus ? (
                  <div className="px-4 py-4">
                    <p className="m-0 font-medium leading-snug">{focus.title}</p>
                    <p className="m-0 mt-1 font-mono text-[11.5px] text-sub">{focus.id}</p>
                    <p className="m-0 mt-3 text-[13px] text-sub">{explain(focus)}</p>
                    <div className="mt-4"><Stages task={focus} compact /></div>
                    <button type="button" onClick={() => open(focus)} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 border border-line-strong font-mono text-[12.5px] font-semibold hover:bg-soft">
                      {focus.state === 'draft' ? 'review full plan' : focus.reportText ? 'read the report' : 'open details'} <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                ) : <p className="m-0 px-4 py-5 text-[13px] text-sub">Nothing on your desk. When Codex saves a plan in prompt/drafts/, it lands here.</p>}
              </Panel>
              <Panel title="Counts">
                <dl className="m-0 grid grid-cols-2 gap-px bg-line font-mono">
                  {COLUMNS.map(column => (
                    <div key={column.id} className="bg-surface px-4 py-3">
                      <dt className="text-[11px] uppercase tracking-[.12em] text-sub">{column.label}</dt>
                      <dd className="m-0 text-[20px] font-semibold tabular-nums">{groups[column.id].length}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
