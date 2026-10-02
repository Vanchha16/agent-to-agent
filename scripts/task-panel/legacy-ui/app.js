'use strict'

// <lifecycle>
// Pure helper (no DOM): turns successive /api/state snapshots into one-time lifecycle events.
// The first snapshot is a silent baseline, so history never replays; every event is keyed by
// task + transition (+ report identity) and is emitted at most once. Tested in task-panel.test.mjs.
function createLifecycleTracker() {
  const ACTIVE = new Set(['published', 'working'])
  const DONE = new Set(['report', 'blocked'])
  const emitted = new Set()
  let known = null

  const reportKey = task => {
    const text = task.reportText ?? ''
    let hash = 5381
    for (let index = 0; index < text.length; index++) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0
    return `${task.state}:${hash.toString(36)}`
  }
  const keyOf = (id, type, detail = '') => `${id}|${type}|${detail}`

  function baseline(task) {
    if (ACTIVE.has(task.state) || DONE.has(task.state)) emitted.add(keyOf(task.id, 'published'))
    if (task.state === 'working' || DONE.has(task.state)) emitted.add(keyOf(task.id, 'acknowledged'))
    if (DONE.has(task.state)) emitted.add(keyOf(task.id, 'report', reportKey(task)))
    if (task.state === 'draft') emitted.add(keyOf(task.id, 'draft'))
  }

  function push(events, type, task, detail = '') {
    const key = keyOf(task.id, type, detail)
    if (emitted.has(key)) return
    emitted.add(key)
    events.push({ type, id: task.id, title: task.title, outcome: task.outcome ?? null, hasQuestions: Boolean(task.hasQuestions), state: task.state })
  }

  return {
    observe(tasks) {
      const next = new Map(tasks.map(task => [task.id, task]))
      if (!known) {
        for (const task of tasks) baseline(task)
        known = next
        return []
      }
      const events = []
      for (const task of tasks) {
        const before = known.get(task.id)?.state
        if (task.state === 'draft' && before !== 'draft') push(events, 'draft', task)
        if (ACTIVE.has(task.state) && !ACTIVE.has(before) && !DONE.has(before)) push(events, 'published', task)
        if (task.state === 'working' && before !== 'working' && !DONE.has(before)) push(events, 'acknowledged', task)
        if (DONE.has(task.state)) push(events, 'report', task, reportKey(task))
      }
      known = next
      return events
    },
    // Called after this page's own successful send, so the next poll does not announce it twice.
    markSeen(id, type) { emitted.add(keyOf(id, type)) },
  }
}
// </lifecycle>

const token = document.querySelector('meta[name="panel-token"]').content
const listBody = document.getElementById('list-body')
const detail = document.getElementById('detail')
const live = document.getElementById('live')
const toast = document.getElementById('toast')
const announcer = document.getElementById('announcer')
const cards = { you: document.getElementById('card-you'), codex: document.getElementById('card-codex'), claude: document.getElementById('card-claude') }
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

const LABELS = {
  draft: 'Plan awaiting your approval',
  malformed: 'Plan needs fixing',
  superseded: 'Superseded',
  published: 'Waiting for Claude\'s receipt',
  working: 'Claude acknowledged · working',
  report: 'Report received',
  blocked: 'Blocked — needs your decision',
}
const SHORT = { draft: 'Awaiting approval', malformed: 'Needs fixing', superseded: 'Superseded', published: 'Waiting for receipt', working: 'Working', report: 'Report received', blocked: 'Blocked' }
const GROUPS = [
  ['Awaiting your approval', ['draft', 'malformed']],
  ['With Claude', ['published', 'working']],
  ['History', ['report', 'blocked', 'superseded']],
]

let state = null
let selectedId = null
let reviewed = null // { id, hash } of the draft content currently on screen
let changedId = null // draft that changed while it was on screen
let sending = false
let view = { prompt: 'formatted', report: 'formatted' }
let lastOk = 0
let failing = false
const tracker = createLifecycleTracker()
const newReports = new Set() // reports that arrived while this page was open and haven't been opened yet
const flashRows = new Set()
let revealReportFor = null

// ---------- helpers ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else node.setAttribute(key, value === true ? '' : value)
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

function showToast(message, bad = false) {
  toast.setAttribute('aria-live', bad ? 'assertive' : 'polite')
  toast.textContent = message
  toast.className = bad ? 'toast bad' : 'toast'
  toast.hidden = false
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => { toast.hidden = true }, bad ? 9000 : 6000)
}

