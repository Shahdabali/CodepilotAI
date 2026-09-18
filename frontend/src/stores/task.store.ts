import { create } from 'zustand'
import type { Task, TaskStep, AgentEvent, AgentStage, TaskStatus } from '@/types'

interface TaskStore {
  tasks: Task[]
  activeTask: Task | null
  agentEvents: AgentEvent[]
  taskSteps: TaskStep[]
  setTasks: (tasks: Task[]) => void
  setActiveTask: (task: Task | null) => void
  addAgentEvent: (event: AgentEvent) => void
  clearAgentEvents: () => void
  setTaskSteps: (steps: TaskStep[]) => void
  updateTaskStatus: (id: string, status: TaskStatus, stage?: AgentStage) => void
  addTask: (task: Task) => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  activeTask: null,
  agentEvents: [],
  taskSteps: [],

  setTasks: (tasks) => set({ tasks }),

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
    set((state) => ({
      agentEvents: [...state.agentEvents, event].slice(-500), // cap at 500 events
    })),

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
}))
