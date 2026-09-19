import type { FastifyPluginAsync } from 'fastify';
import { aiRouter } from '../ai/router.js';
import { modelRegistry } from '../ai/registry.js';
import { setSetting } from '../db/queries.js';

export const aiPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /api/ai/providers - List all providers with metadata, configured status, and health
  fastify.get('/api/ai/providers', async (_request, reply) => {
    await aiRouter.syncWithSettings();
    const catalog = modelRegistry.getProviders();
    const healthStatuses = await aiRouter.getHealthStatuses();
    const healthMap = new Map(healthStatuses.map(h => [h.providerId, h]));

    const providers = catalog.map(p => {
      const instance = aiRouter.getProvider(p.id);
      const isConfigured = instance ? instance.isConfigured() : false;
      const health = healthMap.get(p.id) || {
        providerId: p.id,
        providerName: p.name,
        status: isConfigured ? 'available' : 'unconfigured',
        modelsCount: instance ? instance.getModels().length : 0,
        lastChecked: new Date().toISOString(),
      };

      return {
        ...p,
        isConfigured,
        health,
        models: instance ? instance.getModels() : [],
      };
    });

    return reply.send({
      providers,
      routingMode: aiRouter.getRoutingMode(),
      metrics: aiRouter.getMetrics(),
    });
  });

  // GET /api/ai/models - List all models across providers with capabilities and recommendation tags
  fastify.get('/api/ai/models', async (_request, reply) => {
    const models = modelRegistry.getAllModels();
    return reply.send({ models });
  });

  // GET /api/ai/nvidia/models - Discover active models live from NVIDIA endpoint
  fastify.get('/api/ai/nvidia/models', async (_request, reply) => {
    await aiRouter.syncWithSettings();
    const provider = aiRouter.getProvider('nvidia') as any;
    if (!provider) {
      return reply.code(404).send({ error: 'NVIDIA provider not found' });
    }
    const models = await provider.discoverModels(true);
    return reply.send({ models });
  });

  // POST /api/ai/test - Test credentials and latency for a specific provider
  fastify.post<{
    Body: {
      providerId: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
  }>('/api/ai/test', async (request, reply) => {
    const { providerId, apiKey, baseUrl, model } = request.body || {};
    if (!providerId) {
      return reply.code(400).send({ error: 'providerId is required' });
    }

    const provider = aiRouter.getProvider(providerId);
    if (!provider) {
      return reply.code(404).send({ error: `Provider ${providerId} not found` });
    }

    // Temporarily apply keys if provided for the test
    if (apiKey) {
      (provider as any).setApiKey?.(apiKey);
    }
    if (baseUrl && (provider as any).setBaseURL) {
      (provider as any).setBaseURL(baseUrl);
    }
    if (model && (provider as any).setModel) {
      (provider as any).setModel(model);
    }
    if (providerId === 'ollama' && apiKey === undefined) {
      (provider as any).setEnabled?.(true);
    }

    try {
      if (providerId === 'nvidia' && typeof (provider as any).detailedHealthCheck === 'function') {
        const detailedHealth = await (provider as any).detailedHealthCheck();
        const success = detailedHealth.overall === 'pass' || detailedHealth.overall === 'partial';
        return reply.send({
          success,
          health: detailedHealth,
          detailedHealth,
        });
      }

      const health = await provider.healthCheck();
      return reply.send({ success: health.status === 'available', health });
    } catch (err: any) {
      return reply.send({
        success: false,
        health: {
          providerId,
          providerName: provider.name,
          status: 'error',
          message: err.message || 'Connection test failed',
          modelsCount: provider.getModels().length,
          lastChecked: new Date().toISOString(),
        },
      });
    }
  });

  // GET /api/ai/metrics - Telemetry, fallback rates, and request distribution
  fastify.get('/api/ai/metrics', async (_request, reply) => {
    return reply.send(aiRouter.getMetrics());
  });

  // POST /api/ai/routing-mode - Change active routing mode ('auto' or specific provider ID)
  fastify.post<{
    Body: { mode: string };
  }>('/api/ai/routing-mode', async (request, reply) => {
    const { mode } = request.body || {};
    if (!mode) {
      return reply.code(400).send({ error: 'mode is required' });
    }

    aiRouter.setRoutingMode(mode);
    await setSetting('aiRoutingMode', mode);
    return reply.send({ success: true, mode });
  });
};
