import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'

/** Query keys in one place so mutations can invalidate the right caches. */
export const keys = {
  me: ['me'] as const,
  policy: ['policy'] as const,
  departments: ['departments'] as const,
  requests: ['requests'] as const, // prefix for every list
  request: (id: string) => ['request', id] as const,
  balances: (employeeId: string, year: number) => ['balances', employeeId, year] as const,
  calendar: ['calendar'] as const,
  profile: ['profile'] as const,
}

export const usePolicy = () => useQuery({ queryKey: keys.policy, queryFn: api.getPolicy, staleTime: Infinity })

export const useDepartments = () => useQuery({ queryKey: keys.departments, queryFn: api.listDepartments, staleTime: Infinity })

export const useBalances = (employeeId: string | undefined, year: number) =>
  useQuery({
    queryKey: keys.balances(employeeId ?? '', year),
    queryFn: () => api.getBalances(employeeId!, year),
    enabled: Boolean(employeeId),
  })

export const useRequestDetail = (id: string | undefined) =>
  useQuery({ queryKey: keys.request(id ?? ''), queryFn: () => api.getRequest(id!), enabled: Boolean(id) })
