import { get } from 'node:http'
import { readFile } from 'node:fs/promises'

// Returns the recorded panel state only if a live task panel with the same PID answers at its URL.
export async function recordedPanel(statePath) {
  let state
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'))
  } catch {
    return { state: null, alive: false }
  }
  const health = await new Promise(resolve => {
    const url = new URL('/health', state.url)
    const request = get({ host: '127.0.0.1', port: url.port, path: url.pathname, agent: false, timeout: 1500, headers: { Host: url.host } }, response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(null) }
      })
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => resolve(null))
  })
  return { state, alive: health?.app === 'claude-task-panel' && health.pid === state.pid }
}
