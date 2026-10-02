import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { request } from 'node:http'
import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { after, test } from 'node:test'
import { PROJECT_ROOT, withinProject } from '../claude-bridge.mjs'
import { createPanel, reportMatches } from './core.mjs'
import { startPanelServer } from './server.mjs'
import { createLifecycleTracker } from './ui/src/lib/lifecycle.ts'
import { COLUMNS, boardColumn, deriveStudio, groupBoard, matchesFilter, stagesFor } from './ui/src/lib/derive.ts'
import { DEFAULT_TEMPLATE, TEMPLATES, TEMPLATE_IDS, TEMPLATE_STORAGE_KEY, loadTemplate, parseTemplateId, saveTemplate } from './ui/src/lib/templates.ts'

// A tiny stand-in for the Vite build (index.html + manifest + hashed assets) inside a fixture.
async function uiBuild(root) {
  const dir = path.join(root, 'ui-build')
  await mkdir(path.join(dir, '.vite'), { recursive: true })
  await mkdir(path.join(dir, 'assets'), { recursive: true })
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><meta name="panel-token" content="__PANEL_TOKEN__"><script type="module" src="/assets/index-abc123.js"></script><div id="root"></div>')
  await writeFile(path.join(dir, '.vite', 'manifest.json'), JSON.stringify({ 'index.html': { file: 'assets/index-abc123.js', css: ['assets/index-abc123.css'], isEntry: true }, evil: { file: '../../core.mjs' } }))
  await writeFile(path.join(dir, 'assets', 'index-abc123.js'), 'console.log("ui")')
  await writeFile(path.join(dir, 'assets', 'index-abc123.css'), 'body{}')
  await writeFile(path.join(dir, 'assets', 'not-in-manifest.js'), 'secret()')
  return dir
}

