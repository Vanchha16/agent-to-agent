import { forwardRef } from 'react'
import { ArrowDown, ArrowUpRight, CircleAlert, FileCheck2, Hammer, Inbox, Send, UserRound } from 'lucide-react'
import type { DeskView, StudioView } from '../lib/derive.ts'
import type { Task } from '../lib/types.ts'

// Official logos, served locally by the panel (see report 20261001-agent-profile-logos).
// Sizes: 44 (desk), 32 (compact rows), 24 (inline strips). The Claude mark is padded inside its frame.
const LOGO_SIZE: Record<number, [string, string]> = { 44: ['size-11', 'size-11 p-[11px]'], 32: ['size-8', 'size-8 p-[8px]'], 24: ['size-6', 'size-6 p-[5px]'] }

export function AgentLogo({ agent, theme, size = 44, square = false }: { agent: 'codex' | 'claude'; theme: 'light' | 'dark'; size?: 44 | 32 | 24; square?: boolean }) {
  const src = agent === 'codex'
    ? (theme === 'dark' ? '/logos/openai-blossom-white.svg' : '/logos/openai-blossom-black.svg')
    : '/logos/claude-spark-clay.svg'
  const [codexClass, claudeClass] = LOGO_SIZE[size] ?? LOGO_SIZE[44]
  return (
    <span className={`agent-logo grid shrink-0 place-items-center border border-line bg-surface ${square ? 'rounded-[3px]' : 'rounded-full'}`}>
      <img
        src={src}
        alt={agent === 'codex' ? 'Codex logo (OpenAI Blossom)' : 'Claude logo (Claude Spark)'}
        width={size}
        height={size}
        className={agent === 'codex' ? codexClass : claudeClass}
        draggable={false}
      />
    </span>
  )
}

