import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, open, readFile, readdir, realpath, unlink, writeFile, copyFile, constants } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withinProject } from '../claude-bridge.mjs'

// The project root is derived from this file's location (scripts/task-panel/ -> project root).
export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export const TASK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,99}$/
const INSTRUCTION_FILES = new Set(['TO_CLAUDE.md', 'WORKFLOW.md', 'AGENT_TO_AGENT.md', 'CLAUDE_TASK_TEMPLATE.md'])
const digest = value => createHash('sha256').update(value).digest('hex')
const stateDir = '.tmp/task-panel'

export class PanelError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Strip Markdown decoration from a metadata value: `prompt/x.md`. -> prompt/x.md
const cleanValue = value => value.trim().replace(/^`(.*)`\.?$/, '$1').replace(/\.$/, '').replace(/`/g, '').trim()

// Read "Key: value" metadata lines from the header region of a prompt or report.
export function parseMetadata(text) {
  const fields = {}
  for (const line of text.split(/\r?\n/).slice(0, 40)) {
    const match = line.match(/^\s*(Task ID|Delivery status|User authorization(?: to dispatch)?|Source prompt(?: after approval)?|Approved source prompt after dispatch|Report path(?: after dispatch)?|Progress path|Status|Superseded by)\s*:\s*(.+)$/i)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = cleanValue(match[2])
    if (key === 'task id') fields.taskId ??= value
    else if (key === 'delivery status') fields.deliveryStatus ??= value
    else if (key.startsWith('user authorization')) fields.authorization ??= value
    else if (key.includes('source prompt')) fields.sourcePrompt ??= value
    else if (key.startsWith('report path')) fields.reportPath ??= value
    else if (key === 'progress path') fields.progressPath ??= value
    else if (key === 'status') fields.status ??= value
    else if (key === 'superseded by') fields.supersededBy ??= value
  }
  const title = text.match(/^#\s+(.+)$/m)
  fields.title = title ? title[1].trim() : ''
  return fields
}

const isDraftMarker = status => /^DRAFT\s*[-–—]\s*DO NOT EXECUTE$/i.test(status ?? '')
const isApprovedMarker = status => /^APPROVED FOR EXECUTION$/i.test(status ?? '')
const isSuperseded = status => /SUPERSEDED/i.test(status ?? '')
const normalizeRel = value => (value ?? '').replace(/\\/g, '/').replace(/^\.\//, '')

// Report body helpers: the Status line and whether a questions/blockers section has real content.
export function summarizeReport(text) {
  const { status = '' } = parseMetadata(text)
  let outcome = 'completed'
  if (/\bblocked\b/i.test(status) && !/\bnot blocked\b/i.test(status)) outcome = 'blocked'
  else if (/partial/i.test(status)) outcome = 'partial'
  let questions = ''
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => /^#{2,3}\s+.*(question|blocker)/i.test(line))
  if (start !== -1) {
    const end = lines.findIndex((line, index) => index > start && /^#{1,3}\s+/.test(line))
    questions = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim()
  }
  const hasQuestions = Boolean(questions) && !/^none\b/i.test(questions)
  return { status, outcome, hasQuestions }
}

const looksLikeProgress = text => /^#\s+Claude progress/im.test(text) || /progress receipt|not the final report/i.test(parseMetadata(text).status ?? '')

// A final report matches only when it names this task and its source prompt and is not a progress receipt.
export function reportMatches(task, text) {
  if (looksLikeProgress(text)) return false
  const meta = parseMetadata(text)
  if (normalizeRel(meta.sourcePrompt) !== task.sourcePrompt) return false
  if (task.legacy) return true
  return meta.taskId === task.id
}

export function progressMatches(task, text) {
  const meta = parseMetadata(text)
  return meta.taskId === task.id && normalizeRel(meta.sourcePrompt) === task.sourcePrompt
}

export function createPanel({ root = PROJECT_ROOT, now = () => new Date(), autoSendTiming = {} } = {}) {
  const base = path.resolve(root)
  let queue = Promise.resolve()

  // Serialize every send inside this process; the on-disk lock covers other processes.
  const serialized = work => {
    const result = queue.then(work, work)
    queue = result.catch(() => {})
    return result
  }

  async function readRegular(relative) {
    let target
    try {
      target = await withinProject(base, relative)
    } catch {
      return null
    }
    try {
      const stats = await lstat(target)
      if (!stats.isFile()) return null
      const real = await realpath(target)
      if (path.relative(await realpath(base), real).startsWith('..')) return null
      return { text: await readFile(target, 'utf8'), mtime: stats.mtimeMs }
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }

  async function exists(relative) {
    try {
      await lstat(await withinProject(base, relative))
      return true
    } catch (error) {
      if (error.code === 'ENOENT') return false
      return true // Treat links or unreadable entries as occupied so nothing is overwritten.
    }
  }

  async function listMarkdown(relativeDir) {
    let directory
    try {
      directory = await withinProject(base, relativeDir)
      const stats = await lstat(directory)
      if (!stats.isDirectory()) return []
    } catch {
      return []
    }
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => entry.name).sort()
  }

  function checkDraft(name, meta, text) {
    const problems = []
    const stem = name.slice(0, -3)
    if (!isDraftMarker(meta.deliveryStatus)) problems.push('Missing the "Delivery status: DRAFT - DO NOT EXECUTE" marker.')
    if (!meta.taskId) problems.push('Missing a "Task ID:" line.')
    else if (!TASK_ID_PATTERN.test(meta.taskId)) problems.push('Task ID must use lowercase letters, digits, and hyphens (3-100 characters).')
    else if (meta.taskId !== stem) problems.push(`Task ID "${meta.taskId}" does not match the file name "${name}".`)
    const id = meta.taskId && TASK_ID_PATTERN.test(meta.taskId) ? meta.taskId : stem
    if (normalizeRel(meta.sourcePrompt) !== `prompt/${id}.md`) problems.push(`Source prompt must be prompt/${id}.md.`)
    if (normalizeRel(meta.reportPath) !== `report/${id}-report.md`) problems.push(`Report path must be report/${id}-report.md.`)
    if (!/^#\s+\S/m.test(text)) problems.push('Missing a "# Title" heading.')
    return problems
  }

  async function scan() {
    const tasks = new Map()

    for (const name of await listMarkdown('prompt')) {
      if (INSTRUCTION_FILES.has(name) || /template/i.test(name)) continue
      const file = await readRegular(`prompt/${name}`)
      if (!file) continue
      const meta = parseMetadata(file.text)
      if (!isApprovedMarker(meta.deliveryStatus)) continue // Instructions, greetings, and stray drafts are not tasks.
      const stem = name.slice(0, -3)
      const legacy = !meta.taskId
      const id = legacy ? stem : meta.taskId
      const problems = []
      if (!legacy && meta.taskId !== stem) problems.push(`Task ID "${meta.taskId}" does not match the file name "${name}".`)
      const sourcePrompt = normalizeRel(meta.sourcePrompt) || `prompt/${name}`
      const reportPath = normalizeRel(meta.reportPath) || `report/${stem}-report.md`
      if (!/^report\/[^/]+\.md$/.test(reportPath)) problems.push('The report path is not a Markdown file directly inside report/.')
      tasks.set(id, {
        id, legacy, title: meta.title || id, sourcePrompt, reportPath,
        progressPath: normalizeRel(meta.progressPath) || `report/${id}-progress.md`,
        promptFile: `prompt/${name}`, promptText: file.text, authorization: meta.authorization ?? '',
        updatedAt: file.mtime, problems,
      })
    }

    for (const task of tasks.values()) {
      const report = /^report\/[^/]+\.md$/.test(task.reportPath) ? await readRegular(task.reportPath) : null
      if (report && reportMatches(task, report.text)) {
        const summary = summarizeReport(report.text)
        task.state = summary.outcome === 'blocked' ? 'blocked' : 'report'
        Object.assign(task, { reportText: report.text, reportStatus: summary.status, outcome: summary.outcome, hasQuestions: summary.hasQuestions })
        task.updatedAt = Math.max(task.updatedAt, report.mtime)
        continue
      }
      if (report) task.problems.push(`${task.reportPath} exists but does not name this task ID and source prompt, so it is not treated as the final report.`)
      const progress = !task.legacy && /^report\/[^/]+\.md$/.test(task.progressPath) ? await readRegular(task.progressPath) : null
      if (progress && progressMatches(task, progress.text)) {
        task.state = 'working'
        task.progressText = progress.text
        task.updatedAt = Math.max(task.updatedAt, progress.mtime)
      } else {
        task.state = 'published'
      }
    }

    const drafts = []
    for (const name of await listMarkdown('prompt/drafts')) {
      if (/template/i.test(name)) continue
      const file = await readRegular(`prompt/drafts/${name}`)
      if (!file) continue
      const meta = parseMetadata(file.text)
      const stem = name.slice(0, -3)
      const id = meta.taskId && TASK_ID_PATTERN.test(meta.taskId) ? meta.taskId : stem
      const published = tasks.get(id) ?? tasks.get(stem)
      if (published) {
        published.draftFile = `prompt/drafts/${name}`
        continue // The draft is history for a task that was already published.
      }
      const draft = {
        id, title: meta.title || stem, draftFile: `prompt/drafts/${name}`, draftText: file.text,
        draftHash: digest(file.text), updatedAt: file.mtime, sourcePrompt: `prompt/${id}.md`, reportPath: `report/${id}-report.md`,
      }
      if (isSuperseded(meta.deliveryStatus)) {
        Object.assign(draft, { state: 'superseded', supersededBy: meta.supersededBy ?? '', problems: ['This draft is superseded and can never be sent.'] })
      } else {
        const problems = checkDraft(name, meta, file.text)
        if (!problems.length) {
          if (await exists(draft.sourcePrompt)) problems.push(`${draft.sourcePrompt} already exists.`)
          if (await exists(draft.reportPath)) problems.push(`${draft.reportPath} already exists.`)
        }
        Object.assign(draft, { state: problems.length ? 'malformed' : 'draft', problems })
      }
      drafts.push(draft)
    }

    const approved = [...tasks.values()]
    const active = approved.filter(task => task.state === 'published' || task.state === 'working')
    for (const draft of drafts) {
      draft.canSend = draft.state === 'draft' && active.length === 0
      if (draft.state === 'draft' && active.length) draft.sendBlockedReason = `Waiting for Claude's report on ${active.map(task => task.id).join(', ')}. Only one approved task can be active at a time.`
    }
    const list = [...drafts, ...approved]
    const order = { draft: 0, malformed: 1, working: 2, published: 3, blocked: 4, report: 5, superseded: 6 }
    list.sort((a, b) => order[a.state] - order[b.state] || b.updatedAt - a.updatedAt)
    const version = digest(JSON.stringify(list.map(item => [item.id, item.state, item.updatedAt, item.draftHash ?? '', item.problems?.length ?? 0])))
    return { tasks: list, active: active.map(task => task.id), version }
  }

  async function acquireLock() {
    const lockPath = await withinProject(base, `${stateDir}/send.lock`)
    await mkdir(path.dirname(lockPath), { recursive: true })
    try {
      const handle = await open(lockPath, 'wx')
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: now().toISOString() }))
      await handle.close()
      return lockPath
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let owner = null
      try {
        owner = JSON.parse(await readFile(lockPath, 'utf8'))
      } catch {}
      if (owner?.pid && owner.pid !== process.pid && !processAlive(owner.pid)) {
        // The recorded owner has exited, so this lock is stale; removing it touches no task or report.
        await unlink(lockPath)
        return acquireLock()
      }
      throw new PanelError(409, 'Another send is in progress. Try again in a moment.')
    }
  }

  async function publishAtomically(content, destinationRelative, id) {
    const staging = await withinProject(base, `${stateDir}/staging/${id}-${randomUUID()}.md`)
    await mkdir(path.dirname(staging), { recursive: true })
    await writeFile(staging, content, { flag: 'wx' })
    const destination = await withinProject(base, destinationRelative)
    try {
      // A hard link publishes the complete file in one step and fails instead of overwriting.
      await link(staging, destination)
    } catch (error) {
      if (error.code === 'EEXIST') throw new PanelError(409, `${destinationRelative} already exists; nothing was overwritten.`)
      if (!['EPERM', 'EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(error.code)) throw error
      await copyFile(staging, destination, constants.COPYFILE_EXCL)
    } finally {
      await unlink(staging).catch(() => {})
    }
  }

  function approvedContent(draftText, id, authorization) {
    const lines = draftText.split(/\r?\n/)
    const header = lines.slice(0, 40)
    const rest = lines.slice(40)
    let sawAuthorization = false
    const updated = header.map(line => {
      if (/^\s*Delivery status\s*:/i.test(line)) return 'Delivery status: APPROVED FOR EXECUTION'
      if (/^\s*User authorization(?: to dispatch)?\s*:/i.test(line)) {
        sawAuthorization = true
        return authorization
      }
      if (/^\s*Source prompt after approval\s*:/i.test(line)) return `Source prompt: prompt/${id}.md`
      return line
    })
    if (!sawAuthorization) {
      const index = updated.findIndex(line => /^Delivery status:/.test(line))
      updated.splice(index + 1, 0, authorization)
    }
    if (!updated.some(line => /^\s*Source prompt\s*:/i.test(line))) {
      const index = updated.findIndex(line => /^\s*Report path\s*:/i.test(line))
      updated.splice(index === -1 ? updated.length : index, 0, `Source prompt: prompt/${id}.md`)
    }
    return [...updated, ...rest].join('\n')
  }

  async function appendLog(name, entry) {
    const file = await withinProject(base, `${stateDir}/${name}`)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(entry)}\n`, { flag: 'a' })
  }

  // The one protected publication path, shared by manual and automatic sends. The caller holds the send
  // lock and has just scanned; `item` is that scan's draft, so the published text is exactly the hashed text.
  async function publishDraft(item, hash, authorization, record) {
    if (!item.draftText) throw new PanelError(409, 'This task was already published. It cannot be sent again.')
    if (item.state === 'superseded') throw new PanelError(409, 'This draft is superseded and can never be sent.')
    if (item.state !== 'draft') throw new PanelError(422, `This draft cannot be sent: ${item.problems.join(' ')}`)
    if (item.draftHash !== hash) throw new PanelError(409, 'The draft changed after you reviewed it. Review the new version before sending.')
    if (!item.canSend) throw new PanelError(409, item.sendBlockedReason)
    await publishAtomically(approvedContent(item.draftText, item.id, authorization), item.sourcePrompt, item.id)
    await appendLog('approvals.jsonl', { action: 'send', id: item.id, hash, ...record })
    return { id: item.id, published: item.sourcePrompt, reportPath: item.reportPath, at: record.at }
  }

  // The click on "Send to Claude" is the user's approval for exactly the draft content they reviewed.
  function send(id, reviewedHash) {
    if (typeof id !== 'string' || !TASK_ID_PATTERN.test(id)) return Promise.reject(new PanelError(400, 'Invalid task ID.'))
    if (typeof reviewedHash !== 'string' || !/^[a-f0-9]{64}$/.test(reviewedHash)) return Promise.reject(new PanelError(400, 'Missing the reviewed draft hash.'))
    return serialized(async () => {
      const lockPath = await acquireLock()
      try {
        const state = await scan()
        const item = state.tasks.find(task => task.id === id)
        if (!item) throw new PanelError(404, 'No draft with that task ID.')
        const at = now().toISOString()
        const authorization = `User authorization: Browser-button approval. The user clicked "Send to Claude" in the local task panel for task ${id} at ${at}, approving the reviewed draft prompt/drafts/${id}.md with SHA-256 ${reviewedHash}.`
        return await publishDraft(item, reviewedHash, authorization, { at, method: 'browser-button' })
      } finally {
        await unlink(lockPath).catch(() => {})
      }
    })
  }

  // ---------- Auto-send (opt-in, future-only) ----------
  // Activation lives only in this server process's memory: a restart, an expired lease, or Off ends it.
  // It authorizes publishing drafts whose identity (file name and Task ID) did not exist at activation,
  // one at a time, only inside a tick from the page that holds the activation's secret lease.
  let auto = null
  let autoRevision = 0
  // The activating page renews its lease with every tick; a draft must stay unchanged before it is sent.
  const LEASE_MS = autoSendTiming.leaseMs ?? 15000
  const STABLE_MS = autoSendTiming.stableMs ?? 3000

  async function draftIdentities() {
    const ids = new Set()
    for (const name of await listMarkdown('prompt/drafts')) {
      ids.add(name.slice(0, -3))
      const file = await readRegular(`prompt/drafts/${name}`)
      const declared = file ? parseMetadata(file.text).taskId : undefined
      if (declared) ids.add(declared)
    }
    return ids
  }

  const reported = task => task.state === 'report' || task.state === 'blocked'
  const draftStem = item => (item.draftFile ? path.posix.basename(item.draftFile, '.md') : item.id)

  function expireIfStale() {
    if (auto && now().getTime() - auto.lastSeen > LEASE_MS) {
      const ended = auto
      auto = null
      autoRevision++
      return appendLog('auto-send.jsonl', { action: 'expired', activation: ended.id, at: now().toISOString() }).catch(() => {})
    }
    return null
  }

  function autoStatus() {
    if (!auto) return { on: false, revision: autoRevision }
    return {
      on: true,
      revision: autoRevision,
      activation: auto.id,
      activatedAt: auto.activatedAt,
      excluded: auto.baseline.size,
      paused: auto.paused,
      waitingFor: auto.waitingFor,
      queue: auto.queue,
      sent: auto.sent,
      lastError: auto.lastError,
    }
  }

  function requireLease(lease) {
    if (!auto) throw new PanelError(409, 'Auto-send is off.')
    if (typeof lease !== 'string' || lease !== auto.lease) throw new PanelError(403, 'Auto-send was turned on from another page. Only that page can run it.')
  }

  function activateAutoSend() {
    return serialized(async () => {
      await expireIfStale()
      if (auto) throw new PanelError(409, 'Auto-send is already on in another page. Turn it off there, or turn it off here first.')
      const state = await scan()
      const at = now()
      auto = {
        id: randomUUID(),
        lease: randomUUID() + randomUUID(),
        activatedAt: at.toISOString(),
        lastSeen: at.getTime(),
        baseline: await draftIdentities(),
        reportedAtStart: new Set(state.tasks.filter(reported).map(task => task.id)),
        handled: new Set(),
        seen: new Map(),
        sent: [],
        queue: [],
        waitingFor: state.active,
        paused: null,
        lastError: null,
      }
      autoRevision++
      await appendLog('auto-send.jsonl', { action: 'on', activation: auto.id, at: auto.activatedAt, excludedDrafts: [...auto.baseline].sort() })
      return { lease: auto.lease, status: autoStatus() }
    })
  }

  // Off is allowed from any page with the panel token. Because it is serialized with publication,
  // no automatic publication can start after Off is confirmed; one already published stays published.
  function deactivateAutoSend(reason = 'off') {
    return serialized(async () => {
      await expireIfStale()
      if (auto) {
        await appendLog('auto-send.jsonl', { action: reason, activation: auto.id, at: now().toISOString(), sent: auto.sent.map(item => item.id) })
        auto = null
        autoRevision++
      }
      return { status: autoStatus() }
    })
  }

  function resumeAutoSend(lease) {
    return serialized(async () => {
      await expireIfStale()
      requireLease(lease)
      if (auto.paused) {
        auto.handled.add(auto.paused.id)
        await appendLog('auto-send.jsonl', { action: 'resume', activation: auto.id, at: now().toISOString(), after: auto.paused.id })
        auto.paused = null
        autoRevision++
      }
      auto.lastSeen = now().getTime()
      return { status: autoStatus() }
    })
  }

  // One evaluation step, called by the activating page while it is open. Publishes at most one draft.
  function tickAutoSend(lease) {
    return serialized(async () => {
      await expireIfStale()
      requireLease(lease)
      const at = now()
      auto.lastSeen = at.getTime()
      const before = JSON.stringify([auto.paused, auto.waitingFor, auto.queue, auto.lastError])
      const lockPath = await acquireLock()
      let published = null
      try {
        const state = await scan()
        // Reports received during this activation: questions or a blocker pause dependent automatic work.
        for (const task of state.tasks) {
          if (!reported(task) || auto.reportedAtStart.has(task.id) || auto.handled.has(task.id) || auto.paused?.id === task.id) continue
          if (task.state === 'blocked' || task.hasQuestions) {
            if (!auto.paused) auto.paused = { id: task.id, title: task.title, reason: task.state === 'blocked' ? 'blocked' : 'questions' }
          } else auto.handled.add(task.id)
        }
        const drafts = state.tasks.filter(task => task.draftText !== undefined && (task.state === 'draft' || task.state === 'malformed'))
        const inScope = drafts.filter(task => !auto.baseline.has(task.id) && !auto.baseline.has(draftStem(task)))
        for (const id of [...auto.seen.keys()]) if (!inScope.some(task => task.id === id)) auto.seen.delete(id)
        for (const task of inScope) {
          const seen = auto.seen.get(task.id)
          if (!seen || seen.hash !== task.draftHash) auto.seen.set(task.id, { hash: task.draftHash, since: at.getTime() })
        }
        auto.queue = inScope.filter(task => task.state === 'draft').map(task => task.id)
        auto.waitingFor = state.active
        if (!auto.paused && state.active.length === 0) {
          // Complete and unchanged for a short while, so a draft that is still being written is never sent.
          const ready = inScope
            .filter(task => task.state === 'draft' && task.canSend && at.getTime() - auto.seen.get(task.id).since >= STABLE_MS)
            .sort((a, b) => auto.seen.get(a.id).since - auto.seen.get(b.id).since || a.id.localeCompare(b.id))
          const next = ready[0]
          if (next) {
            const when = at.toISOString()
            const authorization = `User authorization: Auto-send. The user turned on Auto-send in the local task panel at ${auto.activatedAt} (activation ${auto.id}). This draft, prompt/drafts/${next.id}.md, was first seen after that activation and was published automatically at ${when} with SHA-256 ${next.draftHash}. It was not individually reviewed or clicked.`
            try {
              published = await publishDraft(next, next.draftHash, authorization, { at: when, method: 'auto-send', activation: auto.id, activatedAt: auto.activatedAt })
              auto.sent.push({ id: next.id, at: when, hash: next.draftHash })
              auto.queue = auto.queue.filter(id => id !== next.id)
              auto.waitingFor = [next.id]
              auto.lastError = null
            } catch (error) {
              auto.lastError = { id: next.id, message: error.message, at: when }
            }
          }
        }
      } finally {
        await unlink(lockPath).catch(() => {})
      }
      if (published || before !== JSON.stringify([auto.paused, auto.waitingFor, auto.queue, auto.lastError])) autoRevision++
      return { status: autoStatus(), published }
    })
  }

  const autoSend = {
    activate: activateAutoSend,
    deactivate: () => deactivateAutoSend('off'),
    resume: resumeAutoSend,
    tick: tickAutoSend,
    status: () => { void expireIfStale(); return autoStatus() },
  }

  return { root: base, scan, send, autoSend }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}
