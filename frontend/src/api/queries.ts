import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { RequestFilters } from '@/types'

/** Query keys in one place, so mutations know what to refresh. */
export const keys = {
  me: ['me'] as const,
  bootstrap: ['bootstrap'] as const,
  googlePending: ['google-pending'] as const,
  departments: ['departments'] as const,
  requests: (f?: RequestFilters) => (f ? (['requests', f] as const) : (['requests'] as const)),
  request: (id: string | number) => ['request', String(id)] as const,
  overlaps: (id: string | number) => ['overlaps', String(id)] as const,
  balances: (year: number) => ['balances', year] as const,
  calendar: ['calendar'] as const,
  employees: ['employees'] as const,
  employee: (id: string) => ['employee', id] as const,
}

export const useDepartments = () =>
  useQuery({ queryKey: keys.departments, queryFn: api.hr.departments, staleTime: 5 * 60_000 })

export const useMyBalances = (year: number) =>
  useQuery({ queryKey: keys.balances(year), queryFn: () => api.me.balances(year) })

export const useRequestDetail = (id: string | number | undefined) =>
  useQuery({ queryKey: keys.request(id ?? ''), queryFn: () => api.requests.get(id!), enabled: Boolean(id) })

/** After any change to leave data, refetch every view that shows it. */
export function refreshLeaveData(client: QueryClient) {
  return Promise.all(
    [['requests'], ['request'], ['overlaps'], ['balances'], ['calendar'], keys.me, keys.employees, ['employee']].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  )
}
