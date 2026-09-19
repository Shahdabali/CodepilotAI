import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FileManager } from '../workspace/file-manager.js'
import { ContextManager } from '../ai/context-manager.js'
import { NvidiaProvider } from '../ai/providers/nvidia.provider.js'
import { getAIRouter } from '../ai/router.js'
import { RollbackService } from '../workspace/rollback.js'
import { initDb, closeDb } from '../db/schema.js'
import { getSetting } from '../db/queries.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../..')

async function runTest() {
  console.log('=== RUNNING WORKSPACE, POWER FEATURES & NVIDIA NIM TEST SUITE ===')

  await initDb()

  // 1. Test FileManager.validatePath
  console.log('\n[1] Testing FileManager.validatePath...')
  const validRes = await FileManager.validatePath(projectRoot)
  assert.equal(validRes.valid, true, 'Project root should be a valid directory')
  assert.equal(validRes.isDirectory, true, 'Project root must be a directory')
  console.log(`  ✓ Valid path confirmed: ${validRes.name} (${validRes.absolutePath})`)

  const invalidRes = await FileManager.validatePath('C:\\NonExistentPath12345XYZ')
  assert.equal(invalidRes.valid, false, 'Non-existent path must be invalid')
  assert.equal(invalidRes.exists, false, 'Non-existent path must have exists=false')
  console.log(`  ✓ Invalid path correctly rejected: ${invalidRes.error}`)

  // 2. Test FileManager.getProjectAnalysis
  console.log('\n[2] Testing Deep Multi-Stack Project Analysis on codebase root...')
  const fm = new FileManager(projectRoot)
  const analysis = await fm.getProjectAnalysis()

  console.log('  Analysis Results:', {
    language: analysis.language,
    framework: analysis.framework,
    packageManager: analysis.packageManager,
    buildTool: analysis.buildTool,
    fileCount: analysis.fileCount,
    sourceFileCount: analysis.sourceFileCount,
    testFileCount: analysis.testFileCount,
    hasTypeScript: analysis.hasTypeScript,
    hasGit: analysis.hasGit,
    gitBranch: analysis.gitStatus?.branch,
  })

  assert.equal(analysis.language, 'typescript', 'Should detect TypeScript')
  assert(analysis.fileCount > 20, 'Should count files in project')
  assert(analysis.sourceFileCount! > 10, 'Should count source files')
  assert.equal(analysis.hasTypeScript, true, 'Should detect TypeScript flag')
  console.log('  ✓ Multi-stack project analysis verified')

  // 3. Test Smart Context Token Parsing
  console.log('\n[3] Testing ContextManager Smart Token Parsing...')
  const tokens = ContextManager.parseTokens(
    'Refactor the auth flow @file:src/App.tsx and check @folder:src/ai for @project requirements'
  )
  assert.equal(tokens.isProjectWide, true, 'Should detect @project')
  assert.deepEqual(tokens.files, ['src/App.tsx'], 'Should extract @file:src/App.tsx')
  assert.deepEqual(tokens.folders, ['src/ai'], 'Should extract @folder:src/ai')
  assert(
    tokens.cleanedPrompt.includes('Refactor the auth flow'),
    'Should retain prompt message'
  )
  console.log('  ✓ Smart context tokens correctly extracted: ', tokens)

  // 4. Test NVIDIA NIM Integration & Diagnostic
  console.log('\n[4] Testing NVIDIA NIM Integration & Diagnostics...')
  const dbKey = (await getSetting('nvidiaApiKey')) as string
  const nvidiaKey = dbKey || process.env.NVIDIA_API_KEY || ''
  const nvidia = new NvidiaProvider(nvidiaKey)

  assert.equal(nvidia.id, 'nvidia')
  assert.equal(nvidia.isConfigured(), Boolean(nvidiaKey))
  console.log(`  ✓ NVIDIA NIM isConfigured: ${nvidia.isConfigured()}`)

  if (nvidia.isConfigured()) {
    console.log('  Running detailed 4-step diagnostic against integrate.api.nvidia.com...')
    const diag = await nvidia.detailedHealthCheck()
    console.log('  Diagnostic Report:', {
      status: diag.status,
      latencyMs: diag.latencyMs,
      modelsDiscoveredCount: diag.discoveredModels.length,
      steps: diag.steps.map((s) => ({ name: s.name, status: s.status, message: s.message })),
      suggestedAction: diag.suggestedAction,
    })

    assert(diag.steps.length >= 3, 'Must execute diagnostic steps')
    assert.equal(diag.steps[0].status, 'pass', 'Step 1 (reachability & auth) must pass')
    assert.equal(diag.steps[1].status, 'pass', 'Step 2 (models discovery) must pass')
    assert(diag.discoveredModels.length > 0, 'Must discover active NVIDIA models')

    console.log(`  ✓ Models discovered from NVIDIA NIM: ${diag.discoveredModels.length} models`)
    console.log(`  ✓ Sample models: ${diag.discoveredModels.slice(0, 3).join(', ')}`)

    if (diag.steps[2]?.status !== 'pass') {
      console.log(`  ✓ Notice: Step 3 test inference status: ${diag.steps[2]?.status}`)
      console.log(`  ✓ Clear guidance provided: ${diag.suggestedAction}`)
    }
  }

  // 5. Test Strict Provider Routing Mode
  console.log('\n[5] Testing Strict Provider Routing in AIRouter...')
  const router = getAIRouter()
  await router.syncWithSettings()
  router.setRoutingMode('nvidia-only')

  const candidateChain = router.getCandidateChain('CODE_GENERATION')
  assert.equal(candidateChain.length, 1, 'Strict mode nvidia-only must yield exactly 1 candidate')
  assert.equal(candidateChain[0].provider.id, 'nvidia', 'Candidate must be nvidia')
  console.log('  ✓ Strict mode "nvidia-only" enforces exclusive NVIDIA NIM routing without silent fallbacks')

  // 6. Test RollbackService Conflict Detection
  console.log('\n[6] Testing RollbackService Conflict Detection...')
  const rollback = new RollbackService()
  const conflicts = await rollback.checkConflicts(
    [
      {
        id: 'test-1',
        taskId: 'task-1',
        filePath: 'package.json',
        contentBefore: '{"name": "before"}',
        contentAfter: '{"name": "after"}',
        createdAt: new Date().toISOString(),
      },
    ],
    projectRoot
  )
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].filePath, 'package.json')
  assert.equal(conflicts[0].hasConflict, true, 'Modified disk content should be detected as conflict')
  console.log('  ✓ Conflict detection successfully checked package.json')

  await closeDb()

  console.log('\n======================================================')
  console.log('🎉 ALL WORKSPACE, POWER FEATURES & NVIDIA TESTS PASSED!')
  console.log('======================================================\n')
}

runTest().catch(async (err) => {
  console.error('\n❌ TEST FAILED:', err)
  await closeDb().catch(() => {})
  process.exit(1)
})
