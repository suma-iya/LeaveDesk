import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api'
import { invalidateLeaveData } from '@/api/invalidate'
import { keys } from '@/api/queries'
import { fullName } from '@/lib/format'
import type { Decision, ListRequestsParams, RequestRow } from '@/types'

export function useRequestRows(params: ListRequestsParams) {
  return useQuery({
    queryKey: [...keys.requests, params],
    queryFn: () => api.listRequests(params).then((page) => page.items),
    placeholderData: (previous) => previous, // keep rows visible while filters change
  })
}

/**
 * Approve or reject one or many requests. Instead of a confirm dialog, the
 * change happens at once and a toast offers Undo for 5 seconds.
 */
export function useDecide() {
  const queryClient = useQueryClient()

  const undo = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.reopenRequest(id))),
    onSettled: () => invalidateLeaveData(queryClient),
    onSuccess: () => toast('Decision undone. The request is pending again.'),
    onError: (error) => toast.error(error.message),
  })

  return useMutation({
    mutationFn: ({ rows, decision }: { rows: RequestRow[]; decision: Decision }) =>
      rows.length === 1
        ? api.decideRequest(rows[0].request.id, decision).then((r) => [r])
        : api.bulkDecide(rows.map((r) => r.request.id), decision),
    onSuccess: (_, { rows, decision }) => {
      const verb = decision.status === 'approved' ? 'Approved' : 'Rejected'
      const who = rows.length === 1 ? `${fullName(rows[0].employee)}’s ${rows[0].request.type.toLowerCase()} leave` : `${rows.length} requests`
      toast.success(`${verb} ${who}`, {
        duration: 5000,
        action: { label: 'Undo', onClick: () => undo.mutate(rows.map((r) => r.request.id)) },
      })
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => invalidateLeaveData(queryClient),
  })
}
