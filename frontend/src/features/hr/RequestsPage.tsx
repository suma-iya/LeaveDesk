import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { api } from '@/api'
import { keys } from '@/api/queries'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { HeaderActions } from '@/layouts/HeaderActions'
import { usePaging } from '@/lib/usePaging'
import { cn } from '@/lib/utils'
import type { RequestFilters } from '@/types'
import { HrRequestCard } from './cards'
import { hrColumns, type HrList } from './columns'
import { useHrFilters } from './useHrFilters'

/** /hr/requests?status=approved (Approved) or ?status=all (All, with a "Mine" chip). */
export function RequestsPage() {
  const [params, setParams] = useSearchParams()
  const list: HrList = params.get('status') === 'approved' ? 'approved' : 'all'
  const mine = list === 'all' && params.get('mine') === '1'
  const hr = useHrFilters({ withStatus: list === 'all' })
  const paging = usePaging(`${list}-${mine}-${hr.key}`)

  const f: RequestFilters = {
    ...hr.params,
    scope: mine ? 'mine' : 'all',
    status: list === 'approved' ? ['approved'] : hr.params.status,
    page: paging.page,
    pageSize: paging.pageSize,
  }
  const rows = useQuery({ queryKey: keys.requests(f), queryFn: () => api.requests.list(f), placeholderData: (p) => p })

  const columns = useMemo(() => {
    const c = hrColumns(list)
    return [c.employee, c.leave, c.days, c.balance, c.status, c.decidedBy, c.view]
  }, [list])

  const toggleMine = () => {
    const next = new URLSearchParams(params)
    if (mine) next.delete('mine')
    else next.set('mine', '1')
    setParams(next, { replace: true })
  }

  return (
    <>
      <PageHeader
        title={list === 'approved' ? 'Approved' : 'All requests'}
        subtitle={list === 'approved' ? 'Approved leave. These days are already taken off each person’s balance.' : 'Every leave request in any status.'}
        actions={<HeaderActions exportHref={api.requests.exportUrl({ ...f })} />}
      />
      {list === 'all' && (
        <div>
          <button type="button" aria-pressed={mine} onClick={toggleMine}
            className={cn('inline-flex h-8 items-center max-md:h-11 gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              mine ? 'border-highlight bg-highlight-soft text-foreground' : 'bg-surface text-muted-foreground hover:text-foreground')}>
            {mine && <Check className="size-3.5" aria-hidden />}Mine
          </button>
        </div>
      )}
      <DataTable
        filters={hr.filters}
        onReset={hr.reset}
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
        emptyMessage={mine ? 'You have no leave requests.' : 'No requests match these filters.'}
        renderCard={(r) => <HrRequestCard request={r} from={list} />}
      />
    </>
  )
}
