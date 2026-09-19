/**
 * Agent task flow: event protocol, approvals (autonomy), cancellation, read-only modes and SSE replay.
 * Run with: npm run test:agent -w backend
 *
 * Uses a throwaway SQLite file and a stubbed AI router — no network, no provider keys.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codepilot-agent-test-'))
process.env.DB_PATH = path.join(tmp, 'test.db')

const { initDb, closeDb } = await import('../../db/schema.js')
const queries = await import('../../db/queries.js')
const { EventNormalizer } = await import('../events.js')
const approvals = await import('../approvals.js')
const { TaskContext, TaskCancelledError } = await import('../context.js')
const { aiRouter } = await import('../../ai/router.js')
const { default: Fastify } = await import('fastify')
const { tasksPlugin } = await import('../../routes/tasks.js')
const { agentPlugin } = await import('../../routes/agent.js')
type AgentEvent = import('../../types/shared.js').AgentEvent

let passed = 0
let failed = 0
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err: any) {
    failed++
    console.log(`  FAIL ${name}\n       ${String(err?.message ?? err).split('\n').join('\n       ')}`)
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until<T>(fn: () => Promise<T | undefined | false> | T | undefined | false, ms = 5000, label = 'condition'): Promise<T> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v as T
    await sleep(15)
  }
  throw new Error(`timed out waiting for ${label}`)
}

await initDb()

// ─── EventNormalizer ────────────────────────────────────────────────────────────
console.log('\nEventNormalizer')
const ev = (type: string, data?: Record<string, unknown>, extra: Partial<AgentEvent> = {}): AgentEvent => ({ type: type as any, taskId: 't1', data, ...extra })

await test('stage start events become stage_change with the stage and the message from data', () => {
  const n = new EventNormalizer({ filesChanged: () => [] })
  const e = n.normalize(ev('PLANNING', { message: 'Creating implementation plan' }))!
  assert.equal(e.type, 'stage_change')
  assert.equal(e.stage, 'PLANNING')
  assert.equal(e.message, 'Creating implementation plan')
})

await test('DEBUGGING_FIX maps onto the DEBUGGING stage', () => {
  const e = new EventNormalizer({ filesChanged: () => [] }).normalize(ev('DEBUGGING_FIX', { message: 'Generating fixes' }))!
  assert.equal(e.type, 'stage_change')
  assert.equal(e.stage, 'DEBUGGING')
})

await test('IMPLEMENTING_FILE becomes file_change carrying data.filePath', () => {
  const e = new EventNormalizer({ filesChanged: () => [] }).normalize(ev('IMPLEMENTING_FILE', { file: 'src/a.ts' }))!
  assert.equal(e.type, 'file_change')
  assert.equal((e.data as any).filePath, 'src/a.ts')
  assert.match(e.message!, /src\/a\.ts/)
})

await test('TESTING_COMPLETE reports pass/fail as test_result', () => {
  const n = new EventNormalizer({ filesChanged: () => [] })
  const ok = n.normalize(ev('TESTING_COMPLETE', { result: { passed: true, output: '' } }))!
  assert.equal(ok.type, 'test_result')
  assert.equal((ok.data as any).passed, true)
  const bad = n.normalize(ev('TESTING_COMPLETE', { result: { passed: false, output: '', error: 'boom\nmore' } }))!
  assert.equal((bad.data as any).passed, false)
  assert.match(bad.message!, /failed.*boom/i)
})

await test('a failed build (RUNNING_ERROR) is a warning, not the end of the task', () => {
  const n = new EventNormalizer({ filesChanged: () => [] })
  const e = n.normalize(ev('RUNNING_ERROR', { error: 'npm ERR!' }))!
  assert.equal(e.type, 'log')
  assert.equal((e.data as any).level, 'warn')
  assert.equal(n.isTerminal, false)
})

await test('COMPLETED/SUCCESS becomes complete and summarizes the changed files', () => {
  const n = new EventNormalizer({ filesChanged: () => ['a.ts', 'b.ts'] })
  const e = n.normalize(ev('COMPLETED', { status: 'SUCCESS' }))!
  assert.equal(e.type, 'complete')
  assert.match(e.message!, /2 files changed/)
  assert.equal(n.isTerminal, true)
})

await test('COMPLETED/FAILED_VERIFICATION is an error, not a success', () => {
  const e = new EventNormalizer({ filesChanged: () => [] }).normalize(ev('COMPLETED', { status: 'FAILED_VERIFICATION' }))!
  assert.equal(e.type, 'error')
})

await test('ERROR followed by COMPLETED/FAILED yields exactly one terminal event', () => {
  const n = new EventNormalizer({ filesChanged: () => [] })
  const first = n.normalize(ev('ERROR', { error: 'kaput' }))!
  assert.equal(first.type, 'error')
  assert.equal(first.message, 'kaput')
  assert.equal(n.normalize(ev('COMPLETED', { status: 'FAILED' })), null)
  assert.equal(n.normalize(ev('IMPLEMENTING', { message: 'late' })), null)
})

await test('already-canonical events pass through and always carry a message', () => {
  const n = new EventNormalizer({ filesChanged: () => [] })
  const e = n.normalize(ev('approval_required', { approvalId: 'x' }, { message: 'Create a.ts' }))!
  assert.equal(e.type, 'approval_required')
  assert.equal(e.message, 'Create a.ts')
})

// ─── Approvals & autonomy ───────────────────────────────────────────────────────
console.log('\nApprovals')
const project = await queries.createProject({
  name: 'fixture', path: tmp, language: null, framework: null, description: null,
  fileCount: 0, testFileCount: 0, dependencies: [],
  settings: { autonomyLevel: 'BALANCED', defaultMode: 'BUILD', maxIterations: 3, executionTimeout: 60000, excludePatterns: [] },
})
const task = await queries.createTask({ projectId: project.id, command: 'x', mode: 'BUILD' })

function makeCtx(autonomy: 'SAFE' | 'BALANCED' | 'AUTONOMOUS', sink: AgentEvent[] = [], taskId = task.id) {
  return new TaskContext({ taskId, projectId: project.id, command: 'x', mode: 'BUILD', project, maxIterations: 3, autonomy, emit: (e) => sink.push(e) })
}

await test('needsApproval follows the autonomy matrix', () => {
  assert.equal(makeCtx('SAFE').needsApproval('file_write'), true)
  assert.equal(makeCtx('SAFE').needsApproval('dangerous_command'), true)
  assert.equal(makeCtx('BALANCED').needsApproval('file_write'), false)
  assert.equal(makeCtx('BALANCED').needsApproval('dangerous_command'), true)
  assert.equal(makeCtx('AUTONOMOUS').needsApproval('file_write'), false)
  assert.equal(makeCtx('AUTONOMOUS').needsApproval('dangerous_command'), false)
})

await test('confirm() pauses until the user approves', async () => {
  const sink: AgentEvent[] = []
  const ctx = makeCtx('SAFE', sink)
  let settled: boolean | undefined
  const p = ctx.confirm('file_write', 'Create a.ts', { filePath: 'a.ts' }).then((v) => (settled = v))
  const req = await until(() => sink.find((e) => e.type === 'approval_required'))
  await sleep(30)
  assert.equal(settled, undefined, 'must still be waiting')
  assert.equal(approvals.pendingApprovals(task.id).length, 1)
  assert.equal(approvals.resolveApproval(task.id, (req.data as any).approvalId, true), true)
  assert.equal(await p, true)
  assert.equal(approvals.pendingApprovals(task.id).length, 0)
  assert.ok(sink.some((e) => e.type === 'approval_resolved' && (e.data as any).approved === true))
})

await test('a denial resolves false', async () => {
  const sink: AgentEvent[] = []
  const p = makeCtx('SAFE', sink).confirm('file_write', 'Create b.ts')
  const req = await until(() => sink.find((e) => e.type === 'approval_required'))
  approvals.resolveApproval(task.id, (req.data as any).approvalId, false)
  assert.equal(await p, false)
})

await test('resolving with the wrong task id or a second time is refused', async () => {
  const sink: AgentEvent[] = []
  const p = makeCtx('SAFE', sink).confirm('file_write', 'Create c.ts')
  const id = (await until(() => sink.find((e) => e.type === 'approval_required'))).data!.approvalId as string
  assert.equal(approvals.resolveApproval('someone-else', id, true), false)
  assert.equal(approvals.resolveApproval(task.id, id, true), true)
  assert.equal(approvals.resolveApproval(task.id, id, true), false)
  await p
})

await test('cancelling a task denies its waiting approvals and stops the work', async () => {
  const sink: AgentEvent[] = []
  const ctx = makeCtx('SAFE', sink)
  const p = ctx.confirm('file_write', 'Create d.ts').then(() => 'resolved', (e) => (e instanceof TaskCancelledError ? 'cancelled' : 'other'))
  await until(() => sink.find((e) => e.type === 'approval_required'))
  ctx.cancel()
  assert.equal(await p, 'cancelled')
  assert.equal(approvals.pendingApprovals(task.id).length, 0)
  assert.equal(ctx.shouldContinue(), false)
})

await test('an unanswered approval times out as a denial', async () => {
  const sink: AgentEvent[] = []
  const ok = await approvals.requestApproval({ taskId: task.id, type: 'file_write', description: 'slow', emit: (e) => sink.push(e), timeoutMs: 40 })
  assert.equal(ok, false)
  assert.ok(sink.some((e) => e.type === 'approval_resolved' && (e.data as any).reason === 'timeout'))
})

await test('AUTONOMOUS never asks', async () => {
  const sink: AgentEvent[] = []
  assert.equal(await makeCtx('AUTONOMOUS', sink).confirm('file_write', 'x'), true)
  assert.equal(sink.length, 0)
})

// ─── End-to-end through the HTTP routes (stubbed AI) ────────────────────────────
console.log('\nTask routes')

const realGenerate = aiRouter.generate.bind(aiRouter)
const realStructured = aiRouter.structuredOutput.bind(aiRouter)
let generateDelayMs = 0
let generateCalls = 0
;(aiRouter as any).generate = async (prompt: string) => {
  generateCalls++
  if (generateDelayMs) await sleep(generateDelayMs)
  if (/^Task:/.test(prompt)) return 'export const hello = "world"\n'
  return '## Overview\n\nThis project is a fixture. See `README.md`.'
}
;(aiRouter as any).structuredOutput = async (_p: string, schema: any) => {
  if (schema?.properties?.steps) return { steps: ['write hello'], filesToCreate: ['hello.ts'], filesToModify: [], risks: [] }
  if (schema?.properties?.verified) return { verified: true, explanation: 'Looks good' }
  return { mode: 'BUILD' }
}

const projectDir = fs.mkdtempSync(path.join(tmp, 'proj-'))
fs.writeFileSync(path.join(projectDir, 'README.md'), '# Fixture\n')
const routeProject = await queries.createProject({
  name: 'route-fixture', path: projectDir, language: null, framework: null, description: null,
  fileCount: 1, testFileCount: 0, dependencies: [],
  settings: { autonomyLevel: 'BALANCED', defaultMode: 'BUILD', maxIterations: 2, executionTimeout: 60000, excludePatterns: [] },
})

const app = Fastify({ logger: false })
await app.register(tasksPlugin)
await app.register(agentPlugin)
await app.listen({ port: 0, host: '127.0.0.1' })
const base = `http://127.0.0.1:${(app.server.address() as any).port}`
const post = async (url: string, body?: unknown) => {
  // Like the app's client: a JSON content type only when there is a body (Fastify rejects an empty JSON body).
  const res = await fetch(base + url, {
    method: 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json().catch(() => null)) as any }
}
const get = async (url: string) => (await fetch(base + url)).json() as Promise<any>
const waitForStatus = (id: string, statuses: string[]) =>
  until(async () => {
    const t = await get(`/api/tasks/${id}`)
    return statuses.includes(t.status) ? t : undefined
  }, 8000, `task ${id} → ${statuses.join('/')}`)

await test('EXPLAIN mode answers from the code and writes nothing', async () => {
  const before = fs.readdirSync(projectDir).sort()
  const { json: created } = await post(`/api/projects/${routeProject.id}/tasks`, { command: 'Explain this project', mode: 'EXPLAIN' })
  const done = await waitForStatus(created.id, ['COMPLETED', 'FAILED'])
  assert.equal(done.status, 'COMPLETED', done.summary)
  assert.match(done.summary, /fixture/i)
  assert.deepEqual(fs.readdirSync(projectDir).sort(), before, 'EXPLAIN must not touch the project')
})

await test('BUILD mode completes: DB status flips to COMPLETED with the changed files recorded', async () => {
  const { json: created } = await post(`/api/projects/${routeProject.id}/tasks`, { command: 'Add hello', mode: 'BUILD', autonomy: 'AUTONOMOUS' })
  const done = await waitForStatus(created.id, ['COMPLETED', 'FAILED'])
  assert.equal(done.status, 'COMPLETED', done.summary)
  assert.deepEqual(done.filesChanged, ['hello.ts'])
  assert.equal(fs.readFileSync(path.join(projectDir, 'hello.ts'), 'utf8').trim(), 'export const hello = "world"')
  const steps = await get(`/api/tasks/${created.id}/steps`)
  assert.ok(steps.length >= 5)
  assert.ok(steps.every((s: any) => s.data?.eventType), 'every persisted step records its canonical event type')
  assert.equal(steps.at(-1).data.eventType, 'complete')
  // The Changes tab reads `diff` (and crashed the whole UI when the server only sent `patch`).
  const diffs = await get(`/api/tasks/${created.id}/diffs`)
  assert.equal(diffs.length, 1)
  assert.equal(diffs[0].filePath, 'hello.ts')
  assert.equal(typeof diffs[0].diff, 'string')
  assert.match(diffs[0].diff, /@@/)
  assert.equal(diffs[0].isNew, true)
  assert.equal(diffs[0].before, null)
  assert.match(diffs[0].after, /hello/)
  assert.ok(diffs[0].additions >= 1)
  assert.ok(steps.some((s: any) => s.data.eventType === 'file_change' && s.data.filePath === 'hello.ts'))
})

await test('SAFE mode: denying the write leaves the file uncreated', async () => {
  fs.rmSync(path.join(projectDir, 'hello.ts'), { force: true })
  const { json: created } = await post(`/api/projects/${routeProject.id}/tasks`, { command: 'Add hello', mode: 'BUILD', autonomy: 'SAFE' })
  const pending = await until(async () => {
    const list = await get(`/api/tasks/${created.id}/approvals`)
    return list.length ? list : undefined
  })
  assert.match(pending[0].description, /hello\.ts/)
  const answered = await post(`/api/tasks/${created.id}/approvals/${pending[0].id}`, { approved: false })
  assert.equal(answered.status, 200)
  const done = await waitForStatus(created.id, ['COMPLETED', 'FAILED'])
  assert.equal(fs.existsSync(path.join(projectDir, 'hello.ts')), false)
  assert.deepEqual(done.filesChanged, [])
  assert.equal(done.autonomy, 'SAFE', 'the level the task started with is stored, so "Run again" can reuse it')
  assert.match(done.summary, /skipped 1 change/i, 'the summary says the change was skipped instead of claiming nothing was needed')
  const again = await post(`/api/tasks/${created.id}/approvals/${pending[0].id}`, { approved: true })
  assert.equal(again.status, 409, 'a stale answer is refused')
})

await test('SAFE mode: approving the write creates the file', async () => {
  fs.rmSync(path.join(projectDir, 'hello.ts'), { force: true })
  const { json: created } = await post(`/api/projects/${routeProject.id}/tasks`, { command: 'Add hello', mode: 'BUILD', autonomy: 'SAFE' })
  const pending = await until(async () => {
    const list = await get(`/api/tasks/${created.id}/approvals`)
    return list.length ? list : undefined
  })
  await post(`/api/tasks/${created.id}/approvals/${pending[0].id}`, { approved: true })
  const done = await waitForStatus(created.id, ['COMPLETED', 'FAILED'])
  assert.equal(done.status, 'COMPLETED', done.summary)
  assert.equal(fs.existsSync(path.join(projectDir, 'hello.ts')), true)
})

await test('cancel stops the pipeline: no file is written, status is CANCELLED', async () => {
  fs.rmSync(path.join(projectDir, 'hello.ts'), { force: true })
  generateDelayMs = 400
  const before = generateCalls
  const { json: created } = await post(`/api/projects/${routeProject.id}/tasks`, { command: 'Add hello', mode: 'BUILD', autonomy: 'AUTONOMOUS' })
  await until(async () => (await get(`/api/tasks/${created.id}`)).currentStage === 'IMPLEMENTING' || generateCalls > before)
  const cancelled = await post(`/api/tasks/${created.id}/cancel`)
  assert.equal(cancelled.json.status, 'CANCELLED')
  await sleep(700) // the in-flight model call returns, the pipeline must notice and stop
  generateDelayMs = 0
  assert.equal(fs.existsSync(path.join(projectDir, 'hello.ts')), false, 'the write after cancel must not happen')
  const final = await get(`/api/tasks/${created.id}`)
  assert.equal(final.status, 'CANCELLED', 'a late stage must not resurrect the task')
})

await test('the SSE stream replays events to a client that connects late', async () => {
  const { json: created } = await post(`/api/projects/${routeProject.id}/tasks`, { command: 'Explain', mode: 'EXPLAIN' })
  await waitForStatus(created.id, ['COMPLETED'])
  const res = await fetch(`${base}/sse/agent/${created.id}`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const end = Date.now() + 3000
  while (Date.now() < end && !text.includes('"type":"complete"')) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value)
  }
  await reader.cancel()
  assert.ok(text.includes('"type":"stage_change"'), 'replayed stage events')
  assert.ok(text.includes('"type":"complete"'), 'replayed the completion')
})

await test('cancelling an unknown task is a 404', async () => {
  assert.equal((await post('/api/tasks/nope/cancel')).status, 404)
})

await test('rejects an invalid autonomy level', async () => {
  const r = await post(`/api/projects/${routeProject.id}/tasks`, { command: 'x', autonomy: 'YOLO' })
  assert.equal(r.status, 400)
})

await test('tasks left running by a restart are failed on startup', async () => {
  const stuck = await queries.createTask({ projectId: routeProject.id, command: 'stuck', mode: 'BUILD' })
  await queries.updateTaskStatus(stuck.id, 'RUNNING', 'IMPLEMENTING')
  const n = await queries.failOrphanedTasks()
  assert.ok(n >= 1)
  assert.equal((await queries.getTask(stuck.id))!.status, 'FAILED')
})

;(aiRouter as any).generate = realGenerate
;(aiRouter as any).structuredOutput = realStructured
await app.close()
await closeDb()
try {
  fs.rmSync(tmp, { recursive: true, force: true })
} catch {
  /* Windows keeps the SQLite file locked for a moment — the OS temp cleaner gets it */
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