function announce(message) {
  announcer.textContent = ''
  setTimeout(() => { announcer.textContent = message }, 50)
}

function ago(ms) {
  if (!ms) return ''
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

async function api(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'X-Panel-Token': token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
    })
  } catch {
    const error = new Error('Couldn\'t reach the panel server, so nothing was sent. Start it with npm.cmd run panel:start, then try again.')
    error.code = 'network'
    throw error
  }
  let body = null
  try { body = await response.json() } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status}).`)
    error.status = response.status
    error.code = body?.code
    throw error
  }
  return body
}

// ---------- safe Markdown rendering (DOM nodes only, never innerHTML) ----------
function inline(text) {
  const out = []
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)/g
  let last = 0
  let match
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const piece = match[0]
    if (match[1]) out.push(el('code', { text: piece.slice(1, -1) }))
    else if (match[2]) out.push(el('strong', {}, ...inline(piece.slice(2, -2))))
    else if (match[3]) {
      const [, label, url] = piece.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      // Links are shown as text so nothing in a prompt or report can navigate the panel.
      out.push(el('span', {}, ...inline(label)), ' ', el('span', { class: 'link-url', text: `(${url})` }))
    } else out.push(el('em', {}, ...inline(piece.slice(1, -1))))
    last = match.index + piece.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderMarkdown(source) {
  const root = el('div', { class: 'doc' })
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  const isBlockStart = line => /^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|\|.*\|\s*$|---+\s*$)/.test(line)
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.startsWith('```')) {
      const code = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      root.append(el('pre', {}, el('code', { text: code.join('\n') })))
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4)
      root.append(el(`h${level}`, {}, ...inline(heading[2])))
      i++
      continue
    }
    if (/^---+\s*$/.test(line)) { root.append(el('hr')); i++; continue }
    if (/^\|.*\|\s*$/.test(line)) {
      const rows = []
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++])
      const cells = row => row.trim().slice(1, -1).split('|').map(cell => cell.trim())
      const table = el('table')
      const body = rows.filter(row => !/^\|[\s:|-]+\|\s*$/.test(row))
      body.forEach((row, index) => {
        const tr = el('tr')
        for (const cell of cells(row)) tr.append(el(index === 0 && rows.length > 1 ? 'th' : 'td', {}, ...inline(cell)))
        table.append(tr)
      })
      root.append(el('div', { class: 'table-wrap' }, table))
      continue
    }
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2])
      const list = el(ordered ? 'ol' : 'ul')
      let current = null
      while (i < lines.length) {
        const item = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
        if (item && item[1].length < 2) {
          current = el('li', {}, ...inline(item[3]))
          list.append(current)
          i++
        } else if (item && current) {
          // Nested item: keep it readable as an indented line inside the parent item.
          current.append(el('br'), '  • ', ...inline(item[3]))
          i++
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && current) {
          current.append(' ', ...inline(lines[i].trim()))
          i++
        } else break
      }
      root.append(list)
      continue
    }
    const paragraph = []
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++].trim())
    if (!paragraph.length) paragraph.push(lines[i++].trim())
    const p = el('p')
    paragraph.forEach((text, index) => {
      if (index) p.append(el('br'))
      p.append(...inline(text))
    })
    root.append(p)
  }
  return root
}

function documentView(text, key) {
  const raw = view[key] === 'raw'
  return raw ? el('pre', { class: 'doc raw', text }) : renderMarkdown(text)
}

function viewToggle(key, label) {
  const make = (mode, text) => el('button', {
    type: 'button', 'aria-pressed': String(view[key] === mode),
    onclick: () => { view[key] = mode; renderDetail() },
  }, text)
  return el('div', { class: 'toggle', role: 'group', 'aria-label': `${label} view` }, make('formatted', 'Formatted'), make('raw', 'Raw text'))
}

// ---------- portraits ----------
for (const slot of document.querySelectorAll('[data-portrait]')) {
  const template = document.getElementById(`tpl-${slot.dataset.portrait}`)
  if (template) slot.append(template.content.cloneNode(true))
}

// ---------- team cards and overview (every value comes from /api/state) ----------
function counts(tasks) {
  const by = name => tasks.filter(task => task.state === name)
  const reports = tasks.filter(task => task.state === 'report' || task.state === 'blocked')
  return {
    drafts: by('draft'),
    malformed: by('malformed'),
    published: by('published'),
    working: by('working'),
    reports,
    questions: reports.filter(task => task.state === 'blocked' || task.hasQuestions),
    blocked: by('blocked'),
  }
}

