import { create } from 'zustand'
import type { Project } from '@/types'

interface ProjectStore {
  projects: Project[]
  activeProject: Project | null
  setProjects: (projects: Project[]) => void
  setActiveProject: (project: Project | null) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  addProject: (project: Project) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  activeProject: null,

  setProjects: (projects) => set({ projects }),

  setActiveProject: (project) => set({ activeProject: project }),

  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      activeProject:
        state.activeProject?.id === id
          ? { ...state.activeProject, ...updates }
          : state.activeProject,
    })),

  addProject: (project) =>
    set((state) => ({
      projects: [project, ...state.projects],
      activeProject: project,
    })),
}))
