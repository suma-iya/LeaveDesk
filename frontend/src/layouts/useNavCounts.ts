import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { keys } from '@/api/queries'
import type { RequestFilters, Role } from '@/types'
import type { NavCount } from './nav'

// Each list page's default filters, asking for one row: only the total is
// used. The query keys sit under the same prefixes as the pages', so every
// change that refreshes a list (approve, reject, create, cancel, HR edits)
// refreshes its count too.
const hrLists: Record<'pendingRequests' | 'approvedRequests' | 'allRequests', RequestFilters> = {
  pendingRequests: { scope: 'all', status: ['pending'], pageSize: 1 },
  approvedRequests: { scope: 'all', status: ['approved'], pageSize: 1 },
  allRequests: { scope: 'all', pageSize: 1 },
}
const history: RequestFilters = { scope: 'mine', status: ['approved', 'rejected'], year: new Date().getFullYear(), pageSize: 1 }
const people = { page: 1, pageSize: 1 }

const useTotal = (filters: RequestFilters, enabled: boolean) =>
  useQuery({ queryKey: keys.requests(filters), queryFn: () => api.requests.list(filters), enabled }).data?.total ?? 0

/** The count shown on each nav item (0 hides it). */
export function useNavCounts(role: Role): Record<NavCount, number> {
  const hr = role === 'hr'
  return {
    pendingRequests: useTotal(hrLists.pendingRequests, hr),
    approvedRequests: useTotal(hrLists.approvedRequests, hr),
    allRequests: useTotal(hrLists.allRequests, hr),
    people: useQuery({ queryKey: [...keys.employees, people], queryFn: () => api.hr.employees(people), enabled: hr }).data?.total ?? 0,
    history: useTotal(history, !hr),
  }
}
