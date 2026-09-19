import { FastifyPluginAsync } from 'fastify';
import { EventEmitter } from 'events';

const taskEmitters = new Map<string, EventEmitter>();

/**
 * Events are buffered per task so an SSE client that connects a moment after the task started (the UI
 * subscribes only after the create-task response arrives) or reconnects after a network blip still sees
 * the whole run. Buffers are dropped shortly after the task reaches a terminal state.
 */
const HISTORY_CAP = 500;
const HISTORY_TTL_MS = 30 * 60 * 1000;
const taskHistory = new Map<string, any[]>();
const TERMINAL_TYPES = new Set(['complete', 'error', 'cancelled']);

export function getTaskEmitter(taskId: string): EventEmitter {
  if (!taskEmitters.has(taskId)) {
    taskEmitters.set(taskId, new EventEmitter());
  }
  return taskEmitters.get(taskId)!;
}

export function emitAgentEvent(taskId: string, event: any) {
  const history = taskHistory.get(taskId) ?? [];
  history.push(event);
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
  taskHistory.set(taskId, history);

  if (TERMINAL_TYPES.has(event?.type)) {
    setTimeout(() => taskHistory.delete(taskId), HISTORY_TTL_MS).unref?.();
  }

  getTaskEmitter(taskId).emit('event', event);
}

export const agentPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/sse/agent/:taskId', (request, reply) => {
    const { taskId } = request.params as { taskId: string };

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    });

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', taskId })}\n\n`);

    const emitter = getTaskEmitter(taskId);

    // Subscribe first, then replay, so nothing emitted in between is lost. The replay may include events
    // that also arrive live; `seen` drops those duplicates by identity.
    const seen = new Set<any>();
    const send = (data: any) => {
      if (seen.has(data)) return;
      seen.add(data);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    emitter.on('event', send);
    for (const past of taskHistory.get(taskId) ?? []) send(past);

    const heartbeat = setInterval(() => {
      res.write(':\n\n');
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      emitter.off('event', send);
      if (emitter.listenerCount('event') === 0) {
        taskEmitters.delete(taskId);
      }
    });
  });
};
