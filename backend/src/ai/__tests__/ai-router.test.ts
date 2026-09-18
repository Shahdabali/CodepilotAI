import assert from 'node:assert/strict';
import { config } from '../../config.js';
import { modelRegistry, ModelRegistry } from '../registry.js';
import { ContextManager } from '../context-manager.js';
import { GeminiProvider } from '../gemini.provider.js';
import { GroqProvider } from '../providers/groq.provider.js';
import { OpenRouterProvider } from '../providers/openrouter.provider.js';
import { NvidiaProvider } from '../providers/nvidia.provider.js';
import { GithubModelsProvider } from '../providers/github.provider.js';
import { OllamaProvider } from '../providers/ollama.provider.js';
import { AIRouter, getAIRouter } from '../router.js';

async function runTests() {
  console.log('--- STARTING MULTI-PROVIDER AI TEST SUITE ---');

  // 1. Model Registry Tests
  console.log('\n[1] Testing Model Registry...');
  const allModels = modelRegistry.getAllModels();
  assert(allModels.length >= 15, `Expected at least 15 models, got ${allModels.length}`);
  console.log(`  ✓ Registered ${allModels.length} models across all providers`);

  const geminiModel = modelRegistry.getModel('gemini-3.6-flash');
  assert(geminiModel, 'gemini-3.6-flash should be in registry');
  assert.equal(geminiModel.provider, 'gemini');
  assert.equal(geminiModel.contextWindow, 1048576);
  console.log('  ✓ Gemini model metadata verified');

  const planningModels = modelRegistry.getModelsByTask('PLANNING');
  assert(planningModels.length > 0, 'Should find models recommended for PLANNING');
  console.log(`  ✓ Found ${planningModels.length} models recommended for PLANNING`);

  const providersCatalog = modelRegistry.getProviders();
  assert.equal(providersCatalog.length, 6, 'Should have 6 catalog providers');
  console.log('  ✓ Catalog has all 6 providers: Gemini, Groq, OpenRouter, NVIDIA, GitHub, Ollama');

  // 2. Context Manager Tests
  console.log('\n[2] Testing Context Manager & Compression...');
  assert.equal(ContextManager.isRelevantFile('src/index.ts'), true);
  assert.equal(ContextManager.isRelevantFile('node_modules/react/index.js'), false);
  assert.equal(ContextManager.isRelevantFile('dist/bundle.js'), false);
  assert.equal(ContextManager.isRelevantFile('package-lock.json'), false);
  console.log('  ✓ File filtering rules working correctly');

  const files = [
    { path: 'src/server.ts', content: 'import fastify from "fastify";\nexport function start() { return 1; }' },
    { path: 'src/routes/login.ts', content: 'export async function login() {\n  // login logic\n  return true;\n}' },
    { path: 'node_modules/junk.js', content: 'ignored' },
  ];
  const context = ContextManager.prepareContext(files, 'Fix the login authentication bug in login route', 10000);
  assert.equal(context.files.length, 2, 'Should include server.ts and login.ts, ignoring node_modules');
  assert(context.files[0].path.includes('login.ts'), 'login.ts should be ranked highest due to prompt keywords');
  console.log('  ✓ Context scoring and ranking prioritized login.ts first');

  // 3. Provider Adapters Tests
  console.log('\n[3] Testing Provider Adapters...');
  const groq = new GroqProvider();
  assert.equal(groq.id, 'groq');
  assert.equal(groq.isConfigured(), false);
  const groqHealth = await groq.healthCheck();
  assert.equal(groqHealth.status, 'unconfigured');
  console.log('  ✓ Groq unconfigured state handled cleanly');

  const openrouter = new OpenRouterProvider();
  assert.equal(openrouter.id, 'openrouter');
  assert.equal(openrouter.isConfigured(), false);
  console.log('  ✓ OpenRouter adapter verified');

  const nvidia = new NvidiaProvider();
  assert.equal(nvidia.id, 'nvidia');
  assert.equal(nvidia.isConfigured(), false);
  console.log('  ✓ NVIDIA NIM adapter verified');

  const github = new GithubModelsProvider();
  assert.equal(github.id, 'github');
  assert.equal(github.isConfigured(), false);
  console.log('  ✓ GitHub Models adapter verified');

  const ollama = new OllamaProvider();
  assert.equal(ollama.id, 'ollama');
  assert.equal(ollama.isConfigured(), false);
  ollama.setEnabled(true);
  assert.equal(ollama.isConfigured(), true);
  console.log('  ✓ Ollama local adapter verified');

  // 4. AIRouter Tests
  console.log('\n[4] Testing AI Router & Task-Based Fallback Chains...');
  const router = getAIRouter();
  router.setRoutingMode('auto');

  // Verify candidate chain generation for task categories
  const planChain = router.getCandidateChain('PLANNING');
  assert(planChain.length > 0, 'Candidate chain for PLANNING should not be empty');
  console.log(`  ✓ PLANNING candidate chain generated (${planChain.length} candidates)`);

  const codeChain = router.getCandidateChain('CODE_GENERATION');
  assert(codeChain.length > 0, 'Candidate chain for CODE_GENERATION should not be empty');
  console.log(`  ✓ CODE_GENERATION candidate chain generated (${codeChain.length} candidates)`);

  // Fallback simulation test: configure a secondary provider so router has 2 providers to fail over
  (router.getProvider('groq') as any).setApiKey('gsk_mock_test_key');

  let attempts = 0;
  const fallbackResult = await router.executeWithFallback('GENERAL', 'test-fallback-sim', async (provider, modelId) => {
    attempts++;
    if (attempts === 1) {
      // Simulate first provider failing with 429 rate limit
      throw new Error('[RATE_LIMIT] 429 Too Many Requests (simulated)');
    }
    return `Fallback success from ${provider.name} with model ${modelId || 'default'}`;
  });
  assert(attempts >= 2, 'Should have executed fallback after first failure');
  assert(fallbackResult.includes('Fallback success'), 'Fallback result succeeded');
  console.log(`  ✓ Fallback simulation succeeded on attempt #${attempts}: "${fallbackResult}"`);

  // Verify metrics recorded
  const metrics = router.getMetrics();
  assert(metrics.totalRequests > 0, 'Total requests metric should be > 0');
  assert(metrics.fallbackCount > 0, 'Fallback count metric should be > 0');
  assert(metrics.rateLimitHits > 0, 'Rate limit hits metric should be > 0');
  console.log('  ✓ Router metrics recorded: ', {
    totalRequests: metrics.totalRequests,
    fallbackCount: metrics.fallbackCount,
    rateLimitHits: metrics.rateLimitHits,
  });

  // 5. Live Gemini Health Check & Inference
  console.log('\n[5] Testing Live Gemini Provider...');
  const gemini = router.getProvider('gemini') as GeminiProvider;
  if (gemini && gemini.isConfigured()) {
    console.log('  Gemini API key is configured. Testing live healthCheck()...');
    const health = await gemini.healthCheck();
    console.log('  Gemini Health Check Result:', health);
    assert(
      health.status === 'available' || health.status === 'rate_limited',
      `Expected Gemini to respond with available or rate_limited, got ${health.status}: ${health.message}`
    );
    console.log(`  ✓ Live Gemini healthCheck responded (status: ${health.status})! Latency: ${health.latencyMs}ms`);

    try {
      console.log('  Testing live generation with gemini-3.6-flash...');
      const reply = await gemini.generate('Hello, reply with the word OK', { model: 'gemini-3.6-flash' });
      console.log(`  ✓ Gemini response: "${reply}"`);
      assert(reply.length > 0, 'Expected response to be non-empty');
    } catch (err: any) {
      if (err.message && (err.message.includes('RATE_LIMIT') || err.message.includes('429') || err.message.includes('quota'))) {
        console.log(`  ✓ Live rate-limit caught properly: "${err.message.slice(0, 80)}..."`);
      } else {
        throw err;
      }
    }
  } else {
    console.log('  (Skipping live Gemini call: No GEMINI_API_KEY in environment)');
  }

  console.log('\n========================================');
  console.log('🎉 ALL MULTI-PROVIDER AI TESTS PASSED! 🎉');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
