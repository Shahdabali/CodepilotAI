import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectStore } from '@/stores/project.store'
import { useTaskStore } from '@/stores/task.store'

const ACTIVE_PROJECT_KEY = 'codepilot-active-project'

function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY) || null
  } catch {
    return null
  }
}

/**
 * Loads what the server already knows when the app starts. Without this, a reload showed "No project
 * selected", an empty recent-projects list and an empty task history even though all of it was stored.
 */
export function useBootstrap() {
  const setProjects = useProjectStore((s) => s.setProjects)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const activeProject = useProjectStore((s) => s.activeProject)
  const setTasks = useTaskStore((s) => s.setTasks)
  const restored = useRef(false)

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: api.projects.list, staleTime: 5_000 })

  // Projects → store, and re-select the one that was open last time.
  useEffect(() => {
    if (!projectsQuery.data) return
    const list = projectsQuery.data
    setProjects(list)
    if (!restored.current) {
      restored.current = true
      const id = readActiveId()
      const found = id ? list.find((p) => p.id === id) : undefined
      if (found && !useProjectStore.getState().activeProject) setActiveProject(found)
    }
  }, [projectsQuery.data, setProjects, setActiveProject])

  // Remember the open project.
  useEffect(() => {
    try {
      if (activeProject) localStorage.setItem(ACTIVE_PROJECT_KEY, activeProject.id)
      else if (restored.current) localStorage.removeItem(ACTIVE_PROJECT_KEY)
    } catch {
      /* private mode — nothing to remember */
    }
  }, [activeProject])

  // Task history for the open project.
  const activeId = activeProject?.id
  const tasksQuery = useQuery({
    queryKey: ['tasks', activeId],
    queryFn: () => api.tasks.list(activeId!),
    enabled: !!activeId,
    staleTime: 5_000,
  })

  // Switching project: drop the previous project's task list (and its open task) straight away.
  useEffect(() => {
    const { activeTask } = useTaskStore.getState()
    useTaskStore.setState({
      tasks: [],
      tasksLoaded: !activeId,
      ...(activeTask && activeTask.projectId !== activeId ? { activeTask: null, agentEvents: [], taskSteps: [] } : {}),
    })
  }, [activeId])

  useEffect(() => {
    if (!tasksQuery.data || !activeId) return
    // The server is the source of truth; keep only tasks created locally that its list hasn't caught up with.
    const local = useTaskStore.getState().tasks.filter((t) => t.projectId === activeId && !tasksQuery.data.some((s) => s.id === t.id))
    setTasks([...local, ...tasksQuery.data])
  }, [tasksQuery.data, activeId, setTasks])

  return { projectsLoading: projectsQuery.isLoading, projectsError: projectsQuery.error as Error | null, refetchProjects: projectsQuery.refetch }
}
