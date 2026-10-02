import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { lstat, mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withinProject } from '../claude-bridge.mjs'
import { createPanel, PanelError, PROJECT_ROOT } from './core.mjs'

export const DEFAULT_PORT = 4317
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url))
// The AI Studio build (npm run ui:build). Only index.html and files listed in its Vite manifest are served.
export const UI_DIR = fileURLToPath(new URL('./dist/', import.meta.url))
const UI_ASSET = /^assets\/[A-Za-z0-9_.-]+\.(js|css|svg|png|woff2?)$/
const ASSET_TYPES = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', woff: 'font/woff', woff2: 'font/woff2' }
const UI_MISSING = '<!doctype html><meta charset="utf-8"><title>Task panel</title><p>The task panel UI has not been built yet. Run <code>npm.cmd run ui:build</code>, then reload this page.</p>'
// Only these fixed files are served from public/; there is no generic static file handler.
const ASSETS = {
  // Official agent logos, stored locally (sources are recorded in the task report).
  '/logos/openai-blossom-black.svg': ['logos/openai-blossom-black.svg', 'image/svg+xml'],
  '/logos/openai-blossom-white.svg': ['logos/openai-blossom-white.svg', 'image/svg+xml'],
  '/logos/claude-spark-clay.svg': ['logos/claude-spark-clay.svg', 'image/svg+xml'],
}
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
}

