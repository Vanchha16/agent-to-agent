import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getState, ApiError } from './api.ts'
import type { PanelState } from './types.ts'
import { TEMPLATE_IDS, TEMPLATE_STORAGE_KEY, loadTemplate, parseTemplateId, saveTemplate, type TemplateId } from './templates.ts'

export type ThemeChoice = 'system' | 'light' | 'dark'

const media = (query: string) => window.matchMedia(query)

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    notify => { const list = media(query); list.addEventListener('change', notify); return () => list.removeEventListener('change', notify) },
    () => media(query).matches,
    () => false,
  )
}

export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)')

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem('panel-theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

// Theme choice is a per-browser convenience, so localStorage is fine; it falls back to the system theme.
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)
  const systemDark = useMedia('(prefers-color-scheme: dark)')
  const resolved: 'light' | 'dark' = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice
  useEffect(() => { document.documentElement.dataset.theme = resolved }, [resolved])
  const update = useCallback((next: ThemeChoice) => {
    setChoice(next)
    try { localStorage.setItem('panel-theme', next) } catch { /* storage unavailable */ }
  }, [])
  return { choice, resolved, setChoice: update }
}

const browserStorage = () => window.localStorage

// UI template preference, independent of the appearance choice above. Applying a template only changes
// presentation; it is stamped on <html> so the shared drawer and gallery pick up the same skin.
export function useTemplate() {
  const [template, setTemplate] = useState<TemplateId>(() => loadTemplate(browserStorage))
  useEffect(() => {
    const root = document.documentElement
    root.dataset.template = template
    for (const id of TEMPLATE_IDS) root.classList.toggle(`skin-${id}`, id === template)
  }, [template])
  // Another tab applied a template: follow it without touching tasks, polling, or the open drawer.
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === TEMPLATE_STORAGE_KEY) setTemplate(parseTemplateId(event.newValue)) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const apply = useCallback((next: TemplateId) => {
    setTemplate(next)
    return saveTemplate(browserStorage, next)
  }, [])
  return { template, apply }
}

export interface Connection { state: PanelState | null; error: ApiError | null; checkedAt: number }

// Polls the real /api/state every 2.5 s. Only a changed `version` replaces the state object, so
// unchanged polls do not re-render the studio or replay anything.
export function usePanelState(intervalMs = 2500) {
  const [connection, setConnection] = useState<Connection>({ state: null, error: null, checkedAt: 0 })
  const version = useRef<string | null>(null)

  const refresh = useCallback(async (force = false) => {
    try {
      const next = await getState()
      setConnection(previous => {
        if (!force && previous.state && next.version === version.current) return { ...previous, error: null, checkedAt: Date.now() }
        version.current = next.version
        return { state: next, error: null, checkedAt: Date.now() }
      })
    } catch (error) {
      setConnection(previous => ({ ...previous, error: error instanceof ApiError ? error : new ApiError(String(error)) }))
    }
  }, [])

  useEffect(() => {
    void refresh(true)
    const timer = window.setInterval(() => void refresh(), intervalMs)
    return () => window.clearInterval(timer)
  }, [refresh, intervalMs])

  return { ...connection, refresh }
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

export function ago(ms: number, now: number): string {
  if (!ms) return ''
  const seconds = Math.max(0, Math.round((now - ms) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
