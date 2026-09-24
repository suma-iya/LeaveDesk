import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { keys } from '@/api/queries'
import type { CalendarFilters } from '@/types'

export function useCalendar(month: string, filters: CalendarFilters) {
  return useQuery({
    queryKey: [...keys.calendar, month, filters],
    queryFn: () => api.getCalendar(month, filters),
    placeholderData: (previous) => previous,
  })
}
