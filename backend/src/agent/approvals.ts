import * as queries from '../db/queries.js'
import type { AgentEvent, ApprovalRequest } from '../types/shared.js'

/**
 * Human-in-the-loop gate. A stage asks for permission (`requestApproval`), the pipeline pauses on the
 * returned promise, the UI shows an approve/deny card from the `approval_required` event, and the
 * HTTP route calls `resolveApproval`. Every path resolves — timeout and cancellation both count as a denial —
 * so a task can never hang forever on a question nobody will answer.
 */

export const APPROVAL_TIMEOUT_MS = 15 * 60 * 1000

interface Pending {
  taskId: string
  request: ApprovalRequest
  settle: (approved: boolean, reason: 'user' | 'timeout' | 'cancelled') => void
}

const pending = new Map<string, Pending>()

export interface ApprovalInput {
  taskId: string
  type: ApprovalRequest['type']
  description: string
  details?: Record<string, unknown>
  emit: (event: AgentEvent) => void
  timeoutMs?: number
}

export async function requestApproval(input: ApprovalInput): Promise<boolean> {
  const request = await queries.createApprovalRequest({
    taskId: input.taskId,
    type: input.type,
    description: input.description,
    details: input.details ?? {},
  })

  return new Promise<boolean>((resolve) => {
    let done = false
    const timer = setTimeout(() => settle(false, 'timeout'), input.timeoutMs ?? APPROVAL_TIMEOUT_MS)

    const settle: Pending['settle'] = (approved, reason) => {
      if (done) return
      done = true
      clearTimeout(timer)
      pending.delete(request.id)
      queries.resolveApprovalRequest(request.id, approved).catch(() => {})
      input.emit({
        type: 'approval_resolved',
        taskId: input.taskId,
        message:
          reason === 'timeout' ? 'No answer in time — skipped' : approved ? 'Approved' : reason === 'cancelled' ? 'Cancelled' : 'Denied',
        data: { approvalId: request.id, approved, reason },
        timestamp: new Date().toISOString(),
      })
      resolve(approved)
    }

    pending.set(request.id, { taskId: input.taskId, request, settle })

    input.emit({
      type: 'approval_required',
      taskId: input.taskId,
      message: input.description,
      data: { approvalId: request.id, kind: input.type, details: input.details ?? {} },
      timestamp: new Date().toISOString(),
    })
  })
}

/** Returns false when the approval is unknown or belongs to another task (already settled, or a stale click). */
export function resolveApproval(taskId: string, approvalId: string, approved: boolean): boolean {
  const entry = pending.get(approvalId)
  if (!entry || entry.taskId !== taskId) return false
  entry.settle(approved, 'user')
  return true
}

export function pendingApprovals(taskId: string): ApprovalRequest[] {
  return [...pending.values()].filter((p) => p.taskId === taskId).map((p) => p.request)
}

/** Deny everything still waiting for a task (used when it is cancelled). */
export function cancelApprovals(taskId: string): void {
  for (const entry of [...pending.values()]) {
    if (entry.taskId === taskId) entry.settle(false, 'cancelled')
  }
}
