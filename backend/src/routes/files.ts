import { FastifyPluginAsync } from 'fastify';
import * as queries from '../db/queries.js';
import { FileManager } from '../workspace/file-manager.js';

export const filesPlugin: FastifyPluginAsync = async (fastify) => {
  const getTreeHandler = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const project = await queries.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    
    const fm = new FileManager(project.path, 'api');
    return fm.readFileTree();
  };

  fastify.get('/api/projects/:id/files', getTreeHandler);
  fastify.get('/api/projects/:id/files/tree', getTreeHandler);

  fastify.get('/api/projects/:id/files/content', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path } = request.query as { path: string };
    
    const project = await queries.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    
    const fm = new FileManager(project.path, 'api');
    const content = await fm.readFile(path);
    return { content };
  });

  fastify.put('/api/projects/:id/files/content', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { path, content } = request.body as { path: string, content: string };
    
    const project = await queries.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    
    const fm = new FileManager(project.path, 'api');
    await fm.writeFile(path, content);
    return { success: true };
  });
};
