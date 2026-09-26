import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { keys } from '@/api/queries'

/** HR's Pending item: how many requests are waiting for a decision. */
export function useNewItems(enabled: boolean) {
  const pending = useQuery({
    queryKey: keys.requests({ scope: 'all', status: ['pending'], pageSize: 1 }),
    queryFn: () => api.requests.list({ scope: 'all', status: ['pending'], pageSize: 1 }),
    enabled,
  })
  return { pendingRequests: pending.data?.total ?? 0 }
}
