import { useState } from 'react'
import { useDepartments } from '@/api/queries'
import type { FilterDef } from '@/components/Filters'
import { ALL, optionsFrom } from '@/lib/filters'
import { LEAVE_TYPES, TYPE_LABEL } from '@/lib/leave'
import { useDebounced } from '@/lib/useDebounced'
import type { LeaveType, RequestFilters, Status } from '@/types'

/** Search employee · Department · Leave type (· Status) for HR tables. */
export function useHrFilters({ withStatus = false } = {}) {
  const departments = useDepartments().data ?? []
  const [q, setQ] = useState('')
  const [department, setDepartment] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const search = useDebounced(q)

  const filters: FilterDef[] = [
    { kind: 'search', id: 'q', placeholder: 'Search employee', value: q, onChange: setQ },
    { kind: 'select', id: 'department', label: 'Department', value: department, defaultValue: ALL,
      options: optionsFrom('All departments', departments.map((d) => ({ value: String(d.id), label: d.name }))), onChange: setDepartment },
    { kind: 'select', id: 'type', label: 'Leave type', value: type, defaultValue: ALL,
      options: optionsFrom('All leave types', LEAVE_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))), onChange: setType },
  ]
  if (withStatus) {
    filters.push({ kind: 'select', id: 'status', label: 'Status', value: status, defaultValue: ALL, onChange: setStatus,
      options: optionsFrom('All statuses', (['pending', 'approved', 'rejected', 'cancelled'] as Status[]).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))) })
  }

  const params: RequestFilters = {
    q: search || undefined,
    department: department === ALL ? undefined : Number(department),
    type: type === ALL ? undefined : (type as LeaveType),
    status: status === ALL ? undefined : [status as Status],
  }
  const reset = () => { setQ(''); setDepartment(ALL); setType(ALL); setStatus(ALL) }
  return { filters, params, reset, key: JSON.stringify(params) }
}
