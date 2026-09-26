import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { keys } from '@/api/queries'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { useUser } from '@/features/auth/AuthProvider'
import { HeaderActions } from '@/layouts/HeaderActions'
import { usePaging } from '@/lib/usePaging'
import type { LeaveRequest, RequestFilters } from '@/types'
import { HrRequestCard } from './cards'
import { decisionColumn, hrColumns } from './columns'
import { decideWithUndo, useHeldDecisions } from './decisions'
import { RejectDialog } from './RejectDialog'
import { useHrFilters } from './useHrFilters'

export function PendingPage() {
  const me = useUser()
  const client = useQueryClient()
  const { filters, params, reset, key } = useHrFilters()
  const paging = usePaging(key)
  const f: RequestFilters = { ...params, scope: 'all', status: ['pending'], page: paging.page, pageSize: paging.pageSize }
  const rows = useQuery({ queryKey: keys.requests(f), queryFn: () => api.requests.list(f), placeholderData: (p) => p })
  const allPending = useQuery({
    queryKey: keys.requests({ scope: 'all', status: ['pending'], pageSize: 1 }),
    queryFn: () => api.requests.list({ scope: 'all', status: ['pending'], pageSize: 1 }),
  })
  const held = useHeldDecisions()
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null)

  const columns = useMemo(() => {
    const c = hrColumns('pending')
    return [c.employee, c.leave, c.days, c.balance, c.status,
      decisionColumn(me.id, setRejecting, (r) => decideWithUndo(client, r, 'approved'))]
  }, [me.id, client])

  // Rows waiting out their Undo window are hidden until the decision is sent.
  const visible = rows.data?.items.filter((r) => !held.has(r.id))
  const hiddenHere = (rows.data?.items.length ?? 0) - (visible?.length ?? 0)
  const count = Math.max(0, (allPending.data?.total ?? 0) - held.size)

  return (
    <>
      <PageHeader
        title="Pending requests"
        subtitle={`${count} ${count === 1 ? 'request' : 'requests'} waiting for your decision. Your own requests go to another HR.`}
        actions={<HeaderActions exportHref={api.requests.exportUrl({ ...params, scope: 'all', status: ['pending'] })} />}
      />
      <DataTable
        filters={filters}
        onReset={reset}
        columns={columns}
        rows={visible}
        total={Math.max(0, (rows.data?.total ?? 0) - hiddenHere)}
        page={paging.page}
        pageSize={paging.pageSize}
        onPageChange={paging.setPage}
        isLoading={rows.isPending}
        error={rows.error}
        onRetry={() => rows.refetch()}
        getRowId={(r) => String(r.id)}
        emptyMessage="No pending requests."
        renderCard={(r) => (
          <HrRequestCard request={r} from="pending" own={r.employee.id === me.id}
            onReject={() => setRejecting(r)} onApprove={() => decideWithUndo(client, r, 'approved')} />
        )}
      />
      <RejectDialog request={rejecting} onCancel={() => setRejecting(null)}
        onConfirm={(note) => { if (rejecting) decideWithUndo(client, rejecting, 'rejected', note); setRejecting(null) }} />
    </>
  )
}
