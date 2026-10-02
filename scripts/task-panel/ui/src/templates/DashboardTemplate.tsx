import { useMemo, useState } from 'react'
import { ArrowUpRight, Archive, Bot, CircleAlert, FileCheck2, LayoutGrid, ListChecks, UserRound } from 'lucide-react'
import { AgentLogo } from '../components/Studio.tsx'
import { StateBadge } from '../components/Desk.tsx'
import { DELIVERY_IDLE, LoadState, attentionLabels, type Workspace } from '../components/Shell.tsx'
import { COLUMNS, boardColumn, byNewest, groupBoard, nextStep, type Column } from '../lib/derive.ts'
import { ago } from '../lib/hooks.ts'
import type { Task } from '../lib/types.ts'

type TableFilter = 'all' | Column

const TILE_ICON: Record<Column, typeof Bot> = { 'needs-you': CircleAlert, 'with-claude': Bot, reports: FileCheck2, archived: Archive }
const TILE_TONE: Record<Column, string> = { 'needs-you': 'tone-attention', 'with-claude': 'tone-waiting', reports: 'tone-report', archived: '' }

function jump(id: string, reduce: boolean) {
  const section = document.getElementById(id)
  if (!section) return
  section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  section.querySelector<HTMLElement>('[data-jump-target]')?.focus({ preventScroll: true })
}

function Tags({ task, fresh }: { task: Task; fresh: Set<string> }) {
  const labels = attentionLabels(task, fresh)
  if (!labels.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map(label => (
        <span key={label} className={`rounded px-1.5 py-px text-[11px] font-semibold ${label === 'New' ? 'bg-action text-action-ink' : 'bg-warn-soft text-ink'}`}>{label}</span>
      ))}
    </span>
  )
}

