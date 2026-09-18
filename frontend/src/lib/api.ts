import {
  Project,
  Task,
  TaskStep,
  FileDiff,
  FileNode,
  GitStatus,
  AppSettings,
  ProvidersResponse,
  ModelInfo,
  HealthStatus,
} from '../types';

const BASE_URL = '/api';

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }
  return response.json();
}

export const api = {
  projects: {
    list: () => fetchApi<Project[]>('/projects'),
    get: (id: string) => fetchApi<Project>(`/projects/${id}`),
    create: (path: string) => fetchApi<Project>('/projects', { method: 'POST', body: JSON.stringify({ path }) }),
    update: (id: string, data: Partial<Project>) => fetchApi<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
    analyze: (id: string) => fetchApi<Project>(`/projects/${id}/analyze`, { method: 'POST' }),
  },
  tasks: {
    list: (projectId: string) => fetchApi<Task[]>(`/projects/${projectId}/tasks`),
    get: (id: string) => fetchApi<Task>(`/tasks/${id}`),
    create: (projectId: string, data: { command: string; mode: string }) => fetchApi<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    cancel: (id: string) => fetchApi<Task>(`/tasks/${id}/cancel`, { method: 'POST' }),
    rollback: (id: string) => fetchApi<Task>(`/tasks/${id}/rollback`, { method: 'POST' }),
    getSteps: (id: string) => fetchApi<TaskStep[]>(`/tasks/${id}/steps`),
    getDiffs: (id: string) => fetchApi<FileDiff[]>(`/tasks/${id}/diffs`),
    approve: (id: string) => fetchApi<Task>(`/tasks/${id}/approve`, { method: 'POST' }),
  },
  files: {
    getTree: (projectId: string) => fetchApi<FileNode[]>(`/projects/${projectId}/files/tree`),
    getContent: (projectId: string, path: string) => fetchApi<{ content: string }>(`/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`),
    writeContent: (projectId: string, path: string, content: string) => fetchApi<{ success: boolean }>(`/projects/${projectId}/files/content`, { method: 'PUT', body: JSON.stringify({ path, content }) }),
  },
  git: {
    getStatus: (projectId: string) => fetchApi<GitStatus>(`/projects/${projectId}/git/status`),
    getDiff: (projectId: string) => fetchApi<{ diff: string }>(`/projects/${projectId}/git/diff`),
    commit: (projectId: string, message: string) => fetchApi<{ success: boolean }>(`/projects/${projectId}/git/commit`, { method: 'POST', body: JSON.stringify({ message }) }),
  },
  settings: {
    get: () => fetchApi<AppSettings>('/settings'),
    update: (data: Partial<AppSettings>) => fetchApi<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
  ai: {
    getProviders: () => fetchApi<ProvidersResponse>('/ai/providers'),
    getModels: () => fetchApi<{ models: ModelInfo[] }>('/ai/models'),
    test: (providerId: string, apiKey?: string, baseUrl?: string) =>
      fetchApi<{ success: boolean; health: HealthStatus }>('/ai/test', {
        method: 'POST',
        body: JSON.stringify({ providerId, apiKey, baseUrl }),
      }),
    setRoutingMode: (mode: string) =>
      fetchApi<{ success: boolean; mode: string }>('/ai/routing-mode', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }),
    getMetrics: () => fetchApi<ProvidersResponse['metrics']>('/ai/metrics'),
  },
};
