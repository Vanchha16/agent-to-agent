import type { PanelState } from './types.ts'

const token = document.querySelector<HTMLMetaElement>('meta[name="panel-token"]')?.content ?? ''

export class ApiError extends Error {
  status?: number
  code?: string
  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      cache: 'no-store',
      headers: { 'X-Panel-Token': token, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch {
    throw new ApiError('Couldn’t reach the panel server, so nothing was sent. Start it with npm.cmd run panel:start, then try again.', undefined, 'network')
  }
  let body: { error?: string; code?: string } | null = null
  try { body = await response.json() } catch { /* empty body */ }
  if (!response.ok) throw new ApiError(body?.error ?? `Request failed (${response.status}).`, response.status, body?.code)
  return body as T
}

export const getState = () => call<PanelState>('/api/state')
export const sendDraft = (id: string, hash: string) => call<{ id: string; published: string; reportPath: string; at: string }>('/api/send', { method: 'POST', body: JSON.stringify({ id, hash }) })
