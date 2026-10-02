import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { lstat, mkdir, open, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url))
const digest = value => createHash('sha256').update(value).digest('hex')

// Check each existing path component without following a junction outside the project.
export async function withinProject(root, input) {
  const base = path.resolve(root)
  const target = path.resolve(base, input)
  const relative = path.relative(base, target)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Path must stay inside the project folder.')
  }
  let current = base
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlinks and directory junctions are not allowed in bridge paths.')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return target
}

export function launchConfig(root, parentEnv = process.env) {
  const state = path.join(root, '.claude-local')
  const temporary = path.join(root, '.tmp', 'claude-bridge')
  const flags = ['--print', '--output-format', 'json', '--restricted', '--bare',
    '--no-session-persistence', '--permission-mode', 'dontAsk',
    '--tools', 'Read,Edit,Write', '--allowedTools', 'Read(./**)', 'Edit(./**)', 'Write(./**)',
    '--disallowedTools', 'Read(./.claude-local/**)', 'Edit(./.claude-local/**)',
    'Write(./.claude-local/**)', 'mcp__*']
  // All shell arguments are fixed constants; task text goes through stdin only.
  const windowsCommand = `& claude ${flags.map(value => `'${value}'`).join(' ')}; exit $LASTEXITCODE`
  return {
    command: process.platform === 'win32' ? 'powershell.exe' : 'claude',
    args: process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', windowsCommand] : flags,
    cwd: root,
    env: { ...parentEnv, CLAUDE_CONFIG_DIR: state, TEMP: temporary, TMP: temporary, TMPDIR: temporary,
      NPM_CONFIG_CACHE: path.join(root, '.npm-cache'),
      NPM_CONFIG_USERCONFIG: path.join(root, '.npmrc'),
      NPM_CONFIG_GLOBALCONFIG: path.join(root, '.tmp', 'npm-globalrc'),
      DISABLE_UPDATES: '1', DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_DEBUG_LOGS_DIR: path.join(state, 'debug') },
  }
}

async function runClaude(config, prompt, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.command, config.args, { cwd: config.cwd, env: config.env,
      shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    const MAX_OUTPUT = 16 * 1024 * 1024
    function abortRun(message) {
      cleanup(); child.kill()
      const error = new Error(message)
      // A shell's child can survive its parent on Windows. Retain the dispatch lock
      // until a person verifies that the actual Claude process has ended.
      error.keepLock = true
      reject(error)
    }
    const timeout = setTimeout(() => abortRun('Claude exceeded the 30-minute response timeout. Check the Claude process before sending another task.'), 30 * 60 * 1000)
    const progress = setInterval(() => onProgress('Waiting for Claude’s report…'), 25000)
    function cleanup() { clearTimeout(timeout); clearInterval(progress) }
    child.on('error', error => { cleanup(); reject(error) })
    child.stdin.on('error', error => {
      // A CLI that exits before reading stdin is reported through its exit code.
      if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') { cleanup(); child.kill(); reject(error) }
    })
    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
      if (stdout.length > MAX_OUTPUT) abortRun('Claude response exceeded the 16 MB limit. Check the Claude process before sending another task.')
    })
    child.stderr.on('data', chunk => { if (stderr.length < MAX_OUTPUT) stderr += chunk.toString() })
    child.on('close', code => { cleanup(); resolve({ code, stdout, stderr }) })
    child.stdin.end(prompt)
  })
}

