import { Link } from 'react-router-dom'
import { Check, ChevronRight, X } from 'lucide-react'
import { BalanceBar } from '@/components/BalanceBar'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import type { RequestRow } from '@/types'
import { Avatar } from '@/components/Avatar'
import { reviewLink, type HrList } from './columns'

function Summary({ row, from }: { row: RequestRow; from: HrList }) {
  const r = row.request
  return (
    <Link to={reviewLink(row)} state={{ from }} className="flex items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Avatar name={fullName(row.employee)} src={row.employee.avatarUrl} size={42} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{fullName(row.employee)}</span>
        <span className="block truncate text-[13px] text-muted-foreground">
          {r.type} · {formatRange(r.startDate, r.endDate)} · {r.workingDays}d
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-label="Open application" />
    </Link>
  )
}

/** Mobile card for a pending request: summary, balance, Reject | Approve. */
export function PendingCard({ row, onReject, onApprove, busy }: {
  row: RequestRow; onReject: () => void; onApprove: () => void; busy: boolean
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <Summary row={row} from="pending" />
      {row.yearly && <BalanceBar used={row.yearly.used} allowance={row.yearly.allowance} className="w-full" />}
      <div className="grid grid-cols-2 gap-2">
        <Button icon={X} label="Reject" variant="danger" disabled={busy} onClick={onReject} />
        <Button icon={Check} label="Approve" variant="ok" disabled={busy} onClick={onApprove} />
      </div>
    </Card>
  )
}

/** Mobile card for a decided request. */
export function DecidedCard({ row, from }: { row: RequestRow; from: HrList }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <Summary row={row} from={from} />
      <div className="flex items-center justify-between gap-2 pl-[54px] text-[13px] text-muted-foreground">
        <StatusBadge status={row.request.status} />
        {row.decidedByName && <span className="truncate">by {row.decidedByName}</span>}
      </div>
    </Card>
  )
}
