import { FastifyPluginAsync } from 'fastify';
import * as queries from '../db/queries.js';
import { GitService } from '../git/git-service.js';

export const gitPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/projects/:id/git/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await queries.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    
    const git = new GitService(project.path);
    if (!(await git.isRepo())) return reply.status(400).send({ error: 'Not a git repository' });
    return git.getStatus();
  });

  fastify.get('/api/projects/:id/git/diff', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await queries.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    
    const git = new GitService(project.path);
    if (!(await git.isRepo())) return reply.status(400).send({ error: 'Not a git repository' });
    const diff = await git.getDiff();
    return { diff };
  });

  fastify.get('/api/projects/:id/git/log', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await queries.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    
    const git = new GitService(project.path);
    if (!(await git.isRepo())) return reply.status(400).send({ error: 'Not a git repository' });
    return git.getLog();
  });

  fastify.post('/api/projects/:id/git/commit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { message, files } = request.body as { message: string, files?: string[] };
    const project = await queries.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    
    const git = new GitService(project.path);
    if (!(await git.isRepo())) return reply.status(400).send({ error: 'Not a git repository' });
    
    const hash = await git.commit(message, files);
    return { hash };
  });

  fastify.post('/api/projects/:id/git/branch', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name: string };
    const project = await queries.getProject(id);
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    
    const git = new GitService(project.path);
    if (!(await git.isRepo())) return reply.status(400).send({ error: 'Not a git repository' });
    
    await git.createBranch(name);
    return { success: true };
  });
};
