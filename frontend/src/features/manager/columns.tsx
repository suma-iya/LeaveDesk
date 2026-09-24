import { Link } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { Check, Eye, X } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { BalanceBar } from '@/components/BalanceBar'
import { IconButton } from '@/components/Button'
import { LeaveTypeTag } from '@/components/LeaveTypeTag'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate, formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import type { RequestRow } from '@/types'

/** Which list a review page was opened from (for the back link and breadcrumb). */
export type HrList = 'pending' | 'approved' | 'all'

export const reviewLink = (row: RequestRow) => `/hr/requests/${row.request.id}`

const col = createColumnHelper<RequestRow>()

export function EmployeeCell({ row, size = 34 }: { row: RequestRow; size?: number }) {
  const name = fullName(row.employee)
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} src={row.employee.avatarUrl} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{row.employee.department}</span>
      </span>
    </span>
  )
}

export const hrColumns = (from: HrList) => ({
  employee: col.accessor((r) => fullName(r.employee), {
    id: 'employee', header: 'Employee', cell: ({ row }) => <EmployeeCell row={row.original} />,
  }),
  type: col.accessor((r) => r.request.type, {
    id: 'type', header: 'Leave type', cell: ({ getValue }) => <LeaveTypeTag type={getValue()} />,
  }),
  dates: col.accessor((r) => r.request.startDate, {
    id: 'dates',
    header: 'Dates',
    meta: { className: 'whitespace-nowrap' },
    cell: ({ row }) => (
      <Link to={reviewLink(row.original)} state={{ from }} className="font-medium text-highlight hover:underline">
        {formatRange(row.original.request.startDate, row.original.request.endDate)}
      </Link>
    ),
  }),
  days: col.accessor((r) => r.request.workingDays, {
    id: 'days', header: 'Days', meta: { className: 'text-right tabular-nums' },
  }),
  balance: col.accessor((r) => r.yearly?.used ?? 0, {
    id: 'balance',
    header: 'Yearly vacation',
    cell: ({ row }) => row.original.yearly && <BalanceBar used={row.original.yearly.used} allowance={row.original.yearly.allowance} />,
  }),
  submitted: col.accessor((r) => r.request.submittedAt, {
    id: 'submitted', header: 'Submitted', meta: { className: 'whitespace-nowrap' }, cell: ({ getValue }) => formatDate(getValue()),
  }),
  status: col.accessor((r) => r.request.status, {
    id: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue()} />,
  }),
  decidedBy: col.accessor((r) => r.decidedByName ?? '', {
    id: 'decidedBy', header: 'Decided by', meta: { className: 'whitespace-nowrap' },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  view: col.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    meta: { className: 'text-right' },
    cell: ({ row }) => (
      <IconButton icon={Eye} label="View application" variant="ghost" to={reviewLink(row.original)} />
    ),
  }),
})

/** View / Reject / Approve, right-aligned. Reject always sits left of Approve. */
export const decisionColumn = (onReject: (row: RequestRow) => void, onApprove: (row: RequestRow) => void, busy: boolean) =>
  col.display({
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    meta: { className: 'text-right' },
    cell: ({ row }) => (
      <span className="flex justify-end gap-1.5">
        <IconButton icon={Eye} label="View application" variant="ghost" to={reviewLink(row.original)} />
        <IconButton icon={X} label={`Reject ${fullName(row.original.employee)}`} variant="danger" disabled={busy} onClick={() => onReject(row.original)} />
        <IconButton icon={Check} label={`Approve ${fullName(row.original.employee)}`} variant="ok" disabled={busy} onClick={() => onApprove(row.original)} />
      </span>
    ),
  })
