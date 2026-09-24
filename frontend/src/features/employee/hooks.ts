import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api'
import { invalidateLeaveData } from '@/api/invalidate'
import { keys } from '@/api/queries'
import type { ListRequestsParams, RequestInput } from '@/types'

/** The signed-in employee's own requests. */
export function useMyRequests(params: Omit<ListRequestsParams, 'mine'> = {}) {
  return useQuery({
    queryKey: [...keys.requests, 'mine', params],
    queryFn: () => api.listRequests({ ...params, mine: true }).then((page) => page.items),
    placeholderData: (previous) => previous,
  })
}

export function useCancelRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.cancelRequest(id),
    onSuccess: () => toast.success('Request cancelled'),
    onError: (error) => toast.error(error.message),
    onSettled: () => invalidateLeaveData(queryClient),
  })
}

/** Create a request, or update it when `editId` is given. */
export function useSaveRequest(editId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RequestInput) => (editId ? api.updateRequest(editId, input) : api.createRequest(input)),
    onSuccess: () => toast.success(editId ? 'Request updated' : 'Leave request submitted'),
    onSettled: () => invalidateLeaveData(queryClient),
  })
}

export function useUploadAttachment() {
  return useMutation({ mutationFn: (file: File) => api.uploadAttachment(file) })
}
