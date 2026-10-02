import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, autoSend, type AutoSendResult } from './api.ts'
import type { AutoSendStatus } from './types.ts'
import { OFF_UNCONFIRMED, requestOff, type OffResult } from './autoSendOff.ts'

// Client side of Auto-send. The server owns every decision (baseline, eligibility, one-at-a-time,
// pausing, publication). This page only holds the activation's lease in memory, so a refresh or a
// closed page ends it, and sends the heartbeat ("tick") while it is open.
const TICK_MS = 2500

export interface AutoSendController {
  status: AutoSendStatus
  mine: boolean
  busy: boolean
  error: string | null
  activate: () => Promise<boolean>
  deactivate: () => Promise<OffResult>
  resume: () => Promise<void>
}

export function useAutoSend(shared: AutoSendStatus | undefined, onPublished: (result: AutoSendResult) => void): AutoSendController {
  const lease = useRef<string | null>(null)
  const inFlight = useRef(false)
  const published = useRef(onPublished)
  published.current = onPublished
  const [own, setOwn] = useState<AutoSendStatus | null>(null)
  const [mine, setMine] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Kept apart from heartbeat errors so a later successful tick cannot hide an unconfirmed Off.
  const [offError, setOffError] = useState<string | null>(null)

  const drop = useCallback(() => { lease.current = null; setMine(false); setOwn(null); setOffError(null) }, [])

  const tick = useCallback(async () => {
    if (!lease.current || inFlight.current) return
    inFlight.current = true
    try {
      const result = await autoSend('tick', lease.current)
      setOwn(result.status)
      setError(null)
      if (result.published) published.current(result)
    } catch (failure) {
      const err = failure instanceof ApiError ? failure : new ApiError(String(failure))
      // 403/409: this page no longer holds the activation (Off elsewhere, expired, or server restarted).
      if (err.status === 403 || err.status === 409) drop()
      setError(err.status === 409 ? 'Auto-send is off.' : err.message)
    } finally {
      inFlight.current = false
    }
  }, [drop])

  useEffect(() => {
    if (!mine) return
    const timer = window.setInterval(() => void tick(), TICK_MS)
    return () => window.clearInterval(timer)
  }, [mine, tick])

  // Leaving or refreshing the page ends the activation; the server lease also expires on its own.
  useEffect(() => {
    const leave = () => { if (lease.current) void autoSend('off', lease.current, true).catch(() => {}) }
    window.addEventListener('pagehide', leave)
    return () => window.removeEventListener('pagehide', leave)
  }, [])

  const activate = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await autoSend('on')
      lease.current = result.lease ?? null
      setOwn(result.status)
      setMine(Boolean(lease.current))
      void tick()
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      return false
    } finally {
      setBusy(false)
    }
  }, [tick])

  // Off is final only when the server confirms it. On failure this page keeps its lease and heartbeat,
  // because the server may still be on; the switch stays available to retry. If the reply was lost after
  // a real Off, the next state poll or tick reports it and the page catches up.
  const deactivate = useCallback(async (): Promise<OffResult> => {
    setBusy(true)
    const result = await requestOff(() => autoSend('off', lease.current ?? undefined))
    if (result.ok) {
      drop()
      setOwn(result.status)
      setError(null)
    } else setOffError(`${OFF_UNCONFIRMED} (${result.error})`)
    setBusy(false)
    return result
  }, [drop])

  const resume = useCallback(async () => {
    if (!lease.current) return
    setBusy(true)
    try {
      setOwn((await autoSend('resume', lease.current)).status)
      void tick()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }, [tick])

  // The server's view wins when it is newer: another page may have turned Auto-send off.
  useEffect(() => {
    if (mine && shared && !shared.on && shared.revision > (own?.revision ?? 0)) drop()
  }, [mine, shared, own, drop])
  // Whichever server answer is newer wins: this page's own reply (for example a confirmed Off) or the last poll.
  const status: AutoSendStatus = own && (!shared || own.revision > shared.revision || (mine && own.revision === shared.revision)) ? own : shared ?? own ?? { on: false, revision: 0 }
  useEffect(() => { if (shared && !shared.on) setOffError(null) }, [shared])
  return { status, mine: mine && status.on, busy, error: offError ?? error, activate, deactivate, resume }
}
