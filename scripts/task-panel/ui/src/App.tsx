import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AutoSendStrip, AutoSendSwitch } from './components/AutoSend.tsx'
import { ConnectionBanner, TopBar, type Workspace } from './components/Shell.tsx'
import { TaskDrawer } from './components/TaskDrawer.tsx'
import { TemplateGallery } from './components/TemplateGallery.tsx'
import { sendDraft, ApiError } from './lib/api.ts'
import { deriveStudio } from './lib/derive.ts'
import { ago, useNow, usePanelState, useReducedMotion, useTemplate, useTheme } from './lib/hooks.ts'
import { createLifecycleTracker, type LifecycleEvent } from './lib/lifecycle.ts'
import { arrive, handoff, pulse } from './lib/motion.ts'
import { useAutoSend } from './lib/autoSend.ts'
import { switchOff } from './lib/autoSendOff.ts'
import { templateInfo, type TemplateId } from './lib/templates.ts'
import type { Task } from './lib/types.ts'
import { LAYOUTS } from './templates/index.ts'

export function App() {
  const { choice, resolved, setChoice } = useTheme()
  const { template, apply } = useTemplate()
  const reduce = useReducedMotion()
  const { state, error, checkedAt, refresh } = usePanelState()
  const now = useNow(1000)

  // Everything below stays mounted across template switches: one tracker, one drawer, one send path.
  const tracker = useRef(createLifecycleTracker())
  const ownerRef = useRef<HTMLElement | null>(null)
  const codexRef = useRef<HTMLElement | null>(null)
  const claudeRef = useRef<HTMLElement | null>(null)
  const deliveryRef = useRef<HTMLElement | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const openIdRef = useRef<string | null>(null)
  const templatesButtonRef = useRef<HTMLButtonElement>(null)

  const [openId, setOpenId] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const [delivery, setDelivery] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null)
  // Shown inside the drawer: a modal dialog sits above page-level toasts.
  const [sendError, setSendError] = useState<string | null>(null)

  const tasks = useMemo(() => state?.tasks ?? [], [state])
  const view = useMemo(() => deriveStudio(tasks), [tasks])
  const openTask = tasks.find(task => task.id === openId) ?? null

  // Auto-send lives here, above the selected layout, so switching templates cannot start, reset, or replay it.
  const [confirmingAuto, setConfirmingAuto] = useState(false)
  const [sentHere, setSentHere] = useState<Set<string>>(() => new Set())
  const auto = useAutoSend(state?.autoSend, result => {
    const id = result.published?.id
    if (!id) return
    tracker.current.markSeen(id, 'published')
    setSentHere(previous => new Set(previous).add(id))
    const title = tasks.find(task => task.id === id)?.title ?? id
    setDelivery(`${title} · sent automatically by Auto-send, waiting for Claude’s receipt`)
    say(`Auto-send sent ${title} to Claude. It is waiting for Claude’s receipt.`)
    void refresh(true)
    window.setTimeout(() => { void handoff(codexRef.current, claudeRef.current, title, reduce).then(() => pulse(claudeRef.current, reduce)) }, 120)
  })

  function toggleAutoSend() {
    if (auto.status.on) {
      setConfirmingAuto(false)
      // Success is announced only after the server confirms Off; a failed attempt says so instead.
      void switchOff(auto.deactivate, say)
    } else setConfirmingAuto(value => !value)
  }

  async function confirmAutoSend() {
    if (await auto.activate()) {
      setConfirmingAuto(false)
      say('Auto-send is on. Only plans created from now on are sent automatically, one at a time.')
    }
  }

  // The active template attaches these to its own owner/agent elements for lifecycle motion.
  const bind = useMemo(() => ({
    owner: (element: HTMLElement | null) => { ownerRef.current = element },
    codex: (element: HTMLElement | null) => { codexRef.current = element },
    claude: (element: HTMLElement | null) => { claudeRef.current = element },
    delivery: (element: HTMLElement | null) => { deliveryRef.current = element },
  }), [])

  const say = useCallback((text: string) => {
    setAnnouncement('')
    window.setTimeout(() => setAnnouncement(text), 40)
  }, [])

  const showToast = useCallback((text: string, bad = false) => {
    setToast({ text, bad })
    window.setTimeout(() => setToast(current => (current?.text === text ? null : current)), bad ? 9000 : 6000)
  }, [])

  // Real lifecycle events only: each new /api/state snapshot is compared with the previous one.
  // Template switches never change `state`, so they cannot replay or invent events.
  useEffect(() => {
    if (!state) return
    const events = tracker.current.observe(state.tasks)
    for (const event of events) handleEvent(event)
  }, [state])

  function handleEvent(event: LifecycleEvent) {
    if (event.type === 'draft') {
      setDelivery(`New plan from Codex: ${event.title}`)
      pulse(codexRef.current, reduce)
      say(`New plan from Codex is waiting for your approval: ${event.title}.`)
    } else if (event.type === 'published') {
      setDelivery(`${event.title} · sent to Claude, waiting for receipt`)
      void handoff(codexRef.current, claudeRef.current, event.title, reduce).then(() => pulse(claudeRef.current, reduce))
      say(`${event.title} was sent to Claude and is waiting for Claude’s receipt.`)
    } else if (event.type === 'acknowledged') {
      setDelivery(`Claude acknowledged ${event.title} and is working on it`)
      arrive(claudeRef.current, reduce)
      say(`Claude acknowledged ${event.title} and is working on it.`)
    } else {
      const blocked = event.state === 'blocked'
      setFresh(previous => new Set(previous).add(event.id))
      setDelivery(blocked ? `Claude reported ${event.title} as blocked — needs your decision` : event.hasQuestions ? `New report on ${event.title} — includes questions` : `New report from Claude on ${event.title}`)
      pulse(claudeRef.current, reduce)
      void handoff(claudeRef.current, ownerRef.current, 'Report', reduce).then(() => pulse(ownerRef.current, reduce))
      say(blocked ? `Claude reported ${event.title} as blocked. It needs your decision.` : event.hasQuestions ? `New report from Claude on ${event.title}. It includes questions.` : `New report from Claude on ${event.title}.`)
    }
  }

  useEffect(() => { if (delivery) arrive(deliveryRef.current, reduce) }, [delivery, reduce])

  const open = useCallback((task: Task) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setGalleryOpen(false) // never stack the gallery and the drawer
    setFresh(previous => { if (!previous.has(task.id)) return previous; const next = new Set(previous); next.delete(task.id); return next })
    setSendError(null)
    openIdRef.current = task.id
    setOpenId(task.id)
  }, [])

  const close = useCallback(() => {
    const id = openIdRef.current
    setOpenId(null)
    const opener = openerRef.current
    window.setTimeout(() => {
      if (opener?.isConnected && opener !== document.body) return opener.focus()
      // The template changed while the drawer was open: return to the same task in the new layout if it is shown.
      const same = id ? document.querySelector<HTMLElement>(`main [data-task-id="${CSS.escape(id)}"]`) : null
      ;(same ?? templatesButtonRef.current)?.focus()
    }, 0)
  }, [])

  const openGallery = useCallback(() => { if (!openId) setGalleryOpen(true) }, [openId])

  const closeGallery = useCallback(() => {
    setGalleryOpen(false)
    window.setTimeout(() => templatesButtonRef.current?.focus(), 0)
  }, [])

  // Presentation only: no request, no task change, no lifecycle event. The drawer (if open) keeps its task.
  function applyTemplate(id: TemplateId) {
    const saved = apply(id)
    closeGallery()
    const name = templateInfo(id).name
    const note = saved ? '' : ' This browser blocked saving it, so it lasts until you reload.'
    showToast(`Now using the ${name} template. Same tasks and approvals.${note}`, !saved)
    say(`${name} template applied.${note}`)
  }

  // The click on "Send to Claude" is the user's approval for exactly the reviewed draft hash.
  async function send(task: Task, hash: string) {
    if (sending) return
    setSending(true)
    setSendError(null)
    let ok = false
    try {
      await sendDraft(task.id, hash)
      ok = true
      tracker.current.markSeen(task.id, 'published')
    } catch (failure) {
      const err = failure instanceof ApiError ? failure : new ApiError(String(failure))
      const message = err.code === 'token' ? 'This page session expired. Reload the page, review the plan, and try again.' : err.message
      setSendError(message)
      showToast(message, true)
    } finally {
      setSending(false)
      await refresh(true)
    }
    if (!ok) return
    close()
    setDelivery(`${task.title} · sent to Claude, waiting for receipt`)
    showToast('Sent to Claude. Waiting for Claude’s receipt — keep Claude’s terminal open.')
    say(`${task.title} was sent to Claude and is waiting for Claude’s receipt.`)
    window.setTimeout(() => {
      void handoff(codexRef.current, claudeRef.current, task.title, reduce).then(() => pulse(claudeRef.current, reduce))
    }, 120)
  }

  function wait(task: Task) {
    close()
    showToast(`Not sent. “${task.title}” stays as a draft; nothing was published.`)
  }

  const focus = view.focus
  const primary = focus && (focus.state === 'draft' ? 'Review plan' : focus.reportText ? 'Read report' : focus.state === 'published' || focus.state === 'working' ? 'View task' : null)
  const live = error ? (error.code === 'token' ? 'Session expired — reload the page' : 'Panel server unreachable — is it still running?') : checkedAt ? `Files checked ${ago(checkedAt, now) === 'just now' ? 'just now' : ago(checkedAt, now)}` : 'Connecting…'

  const ws: Workspace = { state, error, tasks, view, now, fresh, theme: resolved, reduce, delivery, primary, open, bind }
  const Layout = LAYOUTS[template]

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1320px] flex-col">
      <TopBar ref={templatesButtonRef} project={state?.project ?? 'project'} live={live} error={Boolean(error)}
        templateName={templateInfo(template).name} galleryOpen={galleryOpen} onTemplates={openGallery} choice={choice} onTheme={setChoice}
        actions={state ? <AutoSendSwitch auto={auto} confirming={confirmingAuto} onToggle={toggleAutoSend} /> : null} />
      <ConnectionBanner error={error} hasState={Boolean(state)} />
      <AutoSendStrip auto={auto} confirming={confirmingAuto} tasks={tasks} sentHere={sentHere} onConfirm={() => void confirmAutoSend()} onCancel={() => setConfirmingAuto(false)} />

      <Layout ws={ws} />

      <footer className="flex flex-wrap justify-between gap-2 border-t border-line px-5 py-4 text-[12.5px] text-sub sm:px-8">
        <span>Keep Claude’s terminal open to receive tasks.</span>
        <span>This page reads project files and sends nothing on its own unless you turn on Auto-send.</span>
      </footer>

      <TaskDrawer task={openTask} open={Boolean(openTask)} sending={sending} error={sendError} onClose={close} onSend={send} onWait={wait} />
      <TemplateGallery open={galleryOpen} current={template} onApply={applyTemplate} onClose={closeGallery} />

      {toast ? (
        <div role={toast.bad ? 'alert' : 'status'}
          className={`fixed bottom-5 left-1/2 z-40 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-xl px-4 py-3 text-[13.5px] shadow-xl ${toast.bad ? 'border border-line border-l-[3px] border-l-bad bg-surface text-ink' : 'bg-action text-action-ink'}`}>
          {toast.text}
        </div>
      ) : null}
      <div className="sr-only" aria-live="polite">{announcement}</div>
    </div>
  )
}