// First readable sentence of a plan, for the planner's desk. Metadata lines and headings are skipped.
export function excerpt(text: string | undefined, max = 170): string {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  const body = lines.filter(line => line.trim() && !/^#/.test(line) && !/^\s*[A-Z][A-Za-z ]+:\s/.test(line) && !/^\s*[-*|]/.test(line))
  const plain = (body[0] ?? '').replace(/[`*_]/g, '').trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}

export const OwnerCard = forwardRef<HTMLDivElement, { view: StudioView['owner'] }>(function OwnerCard({ view }, ref) {
  return (
    <div ref={ref} className="mx-auto flex w-fit max-w-full items-center gap-3 rounded-full bg-surface py-2 pl-2 pr-5 shadow-desk">
      <span className="grid size-10 place-items-center rounded-full bg-action text-action-ink" aria-hidden="true"><UserRound size={20} strokeWidth={1.8} /></span>
      <div className="min-w-0">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 leading-tight">
          <strong className="font-semibold">You</strong>
          <span className="text-[12.5px] text-sub">Project owner · final approval</span>
        </p>
        <p className={`m-0 mt-0.5 flex items-center gap-1.5 text-[12.5px] ${view.pending ? 'font-medium text-ink' : 'text-sub'}`}>
          <span className={`dot ${view.pending ? 'tone-ready' : ''}`} />{view.line}
        </p>
      </div>
    </div>
  )
})

interface DeskProps {
  agent: 'codex' | 'claude'
  view: DeskView
  theme: 'light' | 'dark'
  onOpen: (task: Task) => void
  fresh?: boolean
}

export const AgentDesk = forwardRef<HTMLElement, DeskProps>(function AgentDesk({ agent, view, theme, onOpen, fresh }, ref) {
  const codex = agent === 'codex'
  const task = view.task
  return (
    <article ref={ref} aria-label={`${codex ? 'Codex' : 'Claude'} workstation`}
      className={`tone-${view.tone} flex min-w-0 flex-col rounded-2xl bg-surface p-5 shadow-desk transition-transform duration-200 ease-out hover:-translate-y-0.5`}>
      <header className="flex items-center gap-3">
        <AgentLogo agent={agent} theme={theme} />
        <div className="min-w-0">
          <p className="m-0 font-display text-[16px] font-semibold leading-tight">{codex ? 'Codex' : 'Claude'}</p>
          <p className="m-0 text-[12.5px] text-sub">{codex ? 'Turns your requirements into plans' : 'Builds approved plans and reports back'}</p>
        </div>
        <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10.5px] font-semibold tracking-[.08em] text-sub">{codex ? 'PLANNER' : 'BUILDER'}</span>
      </header>

      <p className="mb-0 mt-4 flex items-center gap-2 text-[13.5px] font-medium">
        <span className="dot" />{view.status}
      </p>

      <div className="mt-3 flex flex-1 flex-col rounded-xl bg-sunk p-4">
        {codex ? <PlanSheet task={task} onOpen={onOpen} /> : <Bench view={view} onOpen={onOpen} fresh={fresh} />}
      </div>
    </article>
  )
})

function PlanSheet({ task, onOpen }: { task: Task | null; onOpen: (task: Task) => void }) {
  if (!task) {
    return (
      <div className="m-auto flex flex-col items-center gap-2 py-4 text-center text-[13px] text-sub">
        <Inbox size={20} strokeWidth={1.6} aria-hidden="true" />
        No plan on the desk. Codex’s next plan appears here.
      </div>
    )
  }
  return (
    <>
      <span className="eyebrow">{task.state === 'malformed' ? 'Plan · needs fixing' : 'Plan'}</span>
      <p className="mb-1 mt-1.5 font-medium leading-snug text-ink">{task.title}</p>
      <p className="m-0 line-clamp-3 text-[13px] text-sub">{excerpt(task.draftText ?? task.promptText) || 'Open the plan to read it in full.'}</p>
      <div className="mt-auto pt-4">
        <button type="button" onClick={() => onOpen(task)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium transition-colors hover:bg-soft">
          {task.state === 'draft' ? 'Review plan' : 'Open plan'} <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
    </>
  )
}

function Bench({ view, onOpen, fresh }: { view: DeskView; onOpen: (task: Task) => void; fresh?: boolean }) {
  const task = view.task
  const Icon = view.tone === 'working' ? Hammer : view.tone === 'waiting' ? Send : view.tone === 'attention' ? CircleAlert : view.tone === 'report' ? FileCheck2 : Hammer
  const line = {
    idle: 'Waiting for an approved plan',
    waiting: 'Sent — Claude hasn’t confirmed receipt yet',
    working: 'Building',
    report: 'Last report',
    attention: 'Report needs your decision',
    ready: '',
  }[view.tone]
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-sub" aria-hidden="true"><Icon size={18} strokeWidth={1.7} /></span>
        <div className="min-w-0">
          <p className="m-0 text-[12.5px] text-sub">{line}{fresh && view.tone !== 'idle' ? <span className="ml-2 rounded-full bg-action px-1.5 py-px text-[10.5px] font-semibold text-action-ink">New</span> : null}</p>
          {task ? <p className="m-0 mt-0.5 font-medium leading-snug">{task.title}</p> : null}
        </div>
      </div>
      {view.tone === 'working' ? <div className="working-bar mt-4" role="presentation" /> : null}
      {task ? (
        <div className="mt-auto pt-4">
          <button type="button" onClick={() => onOpen(task)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 text-[13px] font-medium transition-colors hover:bg-soft">
            {task.reportText ? 'Open report' : 'View task'} <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Route() {
  return (
    <div className="flex h-12 items-center justify-center gap-3 text-sub" aria-hidden="true">
      <span className="h-px w-16 bg-line-strong sm:w-24" />
      <ArrowDown size={16} strokeWidth={1.6} />
      <span className="h-px w-16 bg-line-strong sm:w-24" />
    </div>
  )
}