const newest = list => [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0]

function setCard(card, cardState, status, task, extra) {
  card.dataset.state = cardState
  const statusNode = card.querySelector('[data-status]')
  statusNode.replaceChildren(status, extra ?? '')
  const taskButton = card.querySelector('[data-task]')
  if (task) {
    taskButton.hidden = false
    taskButton.textContent = task.title
    taskButton.onclick = () => select(task.id, true)
    taskButton.setAttribute('aria-label', `Open task: ${task.title}`)
  } else {
    taskButton.hidden = true
    taskButton.onclick = null
  }
}

function renderTeam() {
  if (!state) return
  const c = counts(state.tasks)
  const firstDraft = newest(c.drafts)
  setCard(cards.you, c.drafts.length ? 'ready' : 'idle',
    c.drafts.length ? `${plural(c.drafts.length, 'plan', 'plans')} waiting for your approval` : 'Nothing waiting for your approval',
    firstDraft)

  if (c.drafts.length) setCard(cards.codex, 'ready', 'Plan ready for your review', firstDraft)
  else if (c.malformed.length) setCard(cards.codex, 'attention', 'A plan needs fixing before it can be sent', newest(c.malformed))
  else setCard(cards.codex, 'idle', 'No plan waiting right now', null)

  const active = newest([...c.working, ...c.published])
  const lastReport = newest(c.reports)
  if (active?.state === 'working') {
    setCard(cards.claude, 'working', 'Acknowledged · working', active,
      reducedMotion.matches ? null : el('span', { class: 'dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')))
  } else if (active) setCard(cards.claude, 'waiting', 'Sent · not yet acknowledged', active)
  else if (lastReport && (lastReport.state === 'blocked' || lastReport.hasQuestions)) setCard(cards.claude, 'attention', 'Latest report needs your decision', lastReport)
  else if (lastReport) setCard(cards.claude, 'report', 'No active task · last report received', lastReport)
  else setCard(cards.claude, 'idle', 'No active task', null)
}

function renderTiles(previous) {
  if (!state) return
  const c = counts(state.tasks)
  const values = {
    approval: [c.drafts.length, c.malformed.length ? `${plural(c.malformed.length, 'plan needs', 'plans need')} fixing` : c.drafts.length ? 'Review and send' : 'No plans waiting'],
    claude: [c.published.length + c.working.length, c.working.length ? 'Acknowledged by Claude' : c.published.length ? 'Not yet acknowledged' : 'No active task'],
    reports: [c.reports.length, 'Received — review them with Codex'],
    questions: [c.questions.length, c.blocked.length ? `${c.blocked.length} blocked` : 'Questions or follow-ups noted'],
  }
  for (const [name, [value, note]] of Object.entries(values)) {
    const tile = document.querySelector(`[data-tile="${name}"]`)
    const valueNode = tile.querySelector('.value')
    if (previous && valueNode.textContent !== String(value)) {
      tile.classList.remove('bump')
      void tile.offsetWidth
      tile.classList.add('bump')
    }
    valueNode.textContent = String(value)
    tile.querySelector('.note').textContent = note
  }
}

