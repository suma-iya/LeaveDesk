import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { formatRange } from '@/lib/dates'
import { typeStyles } from '@/lib/styles'
import { cn } from '@/lib/utils'
import type { LeaveRequest } from '@/types'

export type EmployeeList = 'me' | 'history'

/** Mobile card: type-coloured left border, range, details, badge, chevron. */
export function RequestCard({ request: r, from }: { request: LeaveRequest; from: EmployeeList }) {
  return (
    <Card className={cn('border-l-[3px]', typeStyles[r.type].borderLeft)}>
      <Link to={`/me/requests/${r.id}`} state={{ from }}
        className="flex items-center gap-3 rounded-card p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{formatRange(r.startDate, r.endDate)}</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {r.type} · {r.workingDays} working {r.workingDays === 1 ? 'day' : 'days'}{r.status === 'pending' && ' · Awaiting HR'}
          </span>
        </span>
        <StatusBadge status={r.status} />
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </Card>
  )
}
