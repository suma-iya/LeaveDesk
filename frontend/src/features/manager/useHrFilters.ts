import { useState } from 'react'
import type { FilterDef } from '@/components/Filters'
import { useDepartments } from '@/api/queries'
import { DATE_RANGE_OPTIONS, dateRange } from '@/lib/dateRanges'
import { ALL, optionsFrom } from '@/lib/filters'
import { LEAVE_TYPES } from '@/lib/leave'
import { useDebounced } from '@/lib/useDebounced'
import type { LeaveType, ListRequestsParams, Status } from '@/types'

interface Options {
  defaultRange?: string
  withStatus?: boolean
  withYear?: boolean
}

const thisYear = new Date().getFullYear()
const YEARS = [thisYear + 1, thisYear, thisYear - 1].map(String)

/** Filter state + FilterDefs for the HR tables, turned into API params. */
export function useHrFilters({ defaultRange = ALL, withStatus = false, withYear = false }: Options = {}) {
  const departments = useDepartments().data ?? []
  const [q, setQ] = useState('')
  const [department, setDepartment] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [range, setRange] = useState(defaultRange)
  const [status, setStatus] = useState(ALL)
  const [year, setYear] = useState(String(thisYear))
  const search = useDebounced(q)

  const filters: FilterDef[] = [
    { kind: 'search', id: 'q', placeholder: 'Search employee', value: q, onChange: setQ },
    { kind: 'select', id: 'department', label: 'Department', value: department, defaultValue: ALL,
      options: optionsFrom('All departments', departments), onChange: setDepartment },
    { kind: 'select', id: 'type', label: 'Leave type', value: type, defaultValue: ALL,
      options: optionsFrom('All leave types', LEAVE_TYPES), onChange: setType },
  ]
  if (withYear) {
    filters.push({ kind: 'select', id: 'year', label: 'Year', value: year, defaultValue: String(thisYear),
      options: YEARS.map((y) => ({ value: y, label: y })), onChange: setYear })
  } else {
    filters.push({ kind: 'select', id: 'range', label: 'Date range', value: range, defaultValue: defaultRange,
      options: DATE_RANGE_OPTIONS, onChange: setRange })
  }
  if (withStatus) {
    filters.push({ kind: 'select', id: 'status', label: 'Status', value: status, defaultValue: ALL,
      options: [{ value: ALL, label: 'All statuses' }, { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }], onChange: setStatus })
  }

  const params: ListRequestsParams = {
    q: search || undefined,
    department: department === ALL ? undefined : department,
    type: type === ALL ? undefined : (type as LeaveType),
    status: status === ALL ? undefined : (status as Status),
    year: withYear ? Number(year) : undefined,
    ...(withYear ? {} : dateRange(range)),
  }

  const reset = () => {
    setQ(''); setDepartment(ALL); setType(ALL); setRange(defaultRange); setStatus(ALL); setYear(String(thisYear))
  }
  const isFiltered = q !== '' || department !== ALL || type !== ALL || range !== defaultRange || status !== ALL || year !== String(thisYear)

  return { filters, params, reset, isFiltered }
}
