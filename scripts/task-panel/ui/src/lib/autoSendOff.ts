// Turning Auto-send off, as pure functions (no DOM, no React) so the test suite can exercise the
// exact decision the page makes. Off counts as done only when the server answers that it is off.
import type { AutoSendResult } from './api.ts'
import type { AutoSendStatus } from './types.ts'

export const OFF_CONFIRMED = 'Auto-send is off. Nothing more will be sent automatically.'
export const OFF_UNCONFIRMED = 'Couldn’t confirm that Auto-send is off. It may still be on — check that the panel is running, then try the switch again.'

export type OffResult = { ok: true; status: AutoSendStatus } | { ok: false; error: string }

export async function requestOff(call: () => Promise<AutoSendResult>): Promise<OffResult> {
  try {
    const result = await call()
    if (result?.status?.on === false) return { ok: true, status: result.status }
    return { ok: false, error: 'The panel did not confirm that Auto-send is off.' }
  } catch (failure) {
    // The shared network message talks about sending; for Off, say plainly that the panel was unreachable.
    const unreachable = (failure as { code?: string })?.code === 'network' || failure instanceof TypeError
    return { ok: false, error: unreachable ? 'The panel server could not be reached.' : failure instanceof Error ? failure.message : String(failure) }
  }
}

// What the page says after the user turns Auto-send off: success only after a confirmed Off.
export async function switchOff(deactivate: () => Promise<OffResult>, announce: (text: string) => void): Promise<OffResult> {
  const result = await deactivate()
  announce(result.ok ? OFF_CONFIRMED : OFF_UNCONFIRMED)
  return result
}