// ---------- list ----------
function renderList() {
  const focusedId = document.activeElement?.closest?.('.task')?.dataset.id
  listBody.replaceChildren()
  if (!state) return
  if (!state.tasks.length) {
    listBody.append(el('p', { class: 'list-empty', text: 'No tasks yet. When Codex saves a plan in prompt/drafts/, it appears here for your approval.' }))
    return
  }
  for (const [title, states] of GROUPS) {
    const items = state.tasks.filter(task => states.includes(task.state))
    listBody.append(el('h3', { class: 'group-title', text: title }))
    if (!items.length) {
      listBody.append(el('p', { class: 'list-empty', text: title === 'Awaiting your approval' ? 'No plans waiting. New plans from Codex appear here.' : title === 'With Claude' ? 'No active task.' : 'Nothing here yet.' }))
      continue
    }
    for (const task of items) {
      const row = el('button', {
        type: 'button', class: `task${flashRows.has(task.id) ? ' flash' : ''}`, 'data-id': task.id, 'aria-current': String(task.id === selectedId),
        onclick: () => select(task.id, true),
      },
      el('span', { class: 't', text: task.title }),
      newReports.has(task.id) ? el('span', { class: 'new', text: 'New' }) : null,
      el('span', { class: 'meta' },
        el('span', { class: `badge b-${task.state}`, text: SHORT[task.state] }),
        task.hasQuestions && task.state !== 'blocked' ? el('span', { class: 'badge b-questions', text: 'Questions' }) : null,
        el('span', { class: 'when', text: ago(task.updatedAt) })))
      listBody.append(row)
    }
  }
  flashRows.clear()
  if (focusedId) listBody.querySelector(`.task[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true })
}

listBody.addEventListener('keydown', event => {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
  const buttons = [...listBody.querySelectorAll('.task')]
  const index = buttons.indexOf(document.activeElement)
  if (index === -1) return
  event.preventDefault()
  const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
  next.focus()
})

function select(id, moveFocus = false) {
  selectedId = id
  changedId = null
  newReports.delete(id)
  view = { prompt: 'formatted', report: 'formatted' }
  renderList()
  renderDetail()
  if (moveFocus) detail.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' })
}

// ---------- detail ----------
function stages(task) {
  // Codex drafts -> You approve -> Claude receives -> Claude reports.
  const steps = [
    ['Codex', 'Plan drafted'],
    ['You', 'Approved'],
    ['Claude', 'Receipt confirmed'],
    ['Claude', 'Report'],
  ]
  const reached = { draft: 0, published: 1, working: 2, report: 3, blocked: 3 }[task.state]
  const needsDecision = task.state === 'blocked' || task.hasQuestions
  const nowLabel = { draft: 'Awaiting your approval', published: 'Waiting for receipt', working: 'Working on report' }[task.state]
  return el('ol', { class: 'stages', 'aria-label': 'Workflow' }, steps.map(([owner, label], index) => {
    let cls = index <= reached ? 'done' : index === reached + 1 ? 'now' : ''
    let text = cls === 'now' ? nowLabel : label
    if (index === 3 && reached === 3) {
      cls = needsDecision ? 'attention' : 'done'
      text = task.state === 'blocked' ? 'Blocked — your decision' : needsDecision ? 'Received · has questions' : 'Received'
    }
    return el('li', { class: cls, 'aria-current': cls === 'now' ? 'step' : null },
      el('span', { class: 'owner', text: owner }), el('span', { class: 'label', text }))
  }))
}

function explain(task) {
  switch (task.state) {
    case 'draft': return task.canSend
      ? 'Review the plan below. Sending approves this exact version.'
      : 'This plan is ready, but it can\'t be sent yet.'
    case 'malformed': return 'This plan is missing required details, so it can\'t be sent. Ask Codex to fix it — it updates here automatically.'
    case 'superseded': return 'This plan was replaced by a newer one and can never be sent.'
    case 'published': return 'Sent. Claude hasn\'t confirmed receiving it yet.'
    case 'working': return 'Claude confirmed receipt and is working on it. The report will appear here.'
    case 'report': return 'Claude\'s report is below. A report is Claude\'s account of the work — go over it with Codex.'
    case 'blocked': return 'Claude stopped and needs a decision from you. Discuss the questions below with Codex.'
    default: return ''
  }
}

function renderDetail() {
  const task = state?.tasks.find(item => item.id === selectedId)
  if (!task) {
    detail.replaceChildren(el('div', { class: 'empty-detail' },
      el('h2', { text: state ? 'Pick a task' : 'Loading…' }),
      el('p', { text: state ? 'Choose a plan to review it, or a sent task to see Claude\'s report.' : 'Reading plans and reports from the project folder.' })))
    reviewed = null
    return
  }
  const parts = [
    el('div', { class: 'd-head' },
      el('div', {}, el('h2', { text: task.title }), el('p', { class: 'd-id', text: `Task ID: ${task.id}` })),
      el('span', { class: `badge b-${task.state}`, text: LABELS[task.state] })),
  ]
  if (!['malformed', 'superseded'].includes(task.state)) parts.push(stages(task))
  parts.push(el('p', { class: 'explain', text: explain(task) }))

  if (task.problems?.length && task.state !== 'superseded') {
    parts.push(el('div', { class: `notice ${task.state === 'malformed' ? 'n-bad' : 'n-warn'}` },
      el('strong', { text: task.state === 'malformed' ? 'Why this plan can\'t be sent' : 'Note' }),
      el('ul', {}, task.problems.map(problem => el('li', { text: problem })))))
  }

  if (task.draftText !== undefined && ['draft', 'malformed', 'superseded'].includes(task.state)) {
    if (reviewed && reviewed.id === task.id && reviewed.hash !== task.draftHash) changedId = task.id
    if (changedId === task.id) {
      parts.push(el('div', { class: 'notice n-warn', text: 'This plan changed while you were viewing it. The new version is shown below — review it again before sending.' }))
    }
    reviewed = { id: task.id, hash: task.draftHash }
    if (task.state === 'draft' && !task.canSend && task.sendBlockedReason) parts.push(el('div', { class: 'notice n-info', text: task.sendBlockedReason }))
    // The action bar sits above the prompt and sticks to the top while a long prompt is scrolled.
    if (task.state === 'draft') {
      const sendButton = el('button', {
        type: 'button', class: `btn primary${sending ? ' is-sending' : ''}`, id: 'send', disabled: !task.canSend || sending,
        'aria-busy': sending ? 'true' : null,
        onclick: () => sendTask(task),
      }, sending ? [el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Sending…'] : 'Send to Claude')
      parts.push(el('div', { class: 'actions', role: 'group', 'aria-label': 'Approve this plan' },
        sendButton,
        el('button', { type: 'button', class: 'btn', id: 'wait', disabled: sending, onclick: () => waitTask(task) }, 'Wait'),
        el('p', { class: 'fine', text: 'Send this reviewed prompt to Claude. Wait keeps it as a draft.' })))
    }
    parts.push(el('div', { class: 'section-title' }, el('h3', { text: 'Full prompt' }), viewToggle('prompt', 'Prompt')))
    parts.push(documentView(task.draftText, 'prompt'))
  } else {
    reviewed = null
    if (task.state === 'blocked' || task.hasQuestions) {
      parts.push(el('div', { class: `notice ${task.state === 'blocked' ? 'n-bad' : 'n-warn'}`, text: task.state === 'blocked' ? 'Claude reported this task as blocked. See the questions and blockers in the report.' : 'The report includes questions or follow-up steps. See its questions/blockers section.' }))
    }
    if (task.reportText) {
      const block = el('div', { class: `report-block${revealReportFor === task.id && !reducedMotion.matches ? ' reveal' : ''}` },
        el('div', { class: 'section-title' }, el('h3', { text: 'Claude\'s report' }), viewToggle('report', 'Report')),
        documentView(task.reportText, 'report'))
      parts.push(block)
    } else {
      parts.push(el('div', { class: 'notice n-info', text: 'Waiting for Claude\'s report. It will appear here automatically.' }))
      if (task.progressText) parts.push(el('details', { class: 'more', open: true }, el('summary', { text: 'Claude\'s progress receipt' }), renderMarkdown(task.progressText)))
    }
    parts.push(el('details', { class: 'more' }, el('summary', { text: 'Approved prompt' }), renderMarkdown(task.promptText)))
  }
  revealReportFor = null
  detail.replaceChildren(...parts)
}

// ---------- motion (real events only) ----------
function pulse(card) {
  if (reducedMotion.matches) return
  card.classList.remove('receive')
  void card.offsetWidth
  card.classList.add('receive')
}

const visible = rect => rect && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight

// Point at a card even when it is scrolled out of view: clamp the target to the nearest viewport edge.
function towards(rect) {
  if (!rect || rect.width === 0) return null
  const x = Math.min(Math.max(rect.left, 8), window.innerWidth - rect.width - 8)
  const y = Math.min(Math.max(rect.top, -rect.height / 2), window.innerHeight - rect.height / 2)
  return { left: x, top: y, width: rect.width, height: rect.height, bottom: y + rect.height }
}

function flyToken(from, to, label) {
  to = towards(to)
  if (reducedMotion.matches || !visible(from) || !to || !document.body.animate) return Promise.resolve(false)
  const chip = el('div', { class: 'handoff', 'aria-hidden': 'true', text: label })
  document.body.append(chip)
  const start = [from.left + from.width / 2 - chip.offsetWidth / 2, from.top + from.height / 2 - chip.offsetHeight / 2]
  const end = [to.left + to.width / 2 - chip.offsetWidth / 2, to.top + to.height / 2 - chip.offsetHeight / 2]
  const lift = Math.min(start[1], end[1]) - 40
  const animation = chip.animate([
    { transform: `translate(${start[0]}px, ${start[1]}px) scale(.9)`, opacity: 0 },
    { transform: `translate(${start[0]}px, ${start[1]}px) scale(1)`, opacity: 1, offset: 0.15 },
    { transform: `translate(${(start[0] + end[0]) / 2}px, ${lift}px) scale(1)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${end[0]}px, ${end[1]}px) scale(.6)`, opacity: 0 },
  ], { duration: 620, easing: 'cubic-bezier(.2, .8, .2, 1)' })
  return animation.finished.then(() => true, () => false).finally(() => chip.remove())
}

const portraitRect = card => card.querySelector('.portrait')?.getBoundingClientRect()

function handleEvents(events) {
  for (const event of events) {
    if (event.type === 'draft') {
      flashRows.add(event.id)
      pulse(cards.codex)
      announce(`New plan from Codex is waiting for your approval: ${event.title}.`)
    } else if (event.type === 'published') {
      flashRows.add(event.id)
      pulse(cards.claude)
      announce(`${event.title} was sent to Claude and is waiting for Claude's receipt.`)
    } else if (event.type === 'acknowledged') {
      flashRows.add(event.id)
      pulse(cards.claude)
      announce(`Claude acknowledged ${event.title} and is working on it.`)
    } else if (event.type === 'report') {
      const attention = event.state === 'blocked' || event.hasQuestions
      flashRows.add(event.id)
      if (event.id === selectedId) revealReportFor = event.id
      else newReports.add(event.id)
      pulse(cards.claude)
      const fromClaude = portraitRect(cards.claude)
      if (visible(fromClaude)) flyToken(fromClaude, portraitRect(cards.you), 'Report').then(() => pulse(cards.you))
      announce(event.state === 'blocked'
        ? `Claude reported ${event.title} as blocked. It needs your decision.`
        : attention ? `New report from Claude on ${event.title}. It includes questions.` : `New report from Claude on ${event.title}.`)
    }
  }
}

