import { ArrowUpRight } from 'lucide-react'
import { AgentDesk, OwnerCard, Route } from '../components/Studio.tsx'
import { FocusBrief, History } from '../components/Desk.tsx'
import { DELIVERY_IDLE, LoadState, type Workspace } from '../components/Shell.tsx'

// The original Studio layout: owner above the two agent desks, focus and history alongside. Default template.
export function StudioTemplate({ ws }: { ws: Workspace }) {
  const { state, error, view, tasks, now, fresh, theme, open, bind } = ws
  const focus = view.focus
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5 px-5 pb-6 pt-8 sm:px-8">
        <div className="min-w-0">
          <span className="eyebrow">Your workspace</span>
          <h1 className="m-0 mt-2 font-display text-[26px] font-medium leading-tight tracking-[-.02em] sm:text-[30px]">
            {state ? view.headline : error ? 'Can’t reach the panel right now.' : 'Opening your studio…'}
          </h1>
        </div>
        {focus && ws.primary ? (
          <button type="button" onClick={() => open(focus)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-action px-5 text-[14px] font-semibold text-action-ink transition hover:bg-action-hover active:scale-[.98]">
            {ws.primary} <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="grid flex-1 items-start gap-6 px-5 pb-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <main className="min-w-0 rounded-3xl bg-soft p-4 sm:p-7" aria-label="Team floor">
          {!state ? <LoadState ws={ws} className="min-h-[320px]" /> : (
            <>
              <OwnerCard ref={bind.owner} view={view.owner} />
              <Route />
              <div className="grid gap-4 md:grid-cols-2 md:gap-5">
                <AgentDesk ref={bind.codex} agent="codex" view={view.codex} theme={theme} onOpen={open} />
                <AgentDesk ref={bind.claude} agent="claude" view={view.claude} theme={theme} onOpen={open} fresh={view.claude.task ? fresh.has(view.claude.task.id) : false} />
              </div>
              <p ref={bind.delivery} className="mb-0 mt-5 text-center text-[13px] text-sub" aria-live="polite">
                {ws.delivery || DELIVERY_IDLE}
              </p>
            </>
          )}
        </main>

        <aside className="min-w-0 space-y-8 lg:pt-1" aria-label="Your desk">
          <FocusBrief task={focus} onOpen={open} />
          <div className="h-px bg-line" />
          <History tasks={tasks} now={now} fresh={fresh} onOpen={open} />
        </aside>
      </div>
    </>
  )
}
