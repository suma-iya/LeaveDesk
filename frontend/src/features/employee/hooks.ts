import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys, refreshLeaveData } from '@/api/queries'
import type { Draft, RequestFilters } from '@/types'

/** One page of the signed-in user's own requests. */
export function useMyRequests(filters: Omit<RequestFilters, 'scope'>, enabled = true) {
  const f: RequestFilters = { ...filters, scope: 'mine' }
  return useQuery({
    queryKey: keys.requests(f),
    queryFn: () => api.requests.list(f),
    placeholderData: (previous) => previous, // keep rows visible while paging
    enabled,
  })
}

export function useCancelRequest() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.requests.cancel(id),
    onSuccess: (r) => toast.success(`${r.code} cancelled`),
    onError: (error) => toast.error(error.message),
    onSettled: () => refreshLeaveData(client),
  })
}

/** Create a request, or update it when editId is set. */
export function useSaveRequest(editId?: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (draft: Draft) => (editId ? api.requests.update(editId, draft) : api.requests.create(draft)),
    onSuccess: (r) => toast.success(editId ? `${r.code} updated` : `Leave request ${r.code} submitted`),
    onSettled: () => refreshLeaveData(client),
  })
}
