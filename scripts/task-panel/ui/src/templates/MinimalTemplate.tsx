import { useMemo } from 'react'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { History, StateBadge, Stages, explain } from '../components/Desk.tsx'
import { DELIVERY_IDLE, LoadState, attentionLabels, extraLabels, type Workspace } from '../components/Shell.tsx'
import { STATE_LABEL, groupBoard } from '../lib/derive.ts'
import { ago } from '../lib/hooks.ts'

export function MinimalTemplate({ ws }: { ws: Workspace }) {
  const { state, view, tasks, now, fresh, open, bind } = ws
  const focus = view.focus
  const others = useMemo(() => groupBoard(tasks)['needs-you'].filter(task => task.id !== focus?.id), [tasks, focus])

  return (
    <main className="mx-auto w-full max-w-[680px] flex-1 px-5 pb-16 pt-10 sm:pt-14" aria-label="Focused workspace">
      <p className="eyebrow m-0">{focus?.state === 'draft' ? 'Your next decision' : 'Right now'}</p>
      <h1 className="m-0 mt-3 font-display text-[30px] font-normal leading-[1.15] tracking-[-.015em] sm:text-[38px]">
        {state ? view.headline : ws.error ? 'Can’t reach the panel right now.' : 'One moment…'}
      </h1>

      {!state ? <LoadState ws={ws} className="mt-8 min-h-[200px] border-y border-line" /> : (
        <>
          <ul className="m-0 mt-8 flex list-none flex-col gap-2 border-y border-line p-0 py-3.5 text-[13.5px] sm:flex-row sm:flex-wrap sm:gap-x-6" aria-label="Status">
            <li ref={bind.owner} className={`${view.owner.pending ? 'tone-ready' : ''} flex min-w-0 items-center gap-2`}><span className="dot" /><strong className="font-semibold">You</strong><span className="text-sub">{view.owner.pending ? `${view.owner.pending} to approve` : 'nothing to approve'}</span></li>
            <li ref={bind.codex} className={`tone-${view.codex.tone} flex min-w-0 items-center gap-2`}><span className="dot" /><strong className="font-semibold">Codex</strong><span className="truncate text-sub">{view.codex.status}</span></li>
            <li ref={bind.claude} className={`tone-${view.claude.tone} flex min-w-0 items-center gap-2`}><span className="dot" /><strong className="font-semibold">Claude</strong><span className="truncate text-sub">{view.claude.status}</span></li>
          </ul>

          {focus ? (
            <section className="mt-10" aria-label="Current task">
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge task={focus} />
                {attentionLabels(focus, fresh).map(label => <span key={label} className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-medium text-ink">{label}</span>)}
              </div>
              <h2 className="m-0 mt-4 font-display text-[22px] font-medium leading-snug">{focus.title}</h2>
              <p className="m-0 mt-2 max-w-[56ch] text-[15px] text-sub">{explain(focus)}</p>
              <div className="mt-6"><Stages task={focus} compact /></div>
              <button type="button" onClick={() => open(focus)}
                className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-action px-6 text-[15px] font-semibold text-action-ink transition hover:bg-action-hover">
                {ws.primary ?? 'Open details'} <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            </section>
          ) : (
            <p className="mt-10 text-[15px] text-sub">Nothing is waiting. When Codex saves a plan in prompt/drafts/, it appears here for your approval.</p>
          )}

          <p ref={bind.delivery} className="m-0 mt-10 text-[13px] text-sub">{ws.delivery || DELIVERY_IDLE}</p>

          {others.length ? (
            <section className="mt-10" aria-labelledby="min-also">
              <h2 id="min-also" className="eyebrow m-0">Also needs you</h2>
              <ul className="m-0 mt-2 list-none p-0">
                {others.map(task => (
                  <li key={task.id} className="border-b border-line">
                    <button type="button" onClick={() => open(task)} className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left hover:text-ink-2">
                      <span className="min-w-0"><span className="block truncate font-medium">{task.title}</span><span className="block text-[12.5px] text-sub">{[STATE_LABEL[task.state], ...extraLabels(task, fresh)].join(' · ')} · {ago(task.updatedAt, now)}</span></span>
                      <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-sub" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <details className="minimal-history group mt-12 border-t border-line pt-2">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium">
              All plans and reports <span className="flex items-center gap-2 text-[13px] font-normal text-sub">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}<ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" /></span>
            </summary>
            <div className="pb-4 pt-2"><History tasks={tasks} now={now} fresh={fresh} onOpen={open} /></div>
          </details>
        </>
      )}
    </main>
  )
}
