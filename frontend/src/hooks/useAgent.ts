import { useEffect } from 'react'
import { subscribeToTask } from '@/lib/sse'
import { useTaskStore } from '@/stores/task.store'
import type { AgentEvent } from '@/types'

export function useAgentSSE(taskId: string | null) {
  const { addAgentEvent, updateTaskStatus } = useTaskStore()

  useEffect(() => {
    if (!taskId) return
    const unsubscribe = subscribeToTask(taskId, (event: AgentEvent) => {
      addAgentEvent(event)
      if (event.type === 'stage_change') {
        updateTaskStatus(taskId, 'RUNNING', event.stage)
      }
      if (event.type === 'complete') {
        updateTaskStatus(taskId, 'COMPLETED', 'COMPLETE')
      }
      if (event.type === 'error') {
        updateTaskStatus(taskId, 'FAILED', 'FAILED')
      }
    })
    return unsubscribe
  }, [taskId, addAgentEvent, updateTaskStatus])
}
