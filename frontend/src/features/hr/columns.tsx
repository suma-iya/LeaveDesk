import { Link } from 'react-router-dom'
import { createColumnHelper } from '@tanstack/react-table'
import { Check, Eye, X } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { BalanceBar } from '@/components/BalanceBar'
import { IconButton } from '@/components/AppButton'
import { LeaveTypeTag } from '@/components/LeaveTypeTag'
import { StatusBadge } from '@/components/StatusBadge'
import { formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import type { LeaveRequest, Person } from '@/types'

/** Which list a review page was opened from (back link + breadcrumb). */
export type HrList = 'pending' | 'approved' | 'all'
export const reviewLink = (r: LeaveRequest) => `/hr/requests/${r.id}`

const col = createColumnHelper<LeaveRequest>()

export function PersonCell({ person, size = 32, to }: { person: Person; size?: number; to?: string }) {
  const name = fullName(person)
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} src={person.avatarUrl} size={size} />
      <span className="min-w-0">
        {to ? <Link to={to} className="block truncate font-semibold hover:underline">{name}</Link>
          : <span className="block truncate font-semibold">{name}</span>}
        <span className="block truncate text-xs text-muted-foreground">{person.department?.name ?? 'No department'}</span>
      </span>
    </span>
  )
}

/** Columns for the HR tables. No request-ID column. */
export const hrColumns = (from: HrList) => ({
  employee: col.accessor((r) => fullName(r.employee), { id: 'employee', header: 'Employee', cell: ({ row }) => <PersonCell person={row.original.employee} /> }),
  leave: col.accessor('type', {
    id: 'leave', header: 'Leave',
    cell: ({ row }) => (
      <span className="flex flex-col gap-0.5">
        <LeaveTypeTag type={row.original.type} />
        <Link to={reviewLink(row.original)} state={{ from }} className="text-[13px] whitespace-nowrap text-highlight hover:underline">
          {formatRange(row.original.startDate, row.original.endDate)}
        </Link>
      </span>
    ),
  }),
  days: col.accessor('workingDays', { header: 'Days', meta: { className: 'text-right tabular-nums' } }),
  balance: col.accessor((r) => r.yearly?.used ?? 0, {
    id: 'balance', header: 'Yearly vacation',
    cell: ({ row }) => row.original.yearly && <BalanceBar used={row.original.yearly.used} limit={row.original.yearly.limit} />,
  }),
  status: col.accessor('status', { header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue()} /> }),
  decidedBy: col.accessor((r) => (r.decidedBy ? fullName(r.decidedBy) : ''), {
    id: 'decidedBy', header: 'Decided by', meta: { className: 'whitespace-nowrap' },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  view: col.display({
    id: 'actions', header: () => <span className="sr-only">Actions</span>, meta: { className: 'text-right' },
    cell: ({ row }) => <IconButton icon={Eye} label="View request" variant="ghost" to={reviewLink(row.original)} />,
  }),
})

/** View · Reject · Approve. Reject always sits left of Approve. */
export const decisionColumn = (meId: string, onReject: (r: LeaveRequest) => void, onApprove: (r: LeaveRequest) => void) =>
  col.display({
    id: 'actions', header: () => <span className="sr-only">Actions</span>, meta: { className: 'text-right' },
    cell: ({ row }) => {
      const own = row.original.employee.id === meId
      const name = fullName(row.original.employee)
      return (
        <span className="flex justify-end gap-1">
          <IconButton icon={Eye} label="View request" variant="ghost" to={reviewLink(row.original)} />
          <IconButton icon={X} label={own ? 'Another HR must decide your own request' : `Reject ${name}`} variant="danger" disabled={own} onClick={() => onReject(row.original)} />
          <IconButton icon={Check} label={own ? 'Another HR must decide your own request' : `Approve ${name}`} variant="ok" disabled={own} onClick={() => onApprove(row.original)} />
        </span>
      )
    },
  })
