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
  NvidiaDetailedHealth,
  PathValidationResult,
  ProjectAnalysis,
  AutonomyLevel,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const BASE_URL = `${API_BASE}/api`;

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    // The server rejects a request that declares a JSON body but sends none (cancel, rollback, analyze…),
    // so the header only goes out when there is a body.
    headers: { ...(options.body !== undefined && options.body !== null ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (!response.ok) {
    let errorText = '';
    try {
      const errJson = await response.json();
      errorText = errJson.error || errJson.message || JSON.stringify(errJson);
    } catch {
      errorText = await response.text();
    }
    throw new Error(errorText || response.statusText);
  }
  return response.json();
}

export const api = {
  projects: {
    list: () => fetchApi<Project[]>('/projects'),
    defaults: () =>
      fetchApi<{ appRoot: string; workspaceRoot: string; homeDir: string; separator: string; platform: string }>('/projects/defaults'),
    get: (id: string) => fetchApi<Project>(`/projects/${id}`),
    create: async (path: string, name?: string): Promise<{ project: Project; analysis?: ProjectAnalysis }> => {
      const res = await fetchApi<any>('/projects', { method: 'POST', body: JSON.stringify({ path, name }) });
      if (res.project) return res;
      return { project: res };
    },
    validatePath: (path: string) =>
      fetchApi<PathValidationResult>('/projects/validate-path', {
        method: 'POST',
        body: JSON.stringify({ path }),
      }),
    browse: (path?: string) =>
      fetchApi<{ current: string; parent: string | null; folders: string[] }>('/projects/browse', {
        method: 'POST',
        body: JSON.stringify({ path }),
      }),
    clone: (repoUrl: string, targetPath: string, name?: string) =>
      fetchApi<{ project: Project; analysis: ProjectAnalysis }>('/projects/clone', {
        method: 'POST',
        body: JSON.stringify({ repoUrl, targetPath, name }),
      }),
    scaffold: (path: string, name?: string, template?: string) =>
      fetchApi<{ project: Project; analysis: ProjectAnalysis }>('/projects/scaffold', {
        method: 'POST',
        body: JSON.stringify({ path, name, template }),
      }),
    reveal: (path: string) =>
      fetchApi<{ success: boolean; path: string }>('/projects/reveal', {
        method: 'POST',
        body: JSON.stringify({ path }),
      }),
    update: (id: string, data: Partial<Project>) =>
      fetchApi<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<{ success: boolean; message?: string }>(`/projects/${id}`, { method: 'DELETE' }),
    analyze: (id: string) =>
      fetchApi<{ project: Project; analysis: ProjectAnalysis } | Project>(`/projects/${id}/analyze`, { method: 'POST' }),
  },
  tasks: {
    list: (projectId: string) => fetchApi<Task[]>(`/projects/${projectId}/tasks`),
    get: (id: string) => fetchApi<Task>(`/tasks/${id}`),
    create: (projectId: string, data: { command: string; mode: string; autonomy?: AutonomyLevel }) =>
      fetchApi<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    cancel: (id: string) => fetchApi<Task>(`/tasks/${id}/cancel`, { method: 'POST' }),
    getApprovals: (id: string) =>
      fetchApi<Array<{ id: string; type: string; description: string; details: Record<string, unknown> }>>(`/tasks/${id}/approvals`),
    resolveApproval: (id: string, approvalId: string, approved: boolean) =>
      fetchApi<{ success: boolean }>(`/tasks/${id}/approvals/${approvalId}`, { method: 'POST', body: JSON.stringify({ approved }) }),
    rollback: (id: string) =>
      fetchApi<{ success: boolean; restored?: string[]; skipped?: string[] }>(`/tasks/${id}/rollback`, { method: 'POST' }),
    getRollbackConflicts: (id: string) =>
      fetchApi<{ conflicts: any[] }>(`/tasks/${id}/rollback-conflicts`),
    getSteps: (id: string) => fetchApi<TaskStep[]>(`/tasks/${id}/steps`),
    getDiffs: (id: string) => fetchApi<FileDiff[]>(`/tasks/${id}/diffs`),
    approve: (id: string) => fetchApi<Task>(`/tasks/${id}/approve`, { method: 'POST' }),
  },
  files: {
    getTree: (projectId: string) => fetchApi<FileNode[]>(`/projects/${projectId}/files/tree`),
    getContent: (projectId: string, path: string) =>
      fetchApi<{ content: string }>(`/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`),
    writeContent: (projectId: string, path: string, content: string) =>
      fetchApi<{ success: boolean }>(`/projects/${projectId}/files/content`, {
        method: 'PUT',
        body: JSON.stringify({ path, content }),
      }),
    deleteFile: (projectId: string, path: string) =>
      fetchApi<{ success: boolean }>(`/projects/${projectId}/files?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      }),
  },
  git: {
    getStatus: (projectId: string) => fetchApi<GitStatus>(`/projects/${projectId}/git/status`),
    getDiff: (projectId: string) => fetchApi<{ diff: string }>(`/projects/${projectId}/git/diff`),
    commit: (projectId: string, message: string) =>
      fetchApi<{ success: boolean }>(`/projects/${projectId}/git/commit`, { method: 'POST', body: JSON.stringify({ message }) }),
  },
  settings: {
    get: () => fetchApi<AppSettings>('/settings'),
    update: (data: Partial<AppSettings>) => fetchApi<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
  ai: {
    getProviders: () => fetchApi<ProvidersResponse>('/ai/providers'),
    getModels: () => fetchApi<{ models: ModelInfo[] }>('/ai/models'),
    getNvidiaModels: () => fetchApi<{ models: ModelInfo[] }>('/ai/nvidia/models'),
    test: (providerId: string, apiKey?: string, baseUrl?: string, model?: string) =>
      fetchApi<{ success: boolean; health: HealthStatus; detailedHealth?: NvidiaDetailedHealth }>('/ai/test', {
        method: 'POST',
        body: JSON.stringify({ providerId, apiKey, baseUrl, model }),
      }),
    setRoutingMode: (mode: string) =>
      fetchApi<{ success: boolean; mode: string }>('/ai/routing-mode', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }),
    getMetrics: () => fetchApi<ProvidersResponse['metrics']>('/ai/metrics'),
  },
};