// Every fixture is an isolated fake project inside this project's .tmp/ folder.
// Nothing here publishes into the real prompt/ folder or talks to the real Claude monitor.
async function fixture(t) {
  const root = await withinProject(PROJECT_ROOT, `.tmp/panel-test-${randomUUID()}`)
  await mkdir(path.join(root, 'prompt', 'drafts'), { recursive: true })
  await mkdir(path.join(root, 'report'), { recursive: true })
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

const sha = text => createHash('sha256').update(text).digest('hex')

function draftText(id, { status = 'DRAFT - DO NOT EXECUTE', source = `\`prompt/${id}.md\``, report = `\`report/${id}-report.md\``, taskId = id, extra = '' } = {}) {
  return `# Task ${id}\n\nTask ID: ${taskId}\nDelivery status: ${status}\nUser authorization: pending\nProject root: fixture\nSource prompt after approval: ${source}\nReport path: ${report}\n${extra}\n## Goal\n\nDo the ${id} thing.\n`
}

async function addDraft(root, id, options) {
  const text = draftText(id, options)
  await writeFile(path.join(root, 'prompt', 'drafts', `${id}.md`), text)
  return { text, hash: sha(text) }
}

const reportText = (id, status = 'completed', extra = '') => `# Claude report: ${id}\n\nTask ID: ${id}\nSource prompt: \`prompt/${id}.md\`\nStatus: ${status}\n\n## Outcome\n\nDone.\n\n## Questions, missing requirements, or blockers\n\n${extra || 'None.'}\n`

const byId = (state, id) => state.tasks.find(task => task.id === id)

test('discovery lists actionable drafts and ignores templates, instructions, CLI records, and superseded drafts', async t => {
  const root = await fixture(t)
  await addDraft(root, 'alpha-task')
  await addDraft(root, 'old-idea', { status: 'SUPERSEDED - DO NOT EXECUTE' })
  await writeFile(path.join(root, 'prompt', 'CLAUDE_TASK_TEMPLATE.md'), draftText('template-x'))
  await writeFile(path.join(root, 'prompt', 'TO_CLAUDE.md'), '# Instructions\n\nDelivery status: APPROVED FOR EXECUTION\n')
  await writeFile(path.join(root, 'prompt', 'hello.md'), '# Hello\n\nAuthorization: the user said hi.\n')
  await mkdir(path.join(root, 'prompt', 'claude'))
  await writeFile(path.join(root, 'prompt', 'claude', 'cli-record.md'), draftText('cli-record', { status: 'APPROVED FOR EXECUTION' }))
  const state = await createPanel({ root }).scan()
  assert.deepEqual(state.tasks.map(task => task.id).sort(), ['alpha-task', 'old-idea'])
  assert.equal(byId(state, 'alpha-task').state, 'draft')
  assert.equal(byId(state, 'alpha-task').canSend, true)
  const old = byId(state, 'old-idea')
  assert.equal(old.state, 'superseded')
  assert.equal(old.canSend, false)
  assert.deepEqual(state.active, [])
})

test('malformed drafts are explained and never sendable', async t => {
  const root = await fixture(t)
  await addDraft(root, 'no-marker', { status: 'PENDING' })
  await addDraft(root, 'wrong-report', { report: 'report/../../outside.md' })
  await addDraft(root, 'wrong-source', { source: 'prompt/somewhere-else.md' })
  await addDraft(root, 'name-mismatch', { taskId: 'different-id' })
  await writeFile(path.join(root, 'prompt', 'drafts', 'Bad_Name.md'), draftText('Bad_Name'))
  const panel = createPanel({ root })
  const state = await panel.scan()
  for (const task of state.tasks) {
    assert.equal(task.state, 'malformed', task.id)
    assert.equal(task.canSend, false)
    assert.ok(task.problems.length > 0)
  }
  assert.match(byId(state, 'no-marker').problems.join(' '), /DRAFT - DO NOT EXECUTE/)
  assert.match(byId(state, 'wrong-report').problems.join(' '), /Report path must be report\/wrong-report-report.md/)
  const draft = byId(state, 'no-marker')
  await assert.rejects(panel.send('no-marker', draft.draftHash), { status: 422 })
  assert.deepEqual(await readdir(path.join(root, 'prompt')), ['drafts'])
})

test('clicking send publishes exactly one approved prompt with the recorded browser approval', async t => {
  const root = await fixture(t)
  const { text, hash } = await addDraft(root, 'alpha-task')
  const panel = createPanel({ root, now: () => new Date('2026-10-01T12:00:00.000Z') })
  const result = await panel.send('alpha-task', hash)
  assert.equal(result.published, 'prompt/alpha-task.md')
  const published = await readFile(path.join(root, 'prompt', 'alpha-task.md'), 'utf8')
  assert.match(published, /^Delivery status: APPROVED FOR EXECUTION$/m)
  assert.match(published, /^Task ID: alpha-task$/m)
  assert.match(published, /^Source prompt: prompt\/alpha-task\.md$/m)
  assert.match(published, /^Report path: `report\/alpha-task-report\.md`$/m)
  assert.match(published, new RegExp(`^User authorization: Browser-button approval\\. The user clicked "Send to Claude" in the local task panel for task alpha-task at 2026-10-01T12:00:00\\.000Z, approving the reviewed draft prompt/drafts/alpha-task\\.md with SHA-256 ${hash}\\.$`, 'm'))
  assert.doesNotMatch(published, /DRAFT - DO NOT EXECUTE|pending/)
  assert.match(published, /Do the alpha-task thing\./)
  assert.equal(await readFile(path.join(root, 'prompt', 'drafts', 'alpha-task.md'), 'utf8'), text, 'draft is preserved unchanged')
  assert.deepEqual((await readdir(path.join(root, 'prompt'))).sort(), ['alpha-task.md', 'drafts'])
  assert.deepEqual(await readdir(path.join(root, '.tmp', 'task-panel', 'staging')), [], 'no staging leftovers')
  const log = (await readFile(path.join(root, '.tmp', 'task-panel', 'approvals.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(log, [{ action: 'send', id: 'alpha-task', hash, at: '2026-10-01T12:00:00.000Z', method: 'browser-button' }])

  const state = await panel.scan()
  assert.equal(byId(state, 'alpha-task').state, 'published')
  assert.deepEqual(state.active, ['alpha-task'])
  await assert.rejects(panel.send('alpha-task', hash), { status: 409 }, 'a published task cannot be sent again')
})

test('a draft changed after review is rejected and nothing is published', async t => {
  const root = await fixture(t)
  const { hash } = await addDraft(root, 'alpha-task')
  const panel = createPanel({ root })
  await writeFile(path.join(root, 'prompt', 'drafts', 'alpha-task.md'), draftText('alpha-task', { extra: 'Extra scope added later.\n' }))
  await assert.rejects(panel.send('alpha-task', hash), { status: 409, message: /changed after you reviewed it/ })
  await assert.rejects(panel.send('alpha-task', 'f'.repeat(64)), { status: 409 })
  assert.deepEqual(await readdir(path.join(root, 'prompt')), ['drafts'])
})

test('double clicks and simultaneous sends publish only one task', async t => {
  const root = await fixture(t)
  const a = await addDraft(root, 'alpha-task')
  const b = await addDraft(root, 'beta-task')
  const panel = createPanel({ root })
  const same = await Promise.allSettled([panel.send('alpha-task', a.hash), panel.send('alpha-task', a.hash)])
  assert.equal(same.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(same.find(result => result.status === 'rejected').reason.status, 409)
  assert.deepEqual((await readdir(path.join(root, 'prompt'))).sort(), ['alpha-task.md', 'drafts'])

  // Two independent panel processes racing for different drafts: still only one active task.
  const root2 = await fixture(t)
  const c = await addDraft(root2, 'gamma-task')
  const d = await addDraft(root2, 'delta-task')
  const results = await Promise.allSettled([createPanel({ root: root2 }).send('gamma-task', c.hash), createPanel({ root: root2 }).send('delta-task', d.hash)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await readdir(path.join(root2, 'prompt'))).filter(name => name.endsWith('.md')).length, 1)
  void b
})

test('only one approved task can be active, and the lock survives a server restart', async t => {
  const root = await fixture(t)
  const a = await addDraft(root, 'alpha-task')
  const b = await addDraft(root, 'beta-task')
  await createPanel({ root }).send('alpha-task', a.hash)

  const restarted = createPanel({ root }) // a fresh instance reads state only from disk
  let state = await restarted.scan()
  assert.deepEqual(state.active, ['alpha-task'])
  assert.equal(byId(state, 'beta-task').canSend, false)
  assert.match(byId(state, 'beta-task').sendBlockedReason, /alpha-task/)
  await assert.rejects(restarted.send('beta-task', b.hash), { status: 409, message: /alpha-task/ })

  // A progress receipt does not release the lock; only the matching final report does.
  await writeFile(path.join(root, 'report', 'alpha-task-progress.md'), '# Claude progress: alpha\n\nTask ID: alpha-task\nSource prompt: `prompt/alpha-task.md`\nStatus: acknowledged — working (progress receipt, NOT the final report)\n')
  state = await restarted.scan()
  assert.equal(byId(state, 'alpha-task').state, 'working')
  await assert.rejects(restarted.send('beta-task', b.hash), { status: 409 })

  await writeFile(path.join(root, 'report', 'alpha-task-report.md'), reportText('alpha-task'))
  state = await createPanel({ root }).scan()
  assert.equal(byId(state, 'alpha-task').state, 'report')
  assert.deepEqual(state.active, [])
  assert.equal((await createPanel({ root }).send('beta-task', b.hash)).published, 'prompt/beta-task.md')
})

test('approved prompts already on disk without a report block sending', async t => {
  const root = await fixture(t)
  await writeFile(path.join(root, 'prompt', 'build-task.md'), draftText('build-task', { status: 'APPROVED FOR EXECUTION' }))
  const b = await addDraft(root, 'beta-task')
  const panel = createPanel({ root })
  assert.deepEqual((await panel.scan()).active, ['build-task'])
  await assert.rejects(panel.send('beta-task', b.hash), { status: 409 })
})

test('reports must match the task ID and source prompt; progress receipts are not final reports', async t => {
  const root = await fixture(t)
  await writeFile(path.join(root, 'prompt', 'alpha-task.md'), draftText('alpha-task', { status: 'APPROVED FOR EXECUTION' }))
  const panel = createPanel({ root })
  const reportFile = path.join(root, 'report', 'alpha-task-report.md')

  await writeFile(reportFile, reportText('other-task'))
  let task = byId(await panel.scan(), 'alpha-task')
  assert.equal(task.state, 'published')
  assert.match(task.problems.join(' '), /does not name this task ID/)

  await writeFile(reportFile, reportText('alpha-task').replace('prompt/alpha-task.md', 'prompt/elsewhere.md'))
  assert.equal(byId(await panel.scan(), 'alpha-task').state, 'published')

  await writeFile(reportFile, '# Claude progress: alpha\n\nTask ID: alpha-task\nSource prompt: `prompt/alpha-task.md`\nStatus: acknowledged — working (progress receipt, NOT the final report)\n')
  assert.equal(byId(await panel.scan(), 'alpha-task').state, 'published', 'a progress receipt at the report path is not the final report')

  await writeFile(reportFile, reportText('alpha-task', 'blocked', 'Which database should we use?'))
  task = byId(await panel.scan(), 'alpha-task')
  assert.equal(task.state, 'blocked')
  assert.equal(task.hasQuestions, true)

  await writeFile(reportFile, reportText('alpha-task'))
  task = byId(await panel.scan(), 'alpha-task')
  assert.equal(task.state, 'report')
  assert.equal(task.hasQuestions, false)
  assert.match(task.reportText, /Done\./)
})

test('the legacy deletion task is recognized as completed history by its source convention', async t => {
  const root = await fixture(t)
  await writeFile(path.join(root, 'prompt', 'delete-website.md'), '# Delete the Orbit website\n\nDelivery status: APPROVED FOR EXECUTION.\nUser authorization to dispatch: the user explicitly said "send it".\nApproved source prompt after dispatch: `prompt/delete-website.md`.\nReport path after dispatch: `report/delete-website-report.md`.\n')
  await writeFile(path.join(root, 'prompt', 'drafts', 'delete-website.md'), '# Delete the Orbit website\n\nDelivery status: DRAFT — DO NOT EXECUTE.\n')
  const panel = createPanel({ root })
  let task = byId(await panel.scan(), 'delete-website')
  assert.equal(task.legacy, true)
  assert.equal(task.state, 'published')
  await writeFile(path.join(root, 'report', 'delete-website-report.md'), '# Claude report: delete-website\n\nSource prompt: `prompt/delete-website.md`\nStatus: completed\n')
  const state = await panel.scan()
  task = byId(state, 'delete-website')
  assert.equal(task.state, 'report')
  assert.equal(task.draftFile, 'prompt/drafts/delete-website.md')
  assert.equal(state.tasks.length, 1, 'the old draft is history, not a sendable item')
  assert.equal(reportMatches(task, '# Claude report\n\nSource prompt: prompt/hello.md\n'), false)
  await assert.rejects(panel.send('delete-website', 'a'.repeat(64)), { status: 409 })
})

test('existing destinations are never overwritten', async t => {
  const root = await fixture(t)
  const { hash } = await addDraft(root, 'alpha-task')
  await writeFile(path.join(root, 'report', 'alpha-task-report.md'), 'An unrelated earlier report.\n')
  const panel = createPanel({ root })
  const task = byId(await panel.scan(), 'alpha-task')
  assert.equal(task.state, 'malformed')
  assert.match(task.problems.join(' '), /already exists/)
  await assert.rejects(panel.send('alpha-task', hash), { status: 422 })
  assert.equal(await readFile(path.join(root, 'report', 'alpha-task-report.md'), 'utf8'), 'An unrelated earlier report.\n')
})

test('task IDs, not paths, are accepted, and junctions or symlinks are not followed', async t => {
  const root = await fixture(t)
  const panel = createPanel({ root })
  for (const id of ['../escape', 'a/b', 'C:\\Windows', '..', '', 'UPPER-case', 'x'.repeat(200)]) {
    await assert.rejects(panel.send(id, 'a'.repeat(64)), { status: 400 }, id)
  }
  await assert.rejects(panel.send('alpha-task', 'not-a-hash'), { status: 400 })

  // A drafts folder that is a junction to somewhere else is ignored entirely.
  const elsewhere = await fixture(t)
  await addDraft(elsewhere, 'outside-task')
  await rm(path.join(root, 'prompt', 'drafts'), { recursive: true })
  await symlink(path.join(elsewhere, 'prompt', 'drafts'), path.join(root, 'prompt', 'drafts'), process.platform === 'win32' ? 'junction' : 'dir')
  const state = await panel.scan()
  assert.deepEqual(state.tasks, [])
  await assert.rejects(panel.send('outside-task', sha(draftText('outside-task'))), { status: 404 })
  await assert.rejects(readFile(path.join(root, 'prompt', 'outside-task.md')), { code: 'ENOENT' })
})

test('a stale send lock from an exited process is recovered, a live one blocks', async t => {
  const root = await fixture(t)
  const { hash } = await addDraft(root, 'alpha-task')
  await mkdir(path.join(root, '.tmp', 'task-panel'), { recursive: true })
  const lock = path.join(root, '.tmp', 'task-panel', 'send.lock')
  await writeFile(lock, JSON.stringify({ pid: process.pid, at: 'now' }))
  await assert.rejects(createPanel({ root }).send('alpha-task', hash), { status: 409, message: /Another send/ })
  await writeFile(lock, JSON.stringify({ pid: 2147483646, at: 'long ago' }))
  assert.equal((await createPanel({ root }).send('alpha-task', hash)).published, 'prompt/alpha-task.md')
})

// ---------- HTTP layer ----------
function raw(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = request({ host: '127.0.0.1', port: target.port, path: target.pathname, method, headers }, response => {
      let data = ''
      response.on('data', chunk => { data += chunk })
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

test('the HTTP server accepts same-origin approvals and rejects forged or cross-origin requests', async t => {
  const root = await fixture(t)
  const { hash } = await addDraft(root, 'alpha-task')
  const running = await startPanelServer({ root, port: 0, uiDir: await uiBuild(root) })
  t.after(() => running.close())
  const host = `127.0.0.1:${running.port}`
  const origin = `http://${host}`
  const body = JSON.stringify({ id: 'alpha-task', hash })
  const good = { Host: host, Origin: origin, 'Content-Type': 'application/json', 'X-Panel-Token': running.token, 'Sec-Fetch-Site': 'same-origin' }

  const page = await raw(running.url, { headers: { Host: host } })
  assert.equal(page.status, 200)
  assert.ok(page.body.includes(running.token), 'the page carries the session token')
  assert.match(page.headers['content-security-policy'], /script-src 'self'/)
  assert.equal(page.headers['x-frame-options'], 'DENY')
  assert.doesNotMatch(page.body, /__PANEL_TOKEN__/, 'the placeholder is replaced')

  // Compiled assets: only files named in the Vite manifest are served, with the right types.
  const js = await raw(`${origin}/assets/index-abc123.js`, { headers: { Host: host } })
  assert.equal(js.status, 200)
  assert.equal(js.headers['content-type'], 'text/javascript; charset=utf-8')
  assert.equal((await raw(`${origin}/assets/index-abc123.css`, { headers: { Host: host } })).headers['content-type'], 'text/css; charset=utf-8')
  for (const denied of ['/assets/not-in-manifest.js', '/assets/', '/.vite/manifest.json', '/assets/../index.html', '/assets/%2e%2e/%2e%2e/core.mjs', '/ui-build/assets/index-abc123.js', '/app.js', '/styles.css']) {
    assert.equal((await raw(`${origin}${denied}`, { headers: { Host: host } })).status, 404, denied)
  }

  assert.equal((await raw(`${origin}/../package.json`, { headers: { Host: host } })).status, 404)
  assert.equal((await raw(`${origin}/core.mjs`, { headers: { Host: host } })).status, 404)
  assert.equal((await raw(running.url, { headers: { Host: 'evil.example:80' } })).status, 403, 'DNS-rebinding host names are rejected')
  assert.equal((await raw(`${origin}/api/state`, { headers: { Host: host } })).status, 403, 'state requires the session token')

  const attempts = [
    { ...good, Origin: 'http://evil.example' },
    { ...good, Origin: 'null' },
    { ...good, 'Sec-Fetch-Site': 'cross-site' },
    { ...good, 'X-Panel-Token': 'f'.repeat(64) },
    (({ 'X-Panel-Token': _, ...rest }) => rest)(good),
    { ...good, Host: 'evil.example' },
  ]
  for (const headers of attempts) assert.equal((await raw(`${origin}/api/send`, { method: 'POST', headers, body })).status, 403, JSON.stringify(headers))
  assert.equal((await raw(`${origin}/api/send`, { method: 'POST', headers: { ...good, 'Content-Type': 'text/plain' }, body })).status, 415)
  assert.equal((await raw(`${origin}/api/send`, { method: 'GET', headers: good })).status, 405)
  assert.deepEqual(await readdir(path.join(root, 'prompt')), ['drafts'], 'no forged request published anything')

  const sent = await raw(`${origin}/api/send`, { method: 'POST', headers: good, body })
  assert.equal(sent.status, 200)
  assert.equal(JSON.parse(sent.body).published, 'prompt/alpha-task.md')
  const again = await raw(`${origin}/api/send`, { method: 'POST', headers: good, body })
  assert.equal(again.status, 409)

  const state = JSON.parse((await raw(`${origin}/api/state`, { headers: good })).body)
  assert.equal(byId(state, 'alpha-task').state, 'published')
  assert.equal(state.project, path.basename(root))
})

test('without a UI build the server explains how to build it instead of serving anything else', async t => {
  const root = await fixture(t)
  const running = await startPanelServer({ root, port: 0, uiDir: path.join(root, 'no-build-here') })
  t.after(() => running.close())
  const host = `127.0.0.1:${running.port}`
  const page = await raw(running.url, { headers: { Host: host } })
  assert.equal(page.status, 503)
  assert.match(page.body, /npm.cmd run ui:build/)
  assert.equal((await raw(`http://${host}/assets/index.js`, { headers: { Host: host } })).status, 404)
})

// ---------- UI lifecycle events (scripts/task-panel/ui/src/lib/lifecycle.ts) ----------
async function loadTracker() {
  return createLifecycleTracker
}

const task = (id, state, extra = {}) => ({ id, title: `Task ${id}`, state, updatedAt: 1, ...extra })

test('lifecycle: the first snapshot is a silent baseline and unchanged polls emit nothing', async () => {
  const tracker = (await loadTracker())()
  const history = [task('a', 'report', { reportText: 'done' }), task('b', 'blocked', { reportText: 'stuck', hasQuestions: true }), task('c', 'draft'), task('d', 'working'), task('e', 'published')]
  assert.deepEqual(tracker.observe(history), [])
  assert.deepEqual(tracker.observe(history), [])
  assert.deepEqual(tracker.observe(history.map(item => ({ ...item }))), [], 'fresh objects with identical state are not events')
})

test('lifecycle: send, receipt, and report each fire exactly once', async () => {
  const tracker = (await loadTracker())()
  tracker.observe([task('a', 'draft')])
  const sent = tracker.observe([task('a', 'published')])
  assert.deepEqual(sent.map(event => event.type), ['published'])
  assert.deepEqual(tracker.observe([task('a', 'published')]), [])
  const ack = tracker.observe([task('a', 'working')])
  assert.deepEqual(ack.map(event => event.type), ['acknowledged'])
  assert.deepEqual(tracker.observe([task('a', 'working')]), [])
  const done = tracker.observe([task('a', 'report', { reportText: 'all good', outcome: 'completed' })])
  assert.deepEqual(done.map(event => [event.type, event.outcome, event.hasQuestions]), [['report', 'completed', false]])
  assert.deepEqual(tracker.observe([task('a', 'report', { reportText: 'all good', outcome: 'completed' })]), [])
})

test('lifecycle: a send from this page is not announced again by the next poll; a rejected send emits nothing', async () => {
  const tracker = (await loadTracker())()
  tracker.observe([task('a', 'draft'), task('b', 'draft')])
  tracker.markSeen('a', 'published') // successful POST /api/send
  assert.deepEqual(tracker.observe([task('a', 'published'), task('b', 'draft')]), [])
  // b's send was rejected (stale draft): its state stays draft, so nothing fires.
  assert.deepEqual(tracker.observe([task('a', 'published'), task('b', 'draft')]), [])
})

test('lifecycle: blocked and question reports are flagged, new drafts are noticed, and a skipped receipt still yields one report', async () => {
  const tracker = (await loadTracker())()
  tracker.observe([task('a', 'published')])
  const events = tracker.observe([task('a', 'blocked', { reportText: 'need input', outcome: 'blocked', hasQuestions: true }), task('n', 'draft')])
  assert.deepEqual(events.map(event => [event.type, event.id, event.state, event.hasQuestions]), [['report', 'a', 'blocked', true], ['draft', 'n', 'draft', false]])
  // A rewritten report is a new report identity; the same text never repeats.
  const updated = tracker.observe([task('a', 'blocked', { reportText: 'need input v2', outcome: 'blocked', hasQuestions: true }), task('n', 'draft')])
  assert.deepEqual(updated.map(event => event.type), ['report'])
})

test('the server serves only the three whitelisted official logo files, as SVG images', async t => {
  const root = await fixture(t)
  const running = await startPanelServer({ root, port: 0 })
  t.after(() => running.close())
  const host = `127.0.0.1:${running.port}`
  for (const name of ['openai-blossom-black.svg', 'openai-blossom-white.svg', 'claude-spark-clay.svg']) {
    const response = await raw(`http://${host}/logos/${name}`, { headers: { Host: host } })
    assert.equal(response.status, 200, name)
    assert.equal(response.headers['content-type'], 'image/svg+xml')
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    assert.match(response.body, /^<svg[\s>]/)
  }
  for (const path of ['/logos/', '/logos/other.svg', '/logos/../server.mjs', '/logos/OPENAI-BLOSSOM-BLACK.svg', '/public/logos/claude-spark-clay.svg']) {
    assert.equal((await raw(`http://${host}${path}`, { headers: { Host: host } })).status, 404, path)
  }
  assert.equal((await raw(`http://${host}/logos/claude-spark-clay.svg`, { headers: { Host: 'evil.example' } })).status, 403)
})

// ---------- Studio view mapping (scripts/task-panel/ui/src/lib/derive.ts) ----------
test('studio statuses come only from real task states', () => {
  const at = (id, state, extra = {}) => ({ id, title: `T ${id}`, state, updatedAt: extra.updatedAt ?? 1, ...extra })
  let view = deriveStudio([])
  assert.deepEqual([view.codex.status, view.claude.status, view.owner.line], ['No plan waiting right now', 'No active task', 'Nothing waiting for your approval'])
  assert.equal(view.focus, null)

  view = deriveStudio([at('d', 'draft'), at('r', 'report', { reportText: 'x' })])
  assert.equal(view.codex.tone, 'ready')
  assert.equal(view.codex.task.id, 'd')
  assert.equal(view.owner.line, '1 plan waiting for your approval')
  assert.equal(view.headline, 'A plan is waiting for your approval.')
  assert.equal(view.focus.id, 'd')

  view = deriveStudio([at('p', 'published')])
  assert.deepEqual([view.claude.tone, view.claude.status], ['waiting', 'Sent · not yet acknowledged'], 'publication is not acknowledgement')
  view = deriveStudio([at('w', 'working')])
  assert.deepEqual([view.claude.tone, view.claude.status], ['working', 'Acknowledged · working'])
  view = deriveStudio([at('b', 'blocked', { reportText: 'stuck', hasQuestions: true })])
  assert.deepEqual([view.claude.tone, view.claude.status], ['attention', 'Latest report needs your decision'])
  view = deriveStudio([at('ok', 'report', { reportText: 'done' })])
  assert.deepEqual([view.claude.tone, view.claude.status], ['report', 'No active task · last report received'], 'a report is not shown as verified success')
  view = deriveStudio([at('m', 'malformed')])
  assert.equal(view.codex.tone, 'attention')

  assert.equal(stagesFor(at('x', 'superseded')), null)
  assert.deepEqual(stagesFor(at('p', 'published')).map(stage => stage.status), ['done', 'done', 'now', 'todo'])
  assert.deepEqual(stagesFor(at('q', 'report', { hasQuestions: true })).map(stage => stage.status), ['done', 'done', 'done', 'attention'])
  assert.ok(matchesFilter(at('q', 'report', { hasQuestions: true }), 'needs-you'))
  assert.ok(!matchesFilter(at('ok', 'report'), 'needs-you'))
  assert.ok(matchesFilter(at('w', 'working'), 'with-claude'))
})

// ---------- UI templates (scripts/task-panel/ui/src/lib/templates.ts and the board grouping in derive.ts) ----------
test('board: every task state lands in exactly one column, with questions and blockers under Needs you', () => {
  const at = (id, state, extra = {}) => ({ id, title: `T ${id}`, state, updatedAt: extra.updatedAt ?? 1, ...extra })
  const tasks = [
    at('d', 'draft'), at('m', 'malformed'), at('s', 'superseded'), at('p', 'published'), at('w', 'working'),
    at('r', 'report', { reportText: 'done' }), at('q', 'report', { reportText: 'see questions', hasQuestions: true }), at('b', 'blocked', { reportText: 'stuck' }),
  ]
  const expected = { d: 'needs-you', m: 'needs-you', q: 'needs-you', b: 'needs-you', p: 'with-claude', w: 'with-claude', r: 'reports', s: 'archived' }
  for (const task of tasks) assert.equal(boardColumn(task), expected[task.id], task.id)
  const groups = groupBoard(tasks)
  assert.deepEqual(Object.keys(groups).sort(), COLUMNS.map(column => column.id).sort())
  const placed = Object.values(groups).flat().map(task => task.id)
  assert.equal(placed.length, tasks.length, 'no task is shown twice or dropped')
  assert.equal(new Set(placed).size, tasks.length)
  // The board's Needs you column is exactly the existing Needs you filter.
  for (const task of tasks) assert.equal(boardColumn(task) === 'needs-you', matchesFilter(task, 'needs-you'), task.id)
  // Sent is not acknowledged: both live in With Claude but keep their own states.
  assert.deepEqual(groups['with-claude'].map(task => task.state).sort(), ['published', 'working'])
  const ordered = groupBoard([at('old', 'report', { updatedAt: 1 }), at('new', 'report', { updatedAt: 5 })]).reports.map(task => task.id)
  assert.deepEqual(ordered, ['new', 'old'], 'newest first')
})

test('template preference: unknown, missing, or unreadable values fall back to Studio; saving never throws', () => {
  assert.equal(DEFAULT_TEMPLATE, 'studio')
  assert.deepEqual(TEMPLATES.map(template => template.id), [...TEMPLATE_IDS])
  assert.equal(TEMPLATE_IDS.length, 6)
  for (const id of TEMPLATE_IDS) assert.equal(parseTemplateId(id), id)
  for (const junk of [null, undefined, '', 'STUDIO', 'board ', 'constructor', '__proto__', 'toString', 42, {}]) assert.equal(parseTemplateId(junk), 'studio', String(junk))

  const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), data } }
  const store = memory()
  assert.equal(loadTemplate(() => store), 'studio', 'nothing saved yet')
  assert.equal(saveTemplate(() => store, 'cyber'), true)
  assert.equal(store.data.get(TEMPLATE_STORAGE_KEY), 'cyber')
  assert.equal(loadTemplate(() => store), 'cyber', 'survives a reload')
  store.data.set(TEMPLATE_STORAGE_KEY, 'retired-template')
  assert.equal(loadTemplate(() => store), 'studio', 'a removed or tampered value falls back')
  assert.equal(saveTemplate(() => store, 'nope'), false, 'invalid ids are never written')
  assert.equal(store.data.get(TEMPLATE_STORAGE_KEY), 'retired-template')

  const denied = () => { throw new Error('SecurityError: storage blocked') }
  assert.equal(loadTemplate(denied), 'studio')
  assert.equal(saveTemplate(denied, 'board'), false)
  const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
  assert.equal(loadTemplate(() => throwing), 'studio')
  assert.equal(saveTemplate(() => throwing, 'board'), false)
  assert.equal(loadTemplate(() => null), 'studio')
  assert.equal(saveTemplate(() => null, 'board'), false)
})

// ---------- Markdown viewer (scripts/task-panel/ui/src/components/Markdown.tsx) ----------
// The real TSX component is transpiled with esbuild into .tmp/ and rendered with react-dom/server in a
// separate process with a hard timeout, so a parser that stops advancing fails the test instead of hanging the suite.
const markdownDir = await withinProject(PROJECT_ROOT, `.tmp/markdown-render-test-${randomUUID()}`)
let compiledMarkdown = null
after(() => rm(markdownDir, { recursive: true, force: true }))

async function renderMarkdown(source, timeout = 5000) {
  if (!compiledMarkdown) {
    const tsx = await readFile(new URL('./ui/src/components/Markdown.tsx', import.meta.url), 'utf8')
    const { code } = await transform(tsx, { loader: 'tsx', jsx: 'automatic', format: 'esm', target: 'es2022' })
    await mkdir(markdownDir, { recursive: true })
    compiledMarkdown = path.join(markdownDir, 'Markdown.mjs')
    await writeFile(compiledMarkdown, code)
  }
  const script = `import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const { Markdown } = await import(${JSON.stringify(pathToFileURL(compiledMarkdown).href)})
process.stdout.write(renderToStaticMarkup(createElement(Markdown, { source: JSON.parse(process.argv[1]) })))`
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(source)], { cwd: PROJECT_ROOT, timeout, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(new Error(error.killed ? `Markdown render did not finish within ${timeout} ms (parser stopped advancing)` : `Markdown render failed: ${stderr}`), { killed: error.killed }))
      else resolve(stdout)
    })
  })
}