export async function createBridge(root = PROJECT_ROOT, runner = runClaude, environment = process.env) {
  const base = await realpath(root)
  const prompts = await withinProject(base, 'prompt/claude')
  const reports = await withinProject(base, 'report/claude')
  await mkdir(prompts, { recursive: true })
  await mkdir(reports, { recursive: true })

  function taskPaths(id) {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Invalid task ID.')
    return { metadata: path.join(prompts, `${id}.json`), prompt: path.join(prompts, `${id}.md`), report: path.join(reports, `${id}.md`) }
  }

  async function readTask(id) {
    const paths = taskPaths(id)
    await withinProject(base, paths.metadata)
    await withinProject(base, paths.prompt)
    const task = JSON.parse(await readFile(paths.metadata, 'utf8'))
    if (task.id !== id) throw new Error('Task metadata does not match its ID.')
    return { ...paths, task }
  }

  async function saveTask(task) {
    const { metadata } = taskPaths(task.id)
    const temporary = await withinProject(base, `${metadata}.${randomUUID()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(task, null, 2)}\n`, { flag: 'wx' })
    await withinProject(base, metadata)
    await rename(temporary, metadata)
  }

  async function draft(source) {
    const sourcePath = await withinProject(base, source)
    const plan = (await readFile(sourcePath, 'utf8')).trim()
    if (!plan) throw new Error('The prompt file is empty.')
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
    const paths = taskPaths(id)
    const prompt = `# Claude task ${id}\n\nWorkspace: ${base}\n\n## Constraints\n\nWork only inside this workspace. Do not access or modify files outside it. Do not launch other agents, dispatch follow-up tasks, change authentication, or modify the handoff metadata. You have file tools only; report any shell checks for Codex to run. Return a Markdown report with outcome, changes, actual validation, and remaining issues. Do not claim unrun tests passed.\n\n## Agreed task\n\n${plan}\n`
    const task = { id, status: 'draft', createdAt: new Date().toISOString(),
      promptPath: path.relative(base, paths.prompt), reportPath: path.relative(base, paths.report), promptHash: digest(prompt) }
    await withinProject(base, paths.prompt)
    await writeFile(paths.prompt, prompt, { flag: 'wx' })
    await saveTask(task)
    return task
  }

  async function show(id) {
    const { task, prompt } = await readTask(id)
    const text = await readFile(prompt, 'utf8')
    if (digest(text) !== task.promptHash) throw new Error('The draft changed. Create and review a new draft before sending.')
    return text
  }

  async function send(id, approval, onProgress = () => {}) {
    if (approval !== 'send it') throw new Error('Not sent: explicit user approval “send it” is required.')
    const prompt = await show(id)
    const { task, report } = await readTask(id)
    if (task.status !== 'draft') throw new Error(`Task is ${task.status}; it cannot be sent again. Create a new draft to retry.`)
    const lockPath = await withinProject(base, 'prompt/claude/.dispatch-lock')
    let lock
    try { lock = await open(lockPath, 'wx') }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Another task is running, or a previous run was interrupted. Check its report before clearing the project-local dispatch lock.')
      throw error
    }
    const config = launchConfig(base, environment)
    let keepLock = false
    try {
      // Re-read after acquiring the lock to prevent racing sends of one draft.
      if ((await readTask(id)).task.status !== 'draft') throw new Error('This task has already been dispatched.')
      for (const directory of [config.env.CLAUDE_CONFIG_DIR, config.env.TEMP]) {
        await withinProject(base, directory)
        await mkdir(directory, { recursive: true })
      }
      // Bare mode accepts explicit shell authentication, never a global credential file.
      if (!config.env.ANTHROPIC_API_KEY && !config.env.CLAUDE_CODE_OAUTH_TOKEN) {
        throw new Error('Claude is not connected: set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in the terminal environment. The bridge does not read credentials outside this folder. No prompt was sent.')
      }
      task.status = 'running'; task.approvedAt = new Date().toISOString(); task.startedAt = task.approvedAt
      await saveTask(task)
      onProgress(`Sending task ${id} to Claude Code…`)
      const result = await runner(config, prompt, onProgress)
      let response
      try { response = JSON.parse(result.stdout.trim()) } catch { response = null }
      const successful = result.code === 0 && response && !response.is_error && typeof response.result === 'string' && response.result.trim()
      const denied = Array.isArray(response?.permission_denials) && response.permission_denials.length > 0
      const body = response?.result || result.stderr || result.stdout || 'Claude returned no report.'
      task.status = successful ? (denied ? 'needs_attention' : 'report_ready') : 'failed'
      task.finishedAt = new Date().toISOString(); task.exitCode = result.code
      if (typeof response?.session_id === 'string') task.claudeSessionId = response.session_id
      const markdown = `# Claude report: ${id}\n\nBridge status: ${task.status}\n\nThis is Claude's response; Codex has not independently verified it yet.\n\n${body}\n`
      await withinProject(base, report)
      await writeFile(report, markdown, { flag: 'wx' })
      await saveTask(task)
      return task
    } catch (error) {
      keepLock = Boolean(error.keepLock)
      // Preflight failures leave the draft unsent; errors after launch get a failure report.
      if (task.status === 'running') {
        task.status = 'failed'; task.finishedAt = new Date().toISOString()
        await withinProject(base, report)
        await writeFile(report, `# Claude handoff failed: ${id}\n\n${error.message}\n`, { flag: 'wx' })
        await saveTask(task)
      }
      throw error
    } finally {
      await lock.close()
      // Delete only this exact file, after verifying it is inside the project.
      const { unlink } = await import('node:fs/promises')
      if (!keepLock) {
        await withinProject(base, lockPath)
        await unlink(lockPath)
      }
    }
  }

  async function status(id) {
    if (id) return (await readTask(id)).task
    const files = (await readdir(prompts)).filter(file => file.endsWith('.json')).sort()
    return Promise.all(files.map(file => readTask(file.slice(0, -5)).then(value => value.task)))
  }

  async function report(id) {
    const { report: reportFile, task } = await readTask(id)
    await withinProject(base, reportFile)
    try { return await readFile(reportFile, 'utf8') }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`No report yet. Task status: ${task.status}.`)
      throw error
    }
  }

  async function wait(id, seconds = 55) {
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 55) throw new Error('Wait duration must be between 1 and 55 seconds.')
    const deadline = Date.now() + seconds * 1000
    do {
      const task = await status(id)
      if (['report_ready', 'needs_attention', 'failed'].includes(task.status)) return report(id)
      if (task.status === 'draft') throw new Error('This task is still a draft. Nothing has been sent to Claude.')
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, Math.max(0, deadline - Date.now()))))
    } while (Date.now() < deadline)
    return 'Claude is still running. Wait again; no new task has been sent.'
  }

  return { draft, show, send, status, report, wait }
}

async function main() {
  const [command, value, ...options] = process.argv.slice(2)
  if (!command || command === 'help') {
    console.log('Claude bridge (project-local)\n\n  draft prompt/my-task.md\n  show <task-id>\n  status [task-id]\n  send <task-id> --approval "send it"\n  report <task-id>\n  wait <task-id> [seconds, max 55]\n\nDrafting never sends. Use send only after the user explicitly approves that task.')
    return
  }
  const bridge = await createBridge()
  let result
  if (command === 'draft') result = await bridge.draft(value || '')
  else if (command === 'show') result = await bridge.show(value || '')
  else if (command === 'status') result = await bridge.status(value)
  else if (command === 'report') result = await bridge.report(value || '')
  else if (command === 'wait') result = await bridge.wait(value || '', options.length ? Number(options[0]) : 55)
  else if (command === 'send') {
    const approvalIndex = options.indexOf('--approval')
    result = await bridge.send(value || '', approvalIndex >= 0 ? options[approvalIndex + 1] : undefined, console.log)
    if (result.status !== 'report_ready') process.exitCode = 1
  } else throw new Error('Unknown bridge command. Run help for usage.')
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
