import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Markdown } from './Markdown.tsx'
import { StateBadge, Stages, explain } from './Desk.tsx'
import type { Task } from '../lib/types.ts'

interface Props {
  task: Task | null
  open: boolean
  sending: boolean
  error: string | null
  onClose: () => void
  onSend: (task: Task, reviewedHash: string) => void
  onWait: (task: Task) => void
}

function Notice({ tone, title, children }: { tone: 'bad' | 'warn' | 'info'; title?: string; children: ReactNode }) {
  const cls = { bad: 'border-l-bad bg-bad-soft', warn: 'border-l-warn bg-warn-soft', info: 'border-l-info bg-info-soft' }[tone]
  return (
    <div className={`my-3 rounded-lg border border-line border-l-[3px] px-4 py-3 text-[13.5px] text-ink-2 ${cls}`}>
      {title ? <strong className="block text-ink">{title}</strong> : null}
      {children}
    </div>
  )
}

function Document({ title, text }: { title: string; text: string }) {
  const [raw, setRaw] = useState(false)
  return (
    <section className="mt-6" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="eyebrow">{title}</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-line bg-surface" role="group" aria-label={`${title} view`}>
          {(['Formatted', 'Raw text'] as const).map(label => (
            <button key={label} type="button" aria-pressed={(label === 'Raw text') === raw} onClick={() => setRaw(label === 'Raw text')}
              className={`min-h-8 px-3 text-[12px] ${(label === 'Raw text') === raw ? 'bg-soft font-medium text-ink' : 'text-sub hover:text-ink'}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface px-5 py-3">
        {raw ? <pre className="m-0 whitespace-pre-wrap break-words py-2 font-mono text-[13px] leading-relaxed text-ink-2">{text}</pre> : <Markdown source={text} />}
      </div>
    </section>
  )
}

export function TaskDrawer({ task, open, sending, error, onClose, onSend, onWait }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const seen = useRef<{ id: string; hash?: string } | null>(null)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  // Track the exact draft version on screen; if it changes while open, warn before any send.
  useEffect(() => {
    if (!task) return
    const previous = seen.current
    if (previous && previous.id === task.id && previous.hash !== task.draftHash) setChanged(true)
    if (!previous || previous.id !== task.id) setChanged(false)
    seen.current = { id: task.id, hash: task.draftHash }
  }, [task?.id, task?.draftHash])

  useEffect(() => { if (!open) seen.current = null }, [open])

  const isDraft = task?.state === 'draft' && task.draftText !== undefined && Boolean(task.draftHash)

  return (
    <dialog ref={dialog} className="drawer" aria-labelledby="drawer-title" onClose={onClose}
      onClick={event => { if (event.target === dialog.current) onClose() }}>
      {task ? (
        <div className="drawer-panel ml-auto flex h-full w-full max-w-[760px] flex-col overflow-y-auto bg-bg shadow-2xl sm:border-l sm:border-line">
          <header className="sticky top-0 z-10 border-b border-line bg-bg/95 px-5 pb-4 pt-4 backdrop-blur sm:px-8">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p id="drawer-title" className="m-0 font-display text-[19px] font-semibold leading-snug">{task.title}</p>
                <p className="m-0 mt-1 break-all font-mono text-[12px] text-sub">Task ID: {task.id}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close details"
                className="grid size-10 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-soft hover:text-ink"><X size={18} /></button>
            </div>
            {isDraft ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="Approve this plan">
                <button type="button" id="send" disabled={!task.canSend || sending} aria-busy={sending || undefined}
                  onClick={() => onSend(task, task.draftHash as string)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-action px-5 text-[14px] font-semibold text-action-ink transition hover:bg-action-hover active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45">
                  {sending ? <span className="size-3.5 animate-[spin_.8s_linear_infinite] rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" /> : null}
                  {sending ? 'Sending…' : 'Send to Claude'}
                </button>
                <button type="button" id="wait" disabled={sending} onClick={() => onWait(task)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-5 text-[14px] font-semibold transition hover:bg-soft disabled:opacity-45">Wait</button>
                <p className="m-0 min-w-[200px] flex-1 text-[13px] text-sub">Send publishes this reviewed plan for Claude. Wait keeps it as a draft.</p>
                {error ? <p role="alert" className="m-0 w-full rounded-lg border border-line border-l-[3px] border-l-bad bg-bad-soft px-3 py-2 text-[13px] text-ink">{error}</p> : null}
              </div>
            ) : (
              <div className="mt-3"><StateBadge task={task} /></div>
            )}
          </header>

          <div className="px-5 pb-10 pt-5 sm:px-8">
            <Stages task={task} />
            <p className="mb-0 mt-4 text-[14px] text-sub">{explain(task)}</p>

            {changed ? <Notice tone="warn">This plan changed while you were viewing it. The new version is shown below — review it again before sending.</Notice> : null}
            {task.state === 'draft' && !task.canSend && task.sendBlockedReason ? <Notice tone="info">{task.sendBlockedReason}</Notice> : null}
            {task.problems?.length && task.state !== 'superseded' ? (
              <Notice tone={task.state === 'malformed' ? 'bad' : 'warn'} title={task.state === 'malformed' ? 'Why this plan can’t be sent' : 'Note'}>
                <ul className="m-0 mt-1 pl-5">{task.problems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>
              </Notice>
            ) : null}
            {task.state === 'blocked' ? <Notice tone="bad">Claude reported this task as blocked. See the questions and blockers in the report.</Notice>
              : task.hasQuestions && task.state === 'report' ? <Notice tone="warn">The report includes questions or follow-up steps. See its questions/blockers section.</Notice> : null}

            {task.draftText !== undefined && ['draft', 'malformed', 'superseded'].includes(task.state) ? (
              <Document key={`plan-${task.id}`} title="Full plan" text={task.draftText} />
            ) : (
              <>
                {task.reportText ? <Document key={`report-${task.id}`} title="Claude’s report" text={task.reportText} /> : (
                  <Notice tone="info">Waiting for Claude’s report. It will appear here automatically.</Notice>
                )}
                {task.progressText && !task.reportText ? (
                  <details className="mt-6 rounded-xl border border-line bg-surface px-5 py-3" open>
                    <summary className="cursor-pointer text-[13.5px] font-medium">Claude’s progress receipt</summary>
                    <div className="mt-2"><Markdown source={task.progressText} /></div>
                  </details>
                ) : null}
                {task.promptText ? (
                  <details className="mt-6 rounded-xl border border-line bg-surface px-5 py-3">
                    <summary className="cursor-pointer text-[13.5px] font-medium">Approved plan</summary>
                    <div className="mt-2"><Markdown source={task.promptText} /></div>
                  </details>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
