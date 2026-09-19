import { useEffect } from 'react'
import { subscribeToTask } from '@/lib/sse'
import { api } from '@/lib/api'
import { useTaskStore } from '@/stores/task.store'
import { useUIStore } from '@/stores/ui.store'
import { toast } from '@/components/ui/toast'
import type { AgentEvent } from '@/types'

/**
 * Streams a running task's events into the task store. Only live tasks subscribe — finished tasks are
 * rebuilt from their persisted steps instead — and the subscription ends itself once the task does.
 */
export function useAgentSSE(taskId: string | null, live: boolean) {
  const addAgentEvent = useTaskStore((s) => s.addAgentEvent)
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus)
  const patchTask = useTaskStore((s) => s.patchTask)

  useEffect(() => {
    if (!taskId || !live) return

    const syncFinalState = async () => {
      try {
        patchTask(taskId, await api.tasks.get(taskId))
      } catch {
        /* the event itself already told the UI the outcome */
      }
    }

    const unsubscribe = subscribeToTask(taskId, (raw: AgentEvent) => {
      if ((raw.type as string) === 'CONNECTED') return
      addAgentEvent(raw)

      switch (raw.type) {
        case 'stage_change':
          updateTaskStatus(taskId, 'RUNNING', raw.stage)
          break
        case 'complete': {
          updateTaskStatus(taskId, 'COMPLETED', 'COMPLETE')
          void syncFinalState()
          const { currentView } = useUIStore.getState()
          if (currentView !== 'task') {
            toast.success('Task finished', raw.message?.slice(0, 120), {
              action: { label: 'View', onClick: () => useUIStore.getState().setCurrentView('task') },
            })
          }
          break
        }
        case 'error':
          updateTaskStatus(taskId, 'FAILED', 'FAILED')
          void syncFinalState()
          if (useUIStore.getState().currentView !== 'task') toast.error('Task failed', raw.message?.slice(0, 160))
          break
        case 'cancelled':
          updateTaskStatus(taskId, 'CANCELLED', 'FAILED')
          void syncFinalState()
          break
        case 'approval_required':
          if (useUIStore.getState().currentView !== 'task') {
            toast.warning('CodePilot needs your approval', raw.message, {
              action: { label: 'Review', onClick: () => useUIStore.getState().setCurrentView('task') },
              duration: 0,
            })
          }
          break
      }
    })
    return unsubscribe
  }, [taskId, live, addAgentEvent, updateTaskStatus, patchTask])
}
