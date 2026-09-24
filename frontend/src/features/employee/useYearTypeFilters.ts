import { useState } from 'react'
import type { FilterDef } from '@/components/Filters'
import { ALL, optionsFrom } from '@/lib/filters'
import { LEAVE_TYPES } from '@/lib/leave'

const thisYear = new Date().getFullYear()
export const YEAR_OPTIONS = [thisYear + 1, thisYear, thisYear - 1].map((y) => ({ value: String(y), label: String(y) }))

/** Leave type + Year selects shared by My leave and History. */
export function useYearTypeFilters() {
  const [type, setType] = useState(ALL)
  const [year, setYear] = useState(String(thisYear))
  const filters: FilterDef[] = [
    { kind: 'select', id: 'type', label: 'Leave type', value: type, defaultValue: ALL, options: optionsFrom('All leave types', LEAVE_TYPES), onChange: setType },
    { kind: 'select', id: 'year', label: 'Year', value: year, defaultValue: String(thisYear), options: YEAR_OPTIONS, onChange: setYear },
  ]
  return {
    filters,
    type: type === ALL ? undefined : (type as (typeof LEAVE_TYPES)[number]),
    year: Number(year),
    reset: () => { setType(ALL); setYear(String(thisYear)) },
    isFiltered: type !== ALL || year !== String(thisYear),
  }
}
