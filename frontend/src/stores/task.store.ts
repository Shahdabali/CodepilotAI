import { create } from 'zustand'
import type { Task, TaskStep, AgentEvent, AgentEventType, AgentStage, TaskStatus } from '@/types'

interface TaskStore {
  tasks: Task[]
  activeTask: Task | null
  agentEvents: AgentEvent[]
  taskSteps: TaskStep[]
  /** True once the task list for the active project has been fetched (so the UI can tell "loading" from "empty"). */
  tasksLoaded: boolean
  setTasks: (tasks: Task[]) => void
  setTasksLoaded: (loaded: boolean) => void
  setActiveTask: (task: Task | null) => void
  addAgentEvent: (event: AgentEvent) => void
  setAgentEvents: (events: AgentEvent[]) => void
  clearAgentEvents: () => void
  setTaskSteps: (steps: TaskStep[]) => void
  updateTaskStatus: (id: string, status: TaskStatus, stage?: AgentStage) => void
  patchTask: (id: string, patch: Partial<Task>) => void
  addTask: (task: Task) => void
}

const sameEvent = (a: AgentEvent, b: AgentEvent) => a.timestamp === b.timestamp && a.type === b.type && a.message === b.message

/**
 * Persisted steps carry the canonical event type in `data.eventType`; this rebuilds the event stream a
 * finished task produced, so its history looks the same as when it ran live.
 */
export function stepsToEvents(steps: TaskStep[]): AgentEvent[] {
  return steps.map((s) => {
    const data = { ...(s.data ?? {}) } as Record<string, unknown>
    const type = (typeof data.eventType === 'string' ? data.eventType : s.status === 'failed' ? 'error' : 'log') as AgentEventType
    delete data.eventType
    return { type, taskId: s.taskId, stage: s.stage, message: s.message, data, timestamp: s.createdAt }
  })
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  activeTask: null,
  agentEvents: [],
  taskSteps: [],
  tasksLoaded: false,

  setTasks: (tasks) => set({ tasks, tasksLoaded: true }),
  setTasksLoaded: (tasksLoaded) => set({ tasksLoaded }),

  setActiveTask: (task) =>
    set({ activeTask: task, agentEvents: [], taskSteps: [] }),

  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
      activeTask: task,
      agentEvents: [],
      taskSteps: [],
    })),

  addAgentEvent: (event) =>
    set((state) => {
      // An SSE reconnect replays the run from the start; drop what we already have.
      if (state.agentEvents.some((e) => sameEvent(e, event))) return state
      return { agentEvents: [...state.agentEvents, event].slice(-500) } // cap at 500 events
    }),

  setAgentEvents: (agentEvents) => set({ agentEvents: agentEvents.slice(-500) }),

  clearAgentEvents: () => set({ agentEvents: [] }),

  setTaskSteps: (steps) => set({ taskSteps: steps }),

  updateTaskStatus: (id, status, stage) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, status, currentStage: stage ?? t.currentStage } : t
      ),
      activeTask:
        state.activeTask?.id === id
          ? { ...state.activeTask, status, currentStage: stage ?? state.activeTask.currentStage }
          : state.activeTask,
    })),

  patchTask: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      activeTask: state.activeTask?.id === id ? { ...state.activeTask, ...patch } : state.activeTask,
    })),
}))
