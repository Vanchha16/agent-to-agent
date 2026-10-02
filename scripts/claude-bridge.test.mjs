import assert from 'node:assert/strict'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createBridge, launchConfig, PROJECT_ROOT, withinProject } from './claude-bridge.mjs'

const fakeEnvironment = { CLAUDE_CODE_OAUTH_TOKEN: 'test-only-not-a-real-token' }
const successful = { code: 0, stdout: JSON.stringify({ result: '## Outcome\nCompleted in the simulated test.\n\n## Validation\nNo real Claude call was made.', is_error: false }), stderr: '' }

async function fixture(runner, environment = fakeEnvironment) {
  const root = path.join(PROJECT_ROOT, '.tmp', `bridge-test-${randomUUID()}`)
  await mkdir(root, { recursive: true })
  await mkdir(path.join(root, 'prompt'))
  await writeFile(path.join(root, 'prompt', 'input.md'), 'Review the chat UI and report findings.')
  const bridge = await createBridge(root, runner, environment)
  return { root, bridge, task: await bridge.draft('prompt/input.md') }
}

test('drafting never invokes Claude and sending requires exact explicit approval', async () => {
  let calls = 0
  const { bridge, task } = await fixture(async () => { calls++; return successful })
  assert.equal(task.status, 'draft')
  assert.match(await bridge.show(task.id), /Review the chat UI/)
  for (const approval of [undefined, '', 'yes', 'agree', 'SEND IT']) {
    await assert.rejects(bridge.send(task.id, approval), /explicit user approval/)
  }
  assert.equal(calls, 0)
  assert.equal((await bridge.status(task.id)).status, 'draft')
})

test('approved handoff sends the exact reviewed prompt and saves a correlated unverified report', async () => {
  let received, config
  const { root, bridge, task } = await fixture(async (settings, prompt) => { received = prompt; config = settings; return successful })
  const reviewed = await bridge.show(task.id)
  const completed = await bridge.send(task.id, 'send it')
  assert.equal(received, reviewed)
  assert.equal(config.cwd, root)
  assert.equal(completed.status, 'report_ready')
  assert.match(await bridge.report(task.id), new RegExp(task.id))
  assert.match(await bridge.report(task.id), /not independently verified/)
  await assert.rejects(bridge.send(task.id, 'send it'), /cannot be sent again/)
})

test('modified drafts cannot be sent under their original review', async () => {
  let calls = 0
  const { root, bridge, task } = await fixture(async () => { calls++; return successful })
  await writeFile(path.join(root, task.promptPath), 'A different task')
  await assert.rejects(bridge.send(task.id, 'send it'), /draft changed/)
  assert.equal(calls, 0)
})

test('paths outside the project and traversal task IDs are rejected before file access', async () => {
  const { root, bridge } = await fixture(async () => successful)
  await assert.rejects(withinProject(root, '../outside.md'), /inside the project/)
  await assert.rejects(bridge.draft('../outside.md'), /inside the project/)
  await assert.rejects(bridge.status('../../outside'), /Invalid task ID/)
})

test('bridge paths cannot traverse symlinks or directory junctions', async () => {
  const { root } = await fixture(async () => successful)
  await mkdir(path.join(root, 'target'))
  await symlink(path.join(root, 'target'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(withinProject(root, 'linked/report.md'), /junctions are not allowed/)
})

test('failed Claude calls create failure reports, release the lock, and never claim success', async () => {
  const { root, bridge, task } = await fixture(async () => ({ code: 1, stdout: '', stderr: 'Simulated connection failure' }))
  const failed = await bridge.send(task.id, 'send it')
  assert.equal(failed.status, 'failed')
  assert.match(await bridge.report(task.id), /Simulated connection failure/)
  await assert.rejects(readFile(path.join(root, 'prompt/claude/.dispatch-lock')), { code: 'ENOENT' })
})

test('missing local authentication leaves the prompt unsent and the draft intact', async () => {
  let calls = 0
  const { bridge, task } = await fixture(async () => { calls++; return successful }, {})
  await assert.rejects(bridge.send(task.id, 'send it'), /No prompt was sent/)
  assert.equal(calls, 0)
  assert.equal((await bridge.status(task.id)).status, 'draft')
})

test('permission denials are reported as needing attention', async () => {
  const { bridge, task } = await fixture(async () => ({ code: 0, stdout: JSON.stringify({ result: 'Could not complete the edit.', permission_denials: [{ tool_name: 'Edit' }] }), stderr: '' }))
  assert.equal((await bridge.send(task.id, 'send it')).status, 'needs_attention')
})

test('concurrent tasks cannot both be dispatched', async () => {
  let release, started
  const startedPromise = new Promise(resolve => { started = resolve })
  const { bridge, task } = await fixture(async () => { started(); await new Promise(resolve => { release = resolve }); return successful })
  const secondTask = await bridge.draft('prompt/input.md')
  const first = bridge.send(task.id, 'send it')
  await startedPromise
  await assert.rejects(bridge.send(secondTask.id, 'send it'), /Another task is running/)
  release()
  await first
  assert.equal((await bridge.status(secondTask.id)).status, 'draft')
})

test('Claude runtime settings stay local and tools cannot execute shell commands', () => {
  const config = launchConfig(PROJECT_ROOT, {})
  for (const key of ['CLAUDE_CONFIG_DIR', 'TEMP', 'TMP', 'TMPDIR', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_GLOBALCONFIG', 'CLAUDE_CODE_DEBUG_LOGS_DIR']) {
    assert.equal(path.relative(PROJECT_ROOT, config.env[key]).startsWith('..'), false)
  }
  const args = config.args.join(' ')
  assert.match(args, /--restricted/)
  assert.match(args, /--bare/)
  assert.match(args, /Read,Edit,Write/)
  assert.doesNotMatch(args, /bypassPermissions|dangerously-skip-permissions/)
})

test('uncertain process termination retains the lock and blocks another dispatch', async () => {
  const { root, bridge, task } = await fixture(async () => {
    const error = new Error('Simulated process timeout')
    error.keepLock = true
    throw error
  })
  await assert.rejects(bridge.send(task.id, 'send it'), /Simulated process timeout/)
  await readFile(path.join(root, 'prompt/claude/.dispatch-lock'))
  const next = await bridge.draft('prompt/input.md')
  await assert.rejects(bridge.send(next.id, 'send it'), /Another task is running/)
})
