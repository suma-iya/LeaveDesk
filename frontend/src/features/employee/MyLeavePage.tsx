import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { CalendarDays, Eye, Pencil, Plus, X } from 'lucide-react'
import { useBalances } from '@/api/queries'
import { Button, IconButton } from '@/components/Button'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { useUser } from '@/features/auth/AuthProvider'
import { formatRange, toISODate } from '@/lib/dates'
import { available, sumBalances } from '@/lib/leave'
import { useIsMobile } from '@/lib/useIsMobile'
import type { LeaveRequest, RequestRow } from '@/types'
import { BalanceRow, MobileBalances } from './BalanceCards'
import { CancelDialog } from './CancelDialog'
import { detailsLink, employeeColumns } from './columns'
import { useCancelRequest, useMyRequests } from './hooks'
import { RequestCard } from './RequestCard'
import { useYearTypeFilters } from './useYearTypeFilters'

const col = createColumnHelper<RequestRow>()

export function MyLeavePage() {
  const user = useUser()
  const isMobile = useIsMobile()
  const year = new Date().getFullYear()
  const balances = useBalances(user.id, year)
  const { filters, type, year: filterYear, reset, isFiltered } = useYearTypeFilters()
  const pending = useMyRequests({ status: 'pending', type, year: filterYear })
  const upcoming = useMyRequests({ status: ['pending', 'approved'], from: toISODate(new Date()) })
  const cancel = useCancelRequest()
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null)

  const columns = useMemo(() => {
    const c = employeeColumns('me')
    return [c.type, c.dates, c.days, c.submitted, c.status, col.display({
      id: 'actions', header: () => <span className="sr-only">Actions</span>, meta: { className: 'text-right' },
      cell: ({ row }) => (
        <span className="flex justify-end gap-1.5">
          <IconButton icon={Eye} label="View request" variant="ghost" to={detailsLink(row.original)} />
          <IconButton icon={Pencil} label="Edit request" variant="ghost" to={`/me/request/new?edit=${row.original.request.id}`} />
          <IconButton icon={X} label="Cancel request" variant="danger" onClick={() => setCancelling(row.original.request)} />
        </span>
      ),
    })]
  }, [])

  const free = balances.data ? available(sumBalances(balances.data)) : undefined
  const next = upcoming.data?.map((r) => r.request).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  return (
    <>
      <PageHeader
        title={free === undefined ? `Hi ${user.firstName}` : `Hi ${user.firstName}, you have ${free} leave ${free === 1 ? 'day' : 'days'} available`}
        subtitle={next ? (
          <>Next leave: <strong className="font-semibold text-foreground">{formatRange(next.startDate, next.endDate)}</strong>,{' '}
            {next.status === 'pending' ? 'waiting for HR approval.' : 'approved.'}</>
        ) : 'No upcoming leave.'}
        actions={!isMobile && (
          <>
            <Button icon={CalendarDays} label="Team calendar" to="/calendar" />
            <Button icon={Plus} label="Request leave" variant="primary" to="/me/request/new" />
          </>
        )}
      />

      {isMobile ? (
        <>
          <MobileBalances balances={balances.data} />
          <Button icon={Plus} label="Request leave" variant="primary" size="sticky" to="/me/request/new" />
        </>
      ) : <BalanceRow balances={balances.data} year={year} />}

      <DataTable
        title="Pending requests"
        filters={filters}
        onReset={isMobile ? reset : undefined}
        columns={columns}
        data={pending.data}
        isLoading={pending.isPending}
        error={pending.error}
        onRetry={() => pending.refetch()}
        getRowId={(row) => row.request.id}
        emptyMessage={isFiltered ? 'No pending requests match these filters' : 'No pending requests'}
        emptyAction={<Button icon={Plus} label="Request leave" to="/me/request/new" />}
        renderCard={(row) => <RequestCard request={row.request} from="me" />}
        initialSorting={[{ id: 'dates', desc: false }]}
      />

      <CancelDialog
        request={cancelling}
        busy={cancel.isPending}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id, { onSettled: () => setCancelling(null) })}
      />
    </>
  )
}
