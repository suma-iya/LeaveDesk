import { useMemo, useState } from 'react'
import type { RowSelectionState } from '@tanstack/react-table'
import { Check, Download, RotateCcw, X } from 'lucide-react'
import { usePendingCount } from '@/layouts/usePendingCount'
import { Button } from '@/components/Button'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { fullName } from '@/lib/format'
import type { RequestRow } from '@/types'
import { PendingCard } from './cards'
import { decisionColumn, hrColumns } from './columns'
import { exportRequests } from './exportCsv'
import { useDecide, useRequestRows } from './hooks'
import { RejectDialog } from './RejectDialog'
import { useHrFilters } from './useHrFilters'

export function PendingPage() {
  const { filters, params, reset, isFiltered } = useHrFilters({ defaultRange: 'next30' })
  const rows = useRequestRows({ ...params, status: 'pending' })
  const total = usePendingCount(true)
  const decide = useDecide()
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [rejecting, setRejecting] = useState<RequestRow[]>([])

  const selected = (rows.data ?? []).filter((row) => selection[row.request.id])

  const approve = (targets: RequestRow[]) =>
    decide.mutate({ rows: targets, decision: { status: 'approved' } }, { onSuccess: () => setSelection({}) })
  const reject = (note: string) => {
    decide.mutate({ rows: rejecting, decision: { status: 'rejected', note } }, { onSuccess: () => setSelection({}) })
    setRejecting([])
  }

  const columns = useMemo(() => {
    const c = hrColumns('pending')
    return [c.employee, c.type, c.dates, c.days, c.balance, c.submitted, c.status,
      decisionColumn((row) => setRejecting([row]), (row) => approve([row]), decide.isPending)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decide.isPending])

  const count = total ?? 0
  return (
    <>
      <PageHeader
        title="Pending requests"
        subtitle={`${count} leave ${count === 1 ? 'application' : 'applications'} waiting for a decision. Select an employee to open the full application.`}
        actions={<Button icon={Download} label="Export CSV" disabled={!rows.data?.length}
          onClick={() => exportRequests('pending-requests.csv', rows.data ?? [])} />}
      />
      <DataTable
        filters={filters}
        onReset={reset}
        columns={columns}
        data={rows.data}
        isLoading={rows.isPending}
        error={rows.error}
        onRetry={() => rows.refetch()}
        getRowId={(row) => row.request.id}
        emptyMessage={isFiltered ? 'No pending requests match these filters' : 'No pending requests'}
        emptyAction={isFiltered ? <Button icon={RotateCcw} label="Reset filters" onClick={reset} /> : undefined}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        bulkBar={selected.length > 0 && (
          <>
            <p className="mr-auto min-w-0 truncate text-[13.5px]">
              <strong className="font-semibold">{selected.length} selected</strong>
              <span className="text-muted-foreground"> · {selected.map((r) => fullName(r.employee)).join(', ')}</span>
            </p>
            <Button icon={X} label="Clear" variant="ghost" onClick={() => setSelection({})} />
            <Button icon={X} label={`Reject ${selected.length}`} variant="danger" disabled={decide.isPending} onClick={() => setRejecting(selected)} />
            <Button icon={Check} label={`Approve ${selected.length}`} variant="ok" loading={decide.isPending} onClick={() => approve(selected)} />
          </>
        )}
        renderCard={(row) => (
          <PendingCard row={row} busy={decide.isPending} onReject={() => setRejecting([row])} onApprove={() => approve([row])} />
        )}
        initialSorting={[{ id: 'dates', desc: false }]}
      />
      <RejectDialog names={rejecting.map((r) => fullName(r.employee))} onCancel={() => setRejecting([])} onConfirm={reject} />
    </>
  )
}
