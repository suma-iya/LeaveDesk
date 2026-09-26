import { Link } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { IconButton } from '@/components/AppButton'
import { LeaveTypeTag } from '@/components/LeaveTypeTag'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate, formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import type { LeaveRequest } from '@/types'
import type { EmployeeList } from './RequestCard'

const col = createColumnHelper<LeaveRequest>()
export const detailsLink = (r: LeaveRequest) => `/me/requests/${r.id}`

/** Columns shared by My leave and History. No request-ID column anywhere. */
export const employeeColumns = (from: EmployeeList) => ({
  type: col.accessor('type', { header: 'Type', cell: ({ getValue }) => <LeaveTypeTag type={getValue()} /> }),
  dates: col.accessor('startDate', {
    id: 'dates', header: 'Dates', meta: { className: 'whitespace-nowrap' },
    cell: ({ row }) => (
      <Link to={detailsLink(row.original)} state={{ from }} className="font-medium text-highlight hover:underline">
        {formatRange(row.original.startDate, row.original.endDate)}
      </Link>
    ),
  }),
  days: col.accessor('workingDays', { header: 'Working days', meta: { className: 'text-right tabular-nums' } }),
  submitted: col.accessor('submittedAt', {
    header: 'Submitted', meta: { className: 'whitespace-nowrap' }, cell: ({ getValue }) => formatDate(getValue().slice(0, 10)),
  }),
  status: col.accessor('status', {
    header: 'Status',
    cell: ({ getValue }) => (
      <span className="flex items-center gap-2">
        <StatusBadge status={getValue()} />
        {getValue() === 'pending' && <span className="text-xs text-muted-foreground">Awaiting HR</span>}
      </span>
    ),
  }),
  decidedBy: col.accessor((r) => (r.decidedBy ? fullName(r.decidedBy) : ''), {
    id: 'decidedBy', header: 'Decided by', meta: { className: 'whitespace-nowrap' },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  note: col.accessor('decisionNote', {
    header: 'Manager note', meta: { className: 'max-w-64' },
    cell: ({ getValue }) => getValue()
      ? <span className="block truncate" title={getValue()}>{getValue()}</span>
      : <span className="text-muted-foreground">—</span>,
  }),
  view: col.display({
    id: 'actions', header: () => <span className="sr-only">Actions</span>, meta: { className: 'text-right' },
    cell: ({ row }) => <IconButton icon={Eye} label="View request" variant="ghost" to={detailsLink(row.original)} />,
  }),
})
