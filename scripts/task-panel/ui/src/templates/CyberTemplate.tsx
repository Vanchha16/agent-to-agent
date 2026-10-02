import { useMemo, type ReactNode } from 'react'
import { ArrowUpRight, UserRound } from 'lucide-react'
import { AgentLogo } from '../components/Studio.tsx'
import { History, Stages, explain } from '../components/Desk.tsx'
import { DELIVERY_IDLE, LoadState, extraLabels, type BindRef, type Workspace } from '../components/Shell.tsx'
import { COLUMNS, STATE_LABEL, groupBoard, nextStep } from '../lib/derive.ts'
import { ago } from '../lib/hooks.ts'
import type { Task } from '../lib/types.ts'

const TONE: Record<Task['state'], string> = {
  draft: 'tone-ready', malformed: 'tone-attention', superseded: '', published: 'tone-waiting', working: 'tone-working', report: 'tone-report', blocked: 'tone-attention',
}
const MODULE_LIMIT = 5

// Angular panel: the outer layer draws the 1px border, the inner layer the surface (both share the clip shape).
// Grid placement and the optional glow sit on a wrapper, because a clip-path would cut off a drop shadow.
function Module({ title, code, children, className = '', accent = false }: { title: string; code?: string; children: ReactNode; className?: string; accent?: boolean }) {
  const id = `cy-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <div className={`min-w-0 ${className}`}>
      <section aria-labelledby={id} className={`cy-panel ${accent ? 'cy-panel-accent' : ''}`}>
        <div className="cy-inner flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 px-5 pt-4">
            <h2 id={id} className="cy-title m-0 text-[12px] font-semibold uppercase tracking-[.2em] text-ink-2">{title}</h2>
            {code ? <span className="font-mono text-[11px] tracking-[.12em] text-sub">{code}</span> : null}
          </header>
          <div className="flex-1 px-5 pb-5 pt-3">{children}</div>
        </div>
      </section>
    </div>
  )
}

function TaskLines({ tasks, empty, fresh, now, onOpen }: { tasks: Task[]; empty: string; fresh: Set<string>; now: number; onOpen: (task: Task) => void }) {
  if (!tasks.length) return <p className="m-0 text-[13px] text-sub">{empty}</p>
  return (
    <ul className="m-0 list-none space-y-1.5 p-0">
      {tasks.slice(0, MODULE_LIMIT).map(task => {
        const labels = extraLabels(task, fresh)
        return (
          <li key={task.id}>
            <button type="button" onClick={() => onOpen(task)} data-task-id={task.id}
              className={`${TONE[task.state]} cy-line flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors`}>
              <span className="dot mt-[7px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{task.title}</span>
                <span className="block truncate text-[12px] text-sub">{STATE_LABEL[task.state]}{labels.length ? ` · ${labels.join(' · ')}` : ''} · {ago(task.updatedAt, now)}</span>
              </span>
            </button>
          </li>
        )
      })}
      {tasks.length > MODULE_LIMIT ? <li className="px-3 pt-1 text-[12px] text-sub">+{tasks.length - MODULE_LIMIT} more in the full log below</li> : null}
    </ul>
  )
}

function CrewRow({ bind, tone, name, role, status, logo }: { bind: BindRef; tone: string; name: string; role: string; status: string; logo: ReactNode }) {
  return (
    <li ref={bind} className={`${tone} cy-crew flex min-w-0 items-center gap-3 px-3 py-2.5`}>
      {logo}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2"><strong className="text-[14px] font-semibold">{name}</strong><span className="text-[10.5px] font-semibold uppercase tracking-[.16em] text-sub">{role}</span></span>
        <span className="flex items-center gap-2 text-[12.5px] text-ink-2"><span className="dot" /><span className="truncate">{status}</span></span>
      </span>
    </li>
  )
}

export function CyberTemplate({ ws }: { ws: Workspace }) {
  const { state, view, tasks, now, fresh, theme, open, bind } = ws
  const groups = useMemo(() => groupBoard(tasks), [tasks])
  const focus = view.focus
  const step = focus ? nextStep(focus) : null

  return (
    <main className="cy-floor flex-1 px-5 pb-12 pt-7 sm:px-8" aria-label="Command center">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="cy-title m-0 text-[11.5px] font-semibold uppercase tracking-[.28em] text-sub">Command center · {state?.project ?? 'project'}</p>
          <p className="m-0 mt-1 text-[13px] text-sub">Live from the plan and report files — nothing here is simulated.</p>
        </div>
      </div>

      {!state ? (
        <Module title="Mission" code="STANDBY" accent><LoadState ws={ws} className="min-h-[240px]" /></Module>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <Module title="Mission" code={focus ? STATE_LABEL[focus.state].toUpperCase() : 'CLEAR'} accent className="cy-glow lg:col-span-8 lg:row-span-2">
            <h1 className="cy-title m-0 font-display text-[24px] font-semibold uppercase leading-tight tracking-[.04em] sm:text-[30px]">{view.headline}</h1>
            {focus ? (
              <div className="mt-6">
                <p className="m-0 text-[17px] font-medium leading-snug text-ink">{focus.title}</p>
                <p className="m-0 mt-1 font-mono text-[11.5px] text-sub">{focus.id}</p>
                <p className="m-0 mt-3 max-w-[62ch] text-[14px] text-ink-2">{explain(focus)}</p>
                <div className="mt-6"><Stages task={focus} /></div>
                <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
                  <button type="button" onClick={() => open(focus)} className="cy-cta inline-flex min-h-11 items-center gap-2 bg-action px-5 text-[13.5px] font-semibold uppercase tracking-[.08em] text-action-ink transition hover:bg-action-hover">
                    {ws.primary ?? 'Open details'} <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                  {step?.who ? <p className="m-0 text-[13px] text-sub">Next: <strong className="font-semibold text-ink">{step.who}</strong> · {step.what}</p> : null}
                </div>
                {focus.state === 'draft' ? <p className="m-0 mt-3 text-[12.5px] text-sub">Approval happens in the review panel with Send to Claude, or through Auto-send only for plans created after you turned it on.</p> : null}
              </div>
            ) : <p className="mb-0 mt-5 text-[14px] text-sub">No mission on deck. When Codex saves a plan in prompt/drafts/, it appears here for your approval.</p>}
            <p ref={bind.delivery} className="cy-feed mb-0 mt-7 border-t border-line pt-3 font-mono text-[12px] text-sub">{ws.delivery || DELIVERY_IDLE}</p>
          </Module>

          <Module title="Crew" code="3 SEATS" className="lg:col-span-4">
            <ul className="m-0 list-none space-y-2 p-0">
              <CrewRow bind={bind.owner} tone={view.owner.pending ? 'tone-ready' : ''} name="You" role="Owner" status={view.owner.line}
                logo={<span className="agent-logo grid size-8 shrink-0 place-items-center rounded-[3px] border border-line bg-surface" aria-hidden="true"><UserRound size={16} strokeWidth={1.8} /></span>} />
              <CrewRow bind={bind.codex} tone={`tone-${view.codex.tone}`} name="Codex" role="Planner" status={view.codex.status} logo={<AgentLogo agent="codex" theme={theme} size={32} square />} />
              <CrewRow bind={bind.claude} tone={`tone-${view.claude.tone}`} name="Claude" role="Builder" status={view.claude.status} logo={<AgentLogo agent="claude" theme={theme} size={32} square />} />
            </ul>
          </Module>

          <Module title="Counts" code="FROM FILES" className="lg:col-span-4">
            <dl className="m-0 grid grid-cols-2 gap-2">
              {COLUMNS.map(column => (
                <div key={column.id} className="cy-stat px-3 py-2.5">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-[.16em] text-sub">{column.label}</dt>
                  <dd className="m-0 font-display text-[26px] font-semibold leading-tight tabular-nums text-ink">{groups[column.id].length}</dd>
                </div>
              ))}
            </dl>
          </Module>

          <Module title="Queue · needs you" code={String(groups['needs-you'].length).padStart(2, '0')} className="lg:col-span-4">
            <TaskLines tasks={groups['needs-you']} empty="Queue clear. Nothing needs your decision." fresh={fresh} now={now} onOpen={open} />
          </Module>
          <Module title="In flight · with Claude" code={String(groups['with-claude'].length).padStart(2, '0')} className="lg:col-span-4">
            <TaskLines tasks={groups['with-claude']} empty="Nothing in flight. A plan moves here once you send it." fresh={fresh} now={now} onOpen={open} />
          </Module>
          <Module title="Reports" code={String(groups.reports.length).padStart(2, '0')} className="lg:col-span-4">
            <TaskLines tasks={groups.reports} empty="No reports yet." fresh={fresh} now={now} onOpen={open} />
          </Module>

          <Module title="Full log" code={`${tasks.length} FILES`} className="lg:col-span-12">
            <div className="max-w-3xl"><History tasks={tasks} now={now} fresh={fresh} onOpen={open} /></div>
          </Module>
        </div>
      )}
    </main>
  )
}
