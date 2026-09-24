import { Link } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { IconButton } from '@/components/Button'
import { LeaveTypeTag } from '@/components/LeaveTypeTag'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate, formatRange } from '@/lib/dates'
import type { RequestRow } from '@/types'
import type { EmployeeList } from './RequestCard'

const col = createColumnHelper<RequestRow>()
export const detailsLink = (row: RequestRow) => `/me/requests/${row.request.id}`

export const employeeColumns = (from: EmployeeList) => ({
  type: col.accessor((r) => r.request.type, { id: 'type', header: 'Type', cell: ({ getValue }) => <LeaveTypeTag type={getValue()} /> }),
  dates: col.accessor((r) => r.request.startDate, {
    id: 'dates', header: 'Dates', meta: { className: 'whitespace-nowrap' },
    cell: ({ row }) => (
      <Link to={detailsLink(row.original)} state={{ from }} className="font-medium text-highlight hover:underline">
        {formatRange(row.original.request.startDate, row.original.request.endDate)}
      </Link>
    ),
  }),
  days: col.accessor((r) => r.request.workingDays, { id: 'days', header: 'Working days', meta: { className: 'text-right tabular-nums' } }),
  submitted: col.accessor((r) => r.request.submittedAt, {
    id: 'submitted', header: 'Submitted', meta: { className: 'whitespace-nowrap' }, cell: ({ getValue }) => formatDate(getValue()),
  }),
  status: col.accessor((r) => r.request.status, {
    id: 'status', header: 'Status',
    cell: ({ getValue }) => (
      <span className="flex items-center gap-2">
        <StatusBadge status={getValue()} />
        {getValue() === 'pending' && <span className="text-xs text-muted-foreground">Awaiting HR</span>}
      </span>
    ),
  }),
  decidedBy: col.accessor((r) => r.decidedByName ?? '', {
    id: 'decidedBy', header: 'Decided by', meta: { className: 'whitespace-nowrap' },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  note: col.accessor((r) => r.request.decisionNote ?? '', {
    id: 'note', header: 'Manager note', enableSorting: false, meta: { className: 'max-w-64' },
    cell: ({ getValue }) => getValue()
      ? <span className="block truncate" title={getValue()}>{getValue()}</span>
      : <span className="text-muted-foreground">—</span>,
  }),
  view: col.display({
    id: 'actions', header: () => <span className="sr-only">Actions</span>, meta: { className: 'text-right' },
    cell: ({ row }) => <IconButton icon={Eye} label="View request" variant="ghost" to={detailsLink(row.original)} />,
  }),
})