function sameToken(given, expected) {
  if (typeof given !== 'string' || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

// Read a file from the UI build without following links or leaving the build folder.
async function readUiFile(uiDir, relative) {
  try {
    const target = await withinProject(uiDir, relative)
    if (!(await lstat(target)).isFile()) return null
    return await readFile(target)
  } catch (error) {
    if (error.code === 'ENOENT' || /Path must stay|not allowed/.test(error.message)) return null
    throw error
  }
}

// The explicit whitelist of compiled assets: every file named in the Vite manifest, nothing else.
async function manifestAssets(uiDir) {
  const raw = await readUiFile(uiDir, '.vite/manifest.json')
  const allowed = new Set()
  if (!raw) return allowed
  for (const entry of Object.values(JSON.parse(raw.toString('utf8')))) {
    for (const file of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
      if (typeof file === 'string' && UI_ASSET.test(file)) allowed.add(file)
    }
  }
  return allowed
}

function readBody(request, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new PanelError(413, 'Request body is too large.'))
        request.destroy()
      } else chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

export async function startPanelServer({ root = PROJECT_ROOT, port = DEFAULT_PORT, attempts = 20, log = () => {}, uiDir = UI_DIR } = {}) {
  const panel = createPanel({ root })
  const token = randomBytes(32).toString('hex')
  let allowedHosts = new Set()

  const send = (response, status, body, type = 'application/json; charset=utf-8') => {
    response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type })
    response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
  }

  async function handle(request, response) {
    // Reject other host names so a rebinding DNS name cannot reach this server.
    if (!allowedHosts.has(request.headers.host ?? '')) return send(response, 403, { error: 'Unexpected Host header.' })
    const url = new URL(request.url, 'http://127.0.0.1')

    if (request.method === 'GET' && url.pathname === '/') {
      const page = await readUiFile(uiDir, 'index.html')
      if (!page) return send(response, 503, UI_MISSING, 'text/html; charset=utf-8')
      return send(response, 200, page.toString('utf8').replace('__PANEL_TOKEN__', token), 'text/html; charset=utf-8')
    }
    if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const relative = url.pathname.slice(1)
      if (!(await manifestAssets(uiDir)).has(relative)) return send(response, 404, { error: 'Not found.' })
      const body = await readUiFile(uiDir, relative)
      if (!body) return send(response, 404, { error: 'Not found.' })
      return send(response, 200, body, ASSET_TYPES[relative.split('.').pop()])
    }
    if (request.method === 'GET' && ASSETS[url.pathname]) {
      const [file, type] = ASSETS[url.pathname]
      return send(response, 200, await readFile(path.join(PUBLIC_DIR, file)), type)
    }
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { app: 'claude-task-panel', pid: process.pid })

    if (url.pathname.startsWith('/api/')) {
      if (!sameToken(request.headers['x-panel-token'], token)) return send(response, 403, { error: 'This page session has expired. Reload the panel.', code: 'token' })
      const origin = request.headers.origin
      if (origin !== undefined && !(origin.startsWith('http://') && allowedHosts.has(origin.slice('http://'.length)))) {
        return send(response, 403, { error: 'Cross-origin requests are not allowed.' })
      }
      const site = request.headers['sec-fetch-site']
      if (site !== undefined && site !== 'same-origin') return send(response, 403, { error: 'Cross-site requests are not allowed.' })

      if (request.method === 'GET' && url.pathname === '/api/state') {
        const state = await panel.scan()
        const autoSend = panel.autoSend.status()
        // The Auto-send revision is part of the version, so every open page sees it change.
        return send(response, 200, { ...state, version: `${state.version}:${autoSend.revision}`, autoSend, project: path.basename(path.resolve(root)) })
      }
      if (request.method === 'POST' && (url.pathname === '/api/send' || url.pathname === '/api/auto-send')) {
        if (!/^application\/json\b/i.test(request.headers['content-type'] ?? '')) return send(response, 415, { error: 'Expected application/json.' })
        let payload
        try {
          payload = JSON.parse(await readBody(request))
        } catch (error) {
          if (error instanceof PanelError) throw error
          return send(response, 400, { error: 'Invalid JSON body.' })
        }
        if (url.pathname === '/api/send') {
          const result = await panel.send(payload?.id, payload?.hash)
          log(`Published ${result.published} after a Send to Claude click (${result.at}).`)
          return send(response, 200, result)
        }
        // Auto-send: on/off/resume are the user's own actions; tick is the activating page's heartbeat.
        const action = payload?.action
        if (action === 'on') {
          const result = await panel.autoSend.activate()
          log(`Auto-send turned on (activation ${result.status.activation}). Only drafts created after this are eligible.`)
          return send(response, 200, result)
        }
        if (action === 'off') {
          const result = await panel.autoSend.deactivate()
          log('Auto-send turned off.')
          return send(response, 200, result)
        }
        if (action === 'resume') return send(response, 200, await panel.autoSend.resume(payload?.lease))
        if (action === 'tick') {
          const result = await panel.autoSend.tick(payload?.lease)
          if (result.published) log(`Auto-send published ${result.published.published} (${result.published.at}).`)
          return send(response, 200, result)
        }
        return send(response, 400, { error: 'Unknown Auto-send action.' })
      }
      return send(response, 405, { error: 'Method not allowed.' })
    }
    return send(response, 404, { error: 'Not found.' })
  }

  const server = createServer((request, response) => {
    handle(request, response).catch(error => {
      if (error instanceof PanelError) return send(response, error.status, { error: error.message })
      log(`Request failed: ${error.stack ?? error}`)
      send(response, 500, { error: 'The panel hit an unexpected error. Check the server log.' })
    })
  })

  let chosen = port
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(chosen, '127.0.0.1', () => {
          server.off('error', reject)
          resolve()
        })
      })
      break
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || port === 0 || attempt >= attempts) throw error
      chosen += 1
    }
  }
  const actual = server.address().port
  allowedHosts = new Set([`127.0.0.1:${actual}`, `localhost:${actual}`])
  const url = `http://127.0.0.1:${actual}/`
  return {
    url, port: actual, token, panel, server,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const projectRoot = path.resolve(PROJECT_ROOT)
  let root = projectRoot
  const rootArgument = argument('--root')
  if (rootArgument) {
    // A different root (for example a test fixture) must still live inside this project.
    root = await withinProject(projectRoot, path.resolve(projectRoot, rootArgument))
  }
  const requested = Number(argument('--port') ?? process.env.TASK_PANEL_PORT ?? DEFAULT_PORT)
  const log = message => console.log(`[${new Date().toISOString()}] ${message}`)
  const running = await startPanelServer({ root, port: requested, log })
  if (root === projectRoot) {
    const statePath = await withinProject(projectRoot, '.tmp/task-panel/server.json')
    await mkdir(path.dirname(statePath), { recursive: true })
    const temporary = `${statePath}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify({ url: running.url, pid: process.pid, startedAt: new Date().toISOString() }, null, 2))
    await rename(temporary, statePath)
  }
  log(`Claude task panel running at ${running.url}`)
  log('Clicking "Send to Claude" publishes one approved prompt. Claude\'s terminal monitor must be running to pick it up.')
  const stop = () => running.close().then(() => process.exit(0))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}
