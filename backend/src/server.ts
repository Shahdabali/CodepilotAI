import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { initDb, closeDb } from './db/schema.js';
import { config } from './config.js';

import { projectsPlugin } from './routes/projects.js';
import { tasksPlugin } from './routes/tasks.js';
import { filesPlugin } from './routes/files.js';
import { gitPlugin } from './routes/git.js';
import { settingsPlugin } from './routes/settings.js';
import { agentPlugin } from './routes/agent.js';
import { terminalPlugin } from './routes/terminal.js';
import { aiPlugin } from './routes/ai.js';
import { apiFetcherPlugin } from './api-fetcher/routes.js';
import { githubPlugin } from './github/routes.js';
import { aiRouter } from './ai/router.js';

const fastify = Fastify({ logger: true });

async function start() {
  try {
    await initDb();
    await aiRouter.syncWithSettings();
    
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN || '*'
    });
    
    await fastify.register(websocket);
    
    await fastify.register(projectsPlugin);
    await fastify.register(tasksPlugin);
    await fastify.register(filesPlugin);
    await fastify.register(gitPlugin);
    await fastify.register(settingsPlugin);
    await fastify.register(agentPlugin);
    await fastify.register(terminalPlugin);
    await fastify.register(aiPlugin);
    await fastify.register(apiFetcherPlugin);
    await fastify.register(githubPlugin);

    // Serve frontend SPA in production if built
    try {
      const { fileURLToPath } = await import('url');
      const path = (await import('path')).default;
      const fs = (await import('fs')).default;
      const fastifyStatic = (await import('@fastify/static')).default;
      
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const frontendDist = path.resolve(currentDir, '../../frontend/dist');
      
      if (fs.existsSync(frontendDist)) {
        await fastify.register(fastifyStatic, {
          root: frontendDist,
          prefix: '/',
        });
        
        fastify.setNotFoundHandler((req, reply) => {
          const url = req.raw.url || '';
          if (url.startsWith('/api') || url.startsWith('/sse') || url.startsWith('/ws')) {
            reply.code(404).send({ error: 'Endpoint not found' });
          } else {
            reply.sendFile('index.html');
          }
        });
      }
    } catch {
      // Ignore if static assets cannot be loaded
    }
    
    const port = config.port || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    
    console.log(`Server listening on port ${port}`);
    
    process.on('SIGINT', async () => {
      await closeDb();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      await closeDb();
      process.exit(0);
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
