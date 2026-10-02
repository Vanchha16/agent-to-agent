import { useEffect, useRef } from 'react'
import { Zap, ZapOff } from 'lucide-react'
import type { AutoSendController } from '../lib/autoSend.ts'
import type { Task } from '../lib/types.ts'

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '')

function stateLabel(auto: AutoSendController): string {
  if (!auto.status.on) return 'Off'
  if (!auto.mine) return 'On · other page'
  return auto.status.paused ? 'Paused' : 'On'
}

// Header switch shared by every template. Turning on only opens a confirmation; turning off is immediate.
export function AutoSendSwitch({ auto, confirming, onToggle }: { auto: AutoSendController; confirming: boolean; onToggle: () => void }) {
  const on = auto.status.on
  const Icon = on ? Zap : ZapOff
  return (
    <button type="button" role="switch" aria-checked={on} aria-describedby="auto-send-status" onClick={onToggle} disabled={auto.busy}
      aria-expanded={on ? undefined : confirming} aria-controls={on ? undefined : 'auto-send-confirm'}
      className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors disabled:opacity-60 ${on ? 'border-action bg-action text-action-ink hover:bg-action-hover' : 'border-line bg-surface text-ink hover:bg-soft'}`}>
      <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
      Auto-send
      <span className={`rounded-md px-1.5 py-px text-[11.5px] font-semibold ${on ? 'bg-action-ink/15' : 'bg-soft text-ink-2'}`}>{stateLabel(auto)}</span>
    </button>
  )
}

interface StripProps {
  auto: AutoSendController
  confirming: boolean
  tasks: Task[]
  sentHere: Set<string>
  onConfirm: () => void
  onCancel: () => void
}

// Factual Auto-send status under the header: confirmation, running, paused, other page, and after Off.
export function AutoSendStrip({ auto, confirming, tasks, sentHere, onConfirm, onCancel }: StripProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (confirming) confirmRef.current?.focus() }, [confirming])
  const { status } = auto
  const title = (id: string) => tasks.find(task => task.id === id)?.title ?? id
  const stillActive = tasks.filter(task => sentHere.has(task.id) && (task.state === 'published' || task.state === 'working'))
  const button = 'inline-flex min-h-9 items-center rounded-lg px-3.5 text-[13px] font-semibold transition-colors'

  let body = null
  if (confirming && !status.on) {
    body = (
      <div id="auto-send-confirm" role="group" aria-labelledby="auto-send-confirm-title" className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-[420px]">
          <p id="auto-send-confirm-title" className="m-0 font-semibold text-ink">Turn on Auto-send?</p>
          <p className="m-0 mt-0.5 text-[13px] text-sub">
            New plans Codex saves from now on will be sent to Claude without a click, one at a time, each after the previous task’s report.
            Plans already waiting stay manual. A report with questions or a blocker pauses Auto-send. It stays on only while this page is open.
          </p>
        </div>
        <div className="flex gap-2">
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={auto.busy} className={`${button} bg-action text-action-ink hover:bg-action-hover disabled:opacity-60`}>Turn on Auto-send</button>
          <button type="button" onClick={onCancel} className={`${button} border border-line-strong bg-surface hover:bg-soft`}>Cancel</button>
        </div>
      </div>
    )
  } else if (status.on && !auto.mine) {
    body = (
      <p className="m-0">
        <strong className="font-semibold">Auto-send is on in another page</strong> (since {time(status.activatedAt)}). Only that page sends plans automatically. Use the Auto-send switch to turn it off from here.
      </p>
    )
  } else if (status.on && status.paused) {
    body = (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="m-0 min-w-0 flex-1 basis-[420px]">
          <strong className="font-semibold">Auto-send is paused.</strong> Claude’s report on “{status.paused.title}” {status.paused.reason === 'blocked' ? 'is blocked' : 'has questions'}.
          Discuss it with Codex, then resume or turn Auto-send off. Nothing is sent while paused.
        </p>
        <button type="button" onClick={() => void auto.resume()} disabled={auto.busy} className={`${button} border border-line-strong bg-surface hover:bg-soft disabled:opacity-60`}>Resume Auto-send</button>
      </div>
    )
  } else if (status.on) {
    const waiting = status.waitingFor?.length ? `Waiting for Claude’s report on “${title(status.waitingFor[0])}” before sending the next plan.` : status.queue?.length ? `${status.queue.length} new ${status.queue.length === 1 ? 'plan' : 'plans'} will be sent once complete and unchanged for a few seconds.` : 'No new plans yet.'
    body = (
      <div className="space-y-1">
        <p className="m-0">
          <strong className="font-semibold">Auto-send is on</strong> since {time(status.activatedAt)}. Only plans created after that are sent automatically; {status.excluded ?? 0} earlier {status.excluded === 1 ? 'plan stays' : 'plans stay'} manual.
          Keep this page open — refreshing or closing it turns Auto-send off. Claude’s terminal monitor must be running to pick tasks up.
        </p>
        <p className="m-0 text-ink">{waiting}{status.sent?.length ? ` Sent automatically: ${status.sent.map(item => `“${title(item.id)}”`).join(', ')}.` : ''}</p>
        {status.lastError ? <p className="m-0 text-bad">Couldn’t send “{title(status.lastError.id)}”: {status.lastError.message}</p> : null}
      </div>
    )
  } else if (stillActive.length) {
    body = <p className="m-0">Auto-send is off. {stillActive.map(task => `“${task.title}”`).join(', ')} was already sent automatically and is still with Claude — turning Auto-send off doesn’t cancel it.</p>
  }

  const confirm = confirming && !status.on
  const visible = Boolean(body || auto.error)
  return (
    <div className={visible ? 'mx-5 mt-4 rounded-lg border border-line border-l-[3px] border-l-info bg-info-soft px-4 py-3 text-[13.5px] text-ink-2 sm:mx-8' : undefined}>
      {confirm ? body : null}
      {confirm && auto.error ? <p role="alert" className="m-0 mt-2 text-bad">{auto.error}</p> : null}
      <div id="auto-send-status" role="status" className={confirm || !visible ? 'sr-only' : undefined}>
        {confirm ? 'Auto-send is off.' : body ?? (auto.error ? null : 'Auto-send is off.')}
        {auto.error && !confirm ? <p className="m-0 mt-1 text-bad">{auto.error}</p> : null}
      </div>
    </div>
  )
}
