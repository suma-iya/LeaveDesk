import { useMemo, useState } from 'react'
import { CalendarDays, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/Button'
import { DataTable } from '@/components/DataTable'
import type { FilterDef } from '@/components/Filters'
import { PageHeader } from '@/components/PageHeader'
import { useDebounced } from '@/lib/useDebounced'
import { useIsMobile } from '@/lib/useIsMobile'
import type { Status } from '@/types'
import { employeeColumns } from './columns'
import { useMyRequests } from './hooks'
import { RequestCard } from './RequestCard'
import { useYearTypeFilters } from './useYearTypeFilters'

const DECIDED = 'decided'

export function HistoryPage() {
  const isMobile = useIsMobile()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(DECIDED)
  const yearType = useYearTypeFilters()
  const search = useDebounced(q)

  const statuses: Status[] = status === DECIDED ? ['approved', 'rejected'] : [status as Status]
  const rows = useMyRequests({ status: statuses, type: yearType.type, year: yearType.year, q: search || undefined })

  const filters: FilterDef[] = [
    { kind: 'search', id: 'q', placeholder: 'Search notes', value: q, onChange: setQ },
    { kind: 'select', id: 'status', label: 'Status', value: status, defaultValue: DECIDED, onChange: setStatus,
      options: [{ value: DECIDED, label: 'Approved + rejected' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] },
    ...yearType.filters,
  ]
  const reset = () => { setQ(''); setStatus(DECIDED); yearType.reset() }
  const isFiltered = q !== '' || status !== DECIDED || yearType.isFiltered

  const columns = useMemo(() => {
    const c = employeeColumns('history')
    return [c.type, c.dates, c.days, c.submitted, c.status, c.decidedBy, c.note, c.view]
  }, [])

  return (
    <>
      <PageHeader
        title="History"
        subtitle="Requests that have been approved or rejected. Approved days are already taken off your balance."
        actions={(
          <>
            <Button icon={CalendarDays} label="Team calendar" to="/calendar" />
            <Button icon={Plus} label="Request leave" variant="primary" to="/me/request/new" />
          </>
        )}
      />
      <DataTable
        title={isMobile ? 'Decided requests' : undefined}
        filters={filters}
        onReset={reset}
        columns={columns}
        data={rows.data}
        isLoading={rows.isPending}
        error={rows.error}
        onRetry={() => rows.refetch()}
        getRowId={(row) => row.request.id}
        emptyMessage={isFiltered ? 'No requests match these filters' : 'No decided requests yet'}
        emptyAction={isFiltered ? <Button icon={RotateCcw} label="Reset filters" onClick={reset} /> : undefined}
        renderCard={(row) => <RequestCard request={row.request} from="history" />}
        initialSorting={[{ id: 'dates', desc: true }]}
      />
    </>
  )
}