async function sendTask(task) {
  if (sending || !reviewed || reviewed.id !== task.id) return
  sending = true
  renderDetail()
  const origin = document.getElementById('send')?.getBoundingClientRect()
  let sent = false
  try {
    await api('/api/send', { method: 'POST', body: JSON.stringify({ id: task.id, hash: reviewed.hash }) })
    sent = true
    tracker.markSeen(task.id, 'published')
  } catch (error) {
    showToast(error.code === 'token' ? 'This page session expired. Reload the page, review the plan, and try again.' : error.message, true)
  } finally {
    sending = false
    await refresh(true)
    // If the refresh failed too, the detail still shows "Sending…"; redraw it from the last known state.
    renderDetail()
  }
  if (!sent) return
  // A successful publication: the task file exists. Claude has not confirmed receipt yet.
  flyToken(origin, portraitRect(cards.claude), task.title).then(() => pulse(cards.claude))
  showToast('Sent to Claude. Waiting for Claude\'s receipt — keep Claude\'s terminal open.')
  announce(`${task.title} was sent to Claude and is waiting for Claude's receipt.`)
}

function waitTask(task) {
  showToast(`Not sent. "${task.title}" stays as a draft; nothing was published.`)
  document.querySelector(`.task[data-id="${CSS.escape(task.id)}"]`)?.focus()
}

