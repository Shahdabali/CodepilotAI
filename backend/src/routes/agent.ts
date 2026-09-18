import { FastifyPluginAsync } from 'fastify';
import { EventEmitter } from 'events';

const taskEmitters = new Map<string, EventEmitter>();

export function getTaskEmitter(taskId: string): EventEmitter {
  if (!taskEmitters.has(taskId)) {
    taskEmitters.set(taskId, new EventEmitter());
  }
  return taskEmitters.get(taskId)!;
}

export function emitAgentEvent(taskId: string, event: any) {
  const emitter = getTaskEmitter(taskId);
  emitter.emit('event', event);
}

export const agentPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/sse/agent/:taskId', (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    
    reply.raw.write(`data: ${JSON.stringify({ type: 'CONNECTED', taskId })}\n\n`);

    const emitter = getTaskEmitter(taskId);
    
    const onEvent = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    emitter.on('event', onEvent);
    
    const heartbeat = setInterval(() => {
      reply.raw.write(':\n\n');
    }, 15000);
    
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      emitter.off('event', onEvent);
      if (emitter.listenerCount('event') === 0) {
        taskEmitters.delete(taskId);
      }
    });
  });
};
