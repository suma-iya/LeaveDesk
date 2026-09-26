import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Eye, Pencil, X } from 'lucide-react'
import { IconButton } from '@/components/AppButton'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { HeaderActions } from '@/layouts/HeaderActions'
import { available, sumBalances } from '@/lib/leave'
import { useIsMobile } from '@/lib/useIsMobile'
import { usePaging } from '@/lib/usePaging'
import type { LeaveRequest } from '@/types'
import { BalanceRow, MobileBalances } from './BalanceCards'
import { CancelDialog } from './CancelDialog'
import { detailsLink, employeeColumns } from './columns'
import { useCancelRequest, useMyRequests } from './hooks'
import { RequestCard } from './RequestCard'
import { useYearTypeFilters } from './yearTypeFilters'

const col = createColumnHelper<LeaveRequest>()

export function MyLeavePage() {
  const user = useUser()
  const { balances } = useAuth() // this year's balances come with /api/me
  const isMobile = useIsMobile()
  const year = new Date().getFullYear()
  const { filters, type, year: filterYear, reset } = useYearTypeFilters()
  const paging = usePaging(`${type}-${filterYear}`)
  const pending = useMyRequests({ status: ['pending'], type, year: filterYear, page: paging.page, pageSize: paging.pageSize })
  const cancel = useCancelRequest()
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null)

  const columns = useMemo(() => {
    const c = employeeColumns('me')
    return [c.type, c.dates, c.days, c.submitted, c.status, col.display({
      id: 'actions', header: () => <span className="sr-only">Actions</span>, meta: { className: 'text-right' },
      cell: ({ row }) => (
        <span className="flex justify-end gap-1">
          <IconButton icon={Eye} label="View request" variant="ghost" to={detailsLink(row.original)} />
          <IconButton icon={Pencil} label="Edit request" variant="ghost" to={`/me/request/new?edit=${row.original.id}`} />
          <IconButton icon={X} label="Cancel request" variant="danger" onClick={() => setCancelling(row.original)} />
        </span>
      ),
    })]
  }, [])

  const free = balances ? available(sumBalances(balances)) : undefined

  return (
    <>
      <PageHeader
        title={free === undefined ? `Hi ${user.firstName}` : `Hi ${user.firstName}, you have ${free} leave ${free === 1 ? 'day' : 'days'} available`}
        actions={<HeaderActions />}
      />
      {isMobile ? <MobileBalances balances={balances} /> : <BalanceRow balances={balances} year={year} />}
      <DataTable
        title="Pending requests"
        filters={filters}
        onReset={isMobile ? reset : undefined}
        columns={columns}
        rows={pending.data?.items}
        total={pending.data?.total ?? 0}
        page={paging.page}
        pageSize={paging.pageSize}
        onPageChange={paging.setPage}
        onPageSizeChange={paging.setPageSize}
        isLoading={pending.isPending}
        error={pending.error}
        onRetry={() => pending.refetch()}
        getRowId={(r) => String(r.id)}
        emptyMessage="No pending requests."
        renderCard={(r) => <RequestCard request={r} from="me" />}
      />
      <CancelDialog request={cancelling} busy={cancel.isPending} onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id, { onSettled: () => setCancelling(null) })} />
    </>
  )
}