export function DashboardTemplate({ ws }: { ws: Workspace }) {
  const { state, view, tasks, now, fresh, theme, open, bind, reduce } = ws
  const groups = useMemo(() => groupBoard(tasks), [tasks])
  const [filter, setFilter] = useState<TableFilter>('all')
  const rows = useMemo(() => (filter === 'all' ? byNewest(tasks) : groups[filter]), [filter, groups, tasks])
  const focus = view.focus

  const nav: Array<[string, string, typeof Bot, number | null]> = [
    ['dash-overview', 'Overview', LayoutGrid, null],
    ['dash-agents', 'Agents', UserRound, null],
    ['dash-needs', 'Needs you', CircleAlert, groups['needs-you'].length],
    ['dash-tasks', 'All tasks', ListChecks, tasks.length],
  ]

  function showColumn(column: Column) {
    setFilter(column)
    jump('dash-tasks', reduce)
  }

  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[212px_minmax(0,1fr)]">
      <nav aria-label="Dashboard sections" className="dash-rail min-w-0 border-b border-line bg-surface lg:border-b-0 lg:border-r">
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-2 lg:sticky lg:top-0 lg:flex-col lg:p-4">
          {(state ? nav : nav.slice(0, 1)).map(([id, label, Icon, count]) => (
            <li key={id} className="shrink-0">
              <button type="button" onClick={() => jump(id, reduce)}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-soft hover:text-ink">
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" className="text-sub" />
                <span className="flex-1 whitespace-nowrap">{label}</span>
                {count !== null ? <span className="rounded bg-soft px-1.5 text-[11.5px] font-semibold tabular-nums text-sub">{count}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <p className="m-0 hidden px-7 pb-6 text-[12px] leading-relaxed text-sub lg:block">Every number here is counted from the plan and report files in this project.</p>
      </nav>

      <main className="min-w-0 space-y-9 px-5 pb-10 pt-6 sm:px-8" aria-label="Dashboard">
        <section id="dash-overview" aria-labelledby="dash-overview-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow m-0">Overview</p>
              <h1 id="dash-overview-title" data-jump-target tabIndex={-1} className="m-0 mt-1.5 font-display text-[22px] font-semibold leading-tight tracking-[-.01em] sm:text-[25px]">
                {state ? view.headline : ws.error ? 'Can’t reach the panel right now.' : 'Loading the dashboard…'}
              </h1>
            </div>
            {focus && ws.primary ? (
              <button type="button" onClick={() => open(focus)}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-action px-4 text-[13.5px] font-semibold text-action-ink transition hover:bg-action-hover">
                {ws.primary} <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {!state ? <LoadState ws={ws} className="mt-5 rounded-lg border border-line bg-surface" /> : (
            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {COLUMNS.map(column => {
                const Icon = TILE_ICON[column.id]
                const count = groups[column.id].length
                return (
                  <button key={column.id} type="button" onClick={() => showColumn(column.id)} aria-controls="dash-table"
                    className={`${count ? TILE_TONE[column.id] : ''} flex min-w-0 flex-col items-start gap-1 rounded-lg border border-line bg-surface p-4 text-left shadow-desk transition-colors hover:border-line-strong`}>
                    <span className="flex w-full items-center gap-2 text-[12.5px] font-medium text-sub">
                      <span className="dot" />{column.label}
                      <Icon size={15} strokeWidth={1.8} aria-hidden="true" className="ml-auto" />
                    </span>
                    <span className="font-display text-[28px] font-semibold leading-none tabular-nums text-ink">{count}</span>
                    <span className="text-[12px] text-sub">{count === 1 ? 'task' : 'tasks'} · show in table</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {state ? (
          <>
            <section id="dash-agents" aria-labelledby="dash-agents-title">
              <h2 id="dash-agents-title" data-jump-target tabIndex={-1} className="eyebrow m-0">Agents and owner</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div ref={bind.owner} className={`${view.owner.pending ? 'tone-ready' : ''} rounded-lg border border-line bg-surface p-4`}>
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-full bg-action text-action-ink" aria-hidden="true"><UserRound size={16} strokeWidth={1.8} /></span>
                    <div className="min-w-0"><p className="m-0 font-semibold leading-tight">You</p><p className="m-0 text-[12px] text-sub">Owner · final approval</p></div>
                  </div>
                  <p className="m-0 mt-3 flex items-center gap-2 text-[13px]"><span className="dot" />{view.owner.line}</p>
                </div>
                {(['codex', 'claude'] as const).map(agent => {
                  const desk = view[agent]
                  return (
                    <div key={agent} ref={agent === 'codex' ? bind.codex : bind.claude} className={`tone-${desk.tone} flex flex-col rounded-lg border border-line bg-surface p-4`}>
                      <div className="flex items-center gap-3">
                        <AgentLogo agent={agent} theme={theme} size={32} />
                        <div className="min-w-0"><p className="m-0 font-semibold leading-tight">{agent === 'codex' ? 'Codex' : 'Claude'}</p><p className="m-0 text-[12px] text-sub">{agent === 'codex' ? 'Planner' : 'Builder'}</p></div>
                      </div>
                      <p className="m-0 mt-3 flex items-center gap-2 text-[13px]"><span className="dot" />{desk.status}</p>
                      {desk.task ? (
                        <button type="button" onClick={() => open(desk.task as Task)} className="mt-2 inline-flex min-h-9 items-center gap-1 self-start text-left text-[13px] font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:decoration-current">
                          {desk.task.title}
                          {fresh.has(desk.task.id) ? <span className="ml-1 rounded bg-action px-1.5 py-px text-[10.5px] font-semibold text-action-ink no-underline">New</span> : null}
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              <p ref={bind.delivery} className="m-0 mt-3 text-[12.5px] text-sub">{ws.delivery || DELIVERY_IDLE}</p>
            </section>

            <section id="dash-needs" aria-labelledby="dash-needs-title">
              <h2 id="dash-needs-title" data-jump-target tabIndex={-1} className="eyebrow m-0">Needs you · {groups['needs-you'].length}</h2>
              {groups['needs-you'].length === 0 ? (
                <p className="mb-0 mt-3 rounded-lg border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-sub">Nothing needs you right now. New plans and reports with questions show up here.</p>
              ) : (
                <ul className="m-0 mt-3 list-none divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface p-0">
                  {groups['needs-you'].map(task => {
                    const step = nextStep(task)
                    return (
                      <li key={task.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="m-0 font-medium leading-snug">{task.title}</p>
                          <p className="m-0 mt-0.5 text-[12.5px] text-sub">{step.who ? `${step.who}: ` : ''}{step.what} · {ago(task.updatedAt, now)}</p>
                        </div>
                        <Tags task={task} fresh={fresh} />
                        <button type="button" onClick={() => open(task)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line-strong px-3 text-[13px] font-medium hover:bg-soft">
                          {task.state === 'draft' ? 'Review plan' : task.reportText ? 'Read report' : 'Open plan'} <ArrowUpRight size={14} aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section id="dash-tasks" aria-labelledby="dash-tasks-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="dash-tasks-title" data-jump-target tabIndex={-1} className="eyebrow m-0">All tasks · {tasks.length}</h2>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Show tasks">
                  {([['all', 'All', tasks.length], ...COLUMNS.map(column => [column.id, column.label, groups[column.id].length])] as Array<[TableFilter, string, number]>).map(([value, label, count]) => (
                    <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                      className={`min-h-8 rounded-md border px-2.5 text-[12.5px] transition-colors ${filter === value ? 'border-action bg-action text-action-ink' : 'border-line bg-surface text-ink-2 hover:bg-soft'}`}>
                      {label} <span className="tabular-nums opacity-75">{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="mb-0 mt-3 rounded-lg border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-sub">
                  {filter === 'all' ? 'No tasks yet. When Codex saves a plan in prompt/drafts/, it appears here.' : COLUMNS.find(column => column.id === filter)?.empty}
                </p>
              ) : (
                <div id="dash-table" className="mt-3 overflow-hidden rounded-lg border border-line bg-surface">
                  <table className="hidden w-full border-collapse text-left text-[13.5px] md:table">
                    <thead className="bg-sunk text-[11.5px] uppercase tracking-[.06em] text-sub">
                      <tr><th scope="col" className="px-4 py-2.5 font-semibold">Task</th><th scope="col" className="px-4 py-2.5 font-semibold">Status</th><th scope="col" className="px-4 py-2.5 font-semibold">Next step</th><th scope="col" className="px-4 py-2.5 text-right font-semibold">Updated</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map(task => {
                        const step = nextStep(task)
                        return (
                          <tr key={task.id} className="align-top hover:bg-sunk">
                            <td className="max-w-0 px-4 py-3">
                              <button type="button" onClick={() => open(task)} className="block max-w-full truncate text-left font-medium text-ink underline decoration-transparent underline-offset-4 hover:decoration-current">{task.title}</button>
                              <span className="block truncate font-mono text-[11.5px] text-sub">{task.id}</span>
                            </td>
                            <td className="px-4 py-3"><div className="flex flex-col items-start gap-1.5"><StateBadge task={task} /><Tags task={task} fresh={fresh} /></div></td>
                            <td className="px-4 py-3 text-ink-2">{step.who ? <strong className="font-semibold text-ink">{step.who}</strong> : null}{step.who ? ' · ' : ''}{step.what}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-sub">{ago(task.updatedAt, now)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <ul className="m-0 list-none divide-y divide-line p-0 md:hidden">
                    {rows.map(task => (
                      <li key={task.id}>
                        <button type="button" onClick={() => open(task)} className="flex w-full flex-col items-start gap-1.5 px-4 py-3 text-left hover:bg-sunk">
                          <span className="font-medium leading-snug">{task.title}</span>
                          <span className="flex flex-wrap items-center gap-1.5"><StateBadge task={task} /><Tags task={task} fresh={fresh} /></span>
                          <span className="text-[12.5px] text-sub">{nextStep(task).what} · {ago(task.updatedAt, now)} · {COLUMNS.find(column => column.id === boardColumn(task))?.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
