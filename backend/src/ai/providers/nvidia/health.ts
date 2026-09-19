import type { HealthStatus } from '../../provider.interface.js';
import { NvidiaClient } from './client.js';
import { NvidiaApiError } from './errors.js';

export interface NvidiaDiagnosticStep {
  name: string;
  status: 'pass' | 'fail' | 'skipped';
  message: string;
  latencyMs?: number;
}

export interface NvidiaDetailedHealth extends HealthStatus {
  steps: NvidiaDiagnosticStep[];
  discoveredModels: string[];
  suggestedAction?: string;
  technicalError?: string;
}

export async function runNvidiaDiagnostic(
  client: NvidiaClient,
  preferredModel?: string
): Promise<NvidiaDetailedHealth> {
  const steps: NvidiaDiagnosticStep[] = [];
  const startTotal = Date.now();

  if (!client.isConfigured()) {
    return {
      providerId: 'nvidia',
      providerName: 'NVIDIA NIM',
      status: 'unconfigured',
      message: 'NVIDIA API key not set',
      modelsCount: 0,
      lastChecked: new Date().toISOString(),
      steps: [
        { name: 'API Key Check', status: 'fail', message: 'No API Key configured' },
        { name: 'Endpoint Reachability', status: 'skipped', message: 'Skipped (no key)' },
        { name: 'Model Discovery', status: 'skipped', message: 'Skipped' },
        { name: 'Inference Generation', status: 'skipped', message: 'Skipped' },
      ],
      discoveredModels: [],
      suggestedAction: 'Enter an NVIDIA API key from build.nvidia.com or configure a self-hosted NIM URL.',
    };
  }

  // Step 1 & 2: Query /v1/models to verify endpoint reachability and API Key
  const step1Start = Date.now();
  let models: string[] = [];
  try {
    const rawModels = await client.listModels();
    models = rawModels.map((m) => m.id);
    const latency1 = Date.now() - step1Start;

    steps.push({
      name: 'Endpoint Reachability & Auth',
      status: 'pass',
      message: `Endpoint reachable, API key accepted (${latency1}ms)`,
      latencyMs: latency1,
    });

    steps.push({
      name: 'Model Discovery',
      status: 'pass',
      message: `Discovered ${models.length} active models via /v1/models`,
    });
  } catch (err: any) {
    const latency1 = Date.now() - step1Start;
    const isNvidiaError = err instanceof NvidiaApiError;
    const technical = err.details?.detail || err.message;

    steps.push({
      name: 'Endpoint Reachability & Auth',
      status: 'fail',
      message: err.message,
      latencyMs: latency1,
    });
    steps.push({
      name: 'Model Discovery',
      status: 'skipped',
      message: 'Failed due to reachability/auth error',
    });
    steps.push({
      name: 'Inference Generation',
      status: 'skipped',
      message: 'Skipped',
    });

    return {
      providerId: 'nvidia',
      providerName: 'NVIDIA NIM',
      status: 'error',
      message: err.message,
      latencyMs: latency1,
      modelsCount: 0,
      lastChecked: new Date().toISOString(),
      steps,
      discoveredModels: [],
      suggestedAction: isNvidiaError ? err.details.suggestedAction : 'Check network connectivity or Base URL.',
      technicalError: technical,
    };
  }

  // Step 3: Test generation with candidate model
  const step3Start = Date.now();
  const testCandidates = [
    preferredModel,
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'mistralai/codestral-22b-instruct-v0.1',
    'deepseek-ai/deepseek-coder-6.7b-instruct',
    'meta/codellama-70b',
    models[0],
  ].filter(Boolean) as string[];

  let successfulModel: string | null = null;
  let lastInferenceError: any = null;

  for (const candidate of testCandidates) {
    try {
      await client.createChatCompletion({
        model: candidate,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      });
      successfulModel = candidate;
      break;
    } catch (err: any) {
      lastInferenceError = err;
    }
  }

  const latency3 = Date.now() - step3Start;

  if (successfulModel) {
    steps.push({
      name: 'Inference Generation',
      status: 'pass',
      message: `Live generation successful with model '${successfulModel}' (${latency3}ms)`,
      latencyMs: latency3,
    });

    return {
      providerId: 'nvidia',
      providerName: 'NVIDIA NIM',
      status: 'available',
      message: `Connected (${models.length} models ready)`,
      latencyMs: Date.now() - startTotal,
      modelsCount: models.length,
      lastChecked: new Date().toISOString(),
      steps,
      discoveredModels: models,
    };
  }

  // If models were found, but inference execution failed
  const errorObj = lastInferenceError instanceof NvidiaApiError ? lastInferenceError : null;
  const isEntitlement =
    errorObj?.status === 404 ||
    (errorObj?.message && errorObj.message.includes('Public API Endpoints'));

  steps.push({
    name: 'Inference Generation',
    status: 'fail',
    message: lastInferenceError?.message || 'Chat completion test failed',
    latencyMs: latency3,
  });

  return {
    providerId: 'nvidia',
    providerName: 'NVIDIA NIM',
    status: 'degraded',
    message: isEntitlement
      ? 'API Key verified & models retrieved, but account is missing Public API Endpoints permission'
      : lastInferenceError?.message || 'Inference test failed',
    latencyMs: Date.now() - startTotal,
    modelsCount: models.length,
    lastChecked: new Date().toISOString(),
    steps,
    discoveredModels: models,
    suggestedAction:
      errorObj?.details?.suggestedAction ||
      'Contact help@build.nvidia.com to enable Public API Endpoints or point Base URL to a self-hosted NIM instance (http://localhost:8000/v1).',
    technicalError: errorObj?.details?.detail || lastInferenceError?.message,
  };
}
