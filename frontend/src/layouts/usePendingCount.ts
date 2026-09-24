import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { keys } from '@/api/queries'

/** Number shown in the HR "Pending" nav pill. */
export function usePendingCount(enabled: boolean) {
  return useQuery({
    queryKey: [...keys.requests, 'pending-count'],
    queryFn: () => api.listRequests({ status: 'pending', page: 1, pageSize: 1 }).then((p) => p.total),
    enabled,
  }).data
}
