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

const fastify = Fastify({ logger: true });

async function start() {
  try {
    await initDb();
    
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
