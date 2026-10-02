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

export function createPanel({ root = PROJECT_ROOT, now = () => new Date() } = {}) {
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

  function approvedContent(draftText, id, hash, at) {
    const authorization = `User authorization: Browser-button approval. The user clicked "Send to Claude" in the local task panel for task ${id} at ${at}, approving the reviewed draft prompt/drafts/${id}.md with SHA-256 ${hash}.`
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
        if (!item.draftText) throw new PanelError(409, 'This task was already published. It cannot be sent again.')
        if (item.state === 'superseded') throw new PanelError(409, 'This draft is superseded and can never be sent.')
        if (item.state !== 'draft') throw new PanelError(422, `This draft cannot be sent: ${item.problems.join(' ')}`)
        if (item.draftHash !== reviewedHash) throw new PanelError(409, 'The draft changed after you reviewed it. Review the new version before sending.')
        if (!item.canSend) throw new PanelError(409, item.sendBlockedReason)
        const at = now().toISOString()
        await publishAtomically(approvedContent(item.draftText, id, reviewedHash, at), item.sourcePrompt, id)
        const log = await withinProject(base, `${stateDir}/approvals.jsonl`)
        await writeFile(log, `${JSON.stringify({ action: 'send', id, hash: reviewedHash, at, method: 'browser-button' })}\n`, { flag: 'a' })
        return { id, published: item.sourcePrompt, reportPath: item.reportPath, at }
      } finally {
        await unlink(lockPath).catch(() => {})
      }
    })
  }

  return { root: base, scan, send }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}
