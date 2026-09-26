import { useMemo, useState } from 'react'
import { DataTable } from '@/components/DataTable'
import type { FilterDef } from '@/components/Filters'
import { PageHeader } from '@/components/PageHeader'
import { HeaderActions } from '@/layouts/HeaderActions'
import { useDebounced } from '@/lib/useDebounced'
import { usePaging } from '@/lib/usePaging'
import type { Status } from '@/types'
import { employeeColumns } from './columns'
import { useMyRequests } from './hooks'
import { RequestCard } from './RequestCard'
import { useYearTypeFilters } from './yearTypeFilters'

const DECIDED = 'decided'

export function HistoryPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(DECIDED)
  const yearType = useYearTypeFilters()
  const search = useDebounced(q)
  const statuses: Status[] = status === DECIDED ? ['approved', 'rejected'] : [status as Status]
  const paging = usePaging(`${search}-${status}-${yearType.type}-${yearType.year}`)
  const rows = useMyRequests({ status: statuses, type: yearType.type, year: yearType.year, q: search || undefined, page: paging.page, pageSize: paging.pageSize })

  const filters: FilterDef[] = [
    { kind: 'search', id: 'q', placeholder: 'Search notes', value: q, onChange: setQ },
    { kind: 'select', id: 'status', label: 'Status', value: status, defaultValue: DECIDED, onChange: setStatus,
      options: [{ value: DECIDED, label: 'Approved + rejected' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] },
    ...yearType.filters,
  ]
  const columns = useMemo(() => {
    const c = employeeColumns('history')
    return [c.type, c.dates, c.days, c.submitted, c.status, c.decidedBy, c.note, c.view]
  }, [])

  return (
    <>
      <PageHeader title="History" subtitle="Requests that have been approved or rejected. Approved days are already taken off your balance."
        actions={<HeaderActions />} />
      <DataTable
        title="Decided requests"
        filters={filters}
        onReset={() => { setQ(''); setStatus(DECIDED); yearType.reset() }}
        columns={columns}
        rows={rows.data?.items}
        total={rows.data?.total ?? 0}
        page={paging.page}
        pageSize={paging.pageSize}
        onPageChange={paging.setPage}
        isLoading={rows.isPending}
        error={rows.error}
        onRetry={() => rows.refetch()}
        getRowId={(r) => String(r.id)}
        emptyMessage="No decided requests match these filters."
        renderCard={(r) => <RequestCard request={r} from="history" />}
      />
    </>
  )
}
