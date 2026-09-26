import { Link } from 'react-router-dom'
import { Check, ChevronRight, X } from 'lucide-react'
import { AppButton } from '@/components/AppButton'
import { Avatar } from '@/components/Avatar'
import { BalanceBar } from '@/components/BalanceBar'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { TYPE_LABEL } from '@/lib/leave'
import type { LeaveRequest } from '@/types'
import { reviewLink, type HrList } from './columns'

/** Mobile card for any HR table row; pending rows get Reject | Approve. */
export function HrRequestCard({ request: r, from, own, onReject, onApprove }: {
  request: LeaveRequest; from: HrList; own?: boolean; onReject?: () => void; onApprove?: () => void
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <Link to={reviewLink(r)} state={{ from }} className="flex items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Avatar name={fullName(r.employee)} src={r.employee.avatarUrl} size={42} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{fullName(r.employee)}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{TYPE_LABEL[r.type]} · {formatRange(r.startDate, r.endDate)} · {r.workingDays}d</span>
        </span>
        {r.status !== 'pending' && <StatusBadge status={r.status} />}
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-label="Open request" />
      </Link>
      {r.yearly && <BalanceBar used={r.yearly.used} limit={r.yearly.limit} width="full" />}
      {onReject && onApprove && (own ? (
        <p className="text-[13px] text-muted-foreground">Another HR must decide your own request.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <AppButton icon={X} label="Reject" variant="danger" onClick={onReject} />
          <AppButton icon={Check} label="Approve" variant="ok" onClick={onApprove} />
        </div>
      ))}
    </Card>
  )
}