test('markdown: lists whose first item is indented render and finish', async () => {
  assert.match(await renderMarkdown('- item'), /<ul[^>]*><li>item<\/li><\/ul>/)
  const unordered = await renderMarkdown('  - item')
  assert.match(unordered, /<ul[^>]*><li>item<\/li><\/ul>/)
  const ordered = await renderMarkdown('  1. first\n  2. second')
  assert.match(ordered, /<ol[^>]*><li>first<\/li><li>second<\/li><\/ol>/)
  const afterText = await renderMarkdown('Intro line\n\n  - indented after a paragraph\n  - and another')
  assert.match(afterText, /Intro line/)
  assert.match(afterText, /<li>indented after a paragraph<\/li><li>and another<\/li>/)
})

test('markdown: nested items, continuation text, and odd indentation keep their content and finish', async () => {
  const nested = await renderMarkdown('- parent\n  - child\n- next\n  continued text')
  assert.equal((nested.match(/<li>/g) ?? []).length, 2, 'the nested item stays inside its parent')
  for (const text of ['parent', 'child', 'next', 'continued text']) assert.ok(nested.includes(text), text)
  const odd = await renderMarkdown('      - deep only\n\n   * three spaces\n- normal\n    - orphan child\n\n  10) late start')
  for (const text of ['deep only', 'three spaces', 'normal', 'orphan child', 'late start']) assert.ok(odd.includes(text), text)
  const mixed = await renderMarkdown('# Title\n\n```\n  - not a list\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n  - after table')
  assert.match(mixed, /<pre[^>]*><code>  - not a list<\/code><\/pre>/)
  assert.match(mixed, /<td>1<\/td>/)
  assert.match(mixed, /<li>after table<\/li>/)
})

test('markdown: raw HTML in plans and reports stays inert text, including inside indented lists', async () => {
  const html = await renderMarkdown('<script>alert(1)</script>\n\n  - <img src=x onerror=alert(2)>\n  1. <b onclick="x()">bold?</b>')
  assert.doesNotMatch(html, /<script|<img|<b /)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/)
})