// ---------- polling ----------
async function refresh(force = false) {
  try {
    const next = await api('/api/state')
    lastOk = Date.now()
    failing = false
    live.className = 'live ok'
    if (!force && state && next.version === state.version) { updateLive(); return }
    const first = !state
    state = next
    const events = tracker.observe(state.tasks)
    if (!selectedId || !state.tasks.some(task => task.id === selectedId)) {
      selectedId = state.tasks.find(task => task.state === 'draft')?.id ?? state.tasks[0]?.id ?? null
    }
    handleEvents(events)
    renderTeam()
    renderTiles(!first)
    renderList()
    // Do not rebuild the detail while the user is pressing a button in it.
    if (!sending) renderDetail()
    updateLive()
  } catch (error) {
    failing = true
    live.className = 'live bad'
    live.textContent = error.code === 'token' ? 'Session expired — reload the page' : 'Panel server unreachable — is it still running?'
    if (!state) {
      listBody.replaceChildren(el('p', { class: 'list-empty', text: 'Could not load tasks. Start the panel with npm.cmd run panel:start, then reload this page.' }))
    }
  }
}

function updateLive() {
  if (failing) return
  const seconds = Math.round((Date.now() - lastOk) / 1000)
  live.textContent = `Project files checked ${seconds < 2 ? 'just now' : `${seconds}s ago`}`
}

refresh(true)
setInterval(() => refresh(), 2500)
setInterval(updateLive, 1000)
// Keep the relative times in the task list fresh without a full re-render of the detail.
setInterval(() => { if (state && !sending) renderList() }, 30000)
