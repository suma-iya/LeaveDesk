import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { keys } from '@/api/queries'

/** Counts behind the rail's amber dots (HR only). */
export function useNewItems(enabled: boolean) {
  const pending = useQuery({
    queryKey: keys.requests({ scope: 'all', status: ['pending'], pageSize: 1 }),
    queryFn: () => api.requests.list({ scope: 'all', status: ['pending'], pageSize: 1 }),
    enabled,
  })
  const registrations = useQuery({ queryKey: keys.registrations, queryFn: api.hr.registrations, enabled })
  return {
    pendingRequests: (pending.data?.total ?? 0) > 0,
    registrations: (registrations.data?.length ?? 0) > 0,
  }
}
