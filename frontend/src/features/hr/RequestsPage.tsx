import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { keys } from '@/api/queries'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { HeaderActions } from '@/layouts/HeaderActions'
import { usePaging } from '@/lib/usePaging'
import type { RequestFilters } from '@/types'
import { HrRequestCard } from './cards'
import { hrColumns, type HrList } from './columns'
import { useHrFilters } from './useHrFilters'

/** /hr/requests?status=approved (Approved) or ?status=all (All). */
export function RequestsPage() {
  const [params] = useSearchParams()
  const list: HrList = params.get('status') === 'approved' ? 'approved' : 'all'
  const hr = useHrFilters({ withStatus: list === 'all' })
  const paging = usePaging(`${list}-${hr.key}`)

  const f: RequestFilters = {
    ...hr.params,
    scope: 'all',
    status: list === 'approved' ? ['approved'] : hr.params.status,
    page: paging.page,
    pageSize: paging.pageSize,
  }
  const rows = useQuery({ queryKey: keys.requests(f), queryFn: () => api.requests.list(f), placeholderData: (p) => p })

  const columns = useMemo(() => {
    const c = hrColumns(list)
    return [c.employee, c.leave, c.days, c.balance, c.status, c.decidedBy, c.view]
  }, [list])


  return (
    <>
      <PageHeader
        title={list === 'approved' ? 'Approved' : 'All requests'}
        actions={<HeaderActions exportHref={api.requests.exportUrl({ ...f })} />}
      />
      <DataTable
        filters={hr.filters}
        onReset={hr.reset}
        columns={columns}
        rows={rows.data?.items}
        total={rows.data?.total ?? 0}
        page={paging.page}
        pageSize={paging.pageSize}
        onPageChange={paging.setPage}
        onPageSizeChange={paging.setPageSize}
        isLoading={rows.isPending}
        error={rows.error}
        onRetry={() => rows.refetch()}
        getRowId={(r) => String(r.id)}
        emptyMessage="No requests match these filters."
        renderCard={(r) => <HrRequestCard request={r} from={list} />}
      />
    </>
  )
}
